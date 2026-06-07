import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, updateJson, uid } from './lib/jsonStore.js';
import { cleanText, cleanAge, sanitizeMedia, emailKey, cleanRiotId } from './lib/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadLocalEnv();
const app = express();
// Express の既定ヘッダ "X-Powered-By: Express" を消し、サーバー実装の露出を減らす。
app.disable('x-powered-by');
const port = envInt('PORT', 3001, { min: 1, max: 65535 });
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function envInt(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    console.warn(`[config] Invalid ${name}; using ${fallback}.`);
    return fallback;
  }
  return value;
}

function toNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function validateProductionConfig() {
  if (!isProduction) return;
  const missing = [
    'CLIENT_ORIGIN',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID'
  ].filter((key) => !process.env[key]);
  if (missing.length) {
    console.warn(`[production config] Missing environment variables: ${missing.join(', ')}`);
  }
}

// PaaS / ロードバランサ背後では X-Forwarded-For を信頼して実IPを得る。
// レート制限を正しくIP単位で効かせるために必要。
if (isProduction) app.set('trust proxy', 1);

// シンプルなインメモリ・レート制限（固定ウィンドウ）。
// 注意: 複数インスタンス構成では各インスタンスごとの制限になる。
// 本格運用では Redis ベース等の共有ストアへ置き換える。
function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}
