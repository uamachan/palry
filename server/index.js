import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, updateJson, uid } from './lib/jsonStore.js';
import { cleanText, cleanAge, cleanRiotId, sanitizeMedia, emailKey } from './lib/validation.js';

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

function accountRateLimitKey(req) {
  return req.authedUser?.id ? `user:${req.authedUser.id}` : `ip:${requestIp(req)}`;
}

function rateLimit({ windowMs, max, message, keyGenerator }) {
  const limitWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60 * 1000;
  const limitMax = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
  const hits = new Map(); // key -> { count, resetAt }
  // 期限切れエントリを定期的に掃除してメモリ増加を防ぐ。
  const cleaner = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, limitWindowMs);
  cleaner.unref?.(); // この timer でプロセスを生かし続けない
  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator ? keyGenerator(req) : `ip:${requestIp(req)}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + limitWindowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limitMax) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message: message || 'リクエストが多すぎます。しばらくしてからお試しください。' });
    }
    next();
  };
}

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '8mb' }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  }
}));
// Content-Security-Policy（本番のみ）。XSS 時の被害を抑える。
// Firebase 認証（Google ログインの iframe/gapi）と data URL の写真/音声を
// 壊さないよう必要な origin だけ許可する。開発は Vite の HMR/inline を壊すため付与しない。
const firebaseAuthDomain = cleanText(process.env.VITE_FIREBASE_AUTH_DOMAIN, 200);
// アナリティクス/監視を有効化した時に必要なドメインを CSP に足す。
// GA（VITE_GA_ID）が設定されていれば GA ドメインを自動許可。
// それ以外は CSP_SCRIPT_SRC_EXTRA / CSP_CONNECT_SRC_EXTRA（スペース区切り）で注入する。
const gaEnabled = Boolean(cleanText(process.env.VITE_GA_ID, 60));
const gaScriptSrc = gaEnabled ? ' https://www.googletagmanager.com' : '';
const gaConnectSrc = gaEnabled ? ' https://www.google-analytics.com https://*.google-analytics.com https://*.googletagmanager.com' : '';
const extraScriptSrc = process.env.CSP_SCRIPT_SRC_EXTRA ? ` ${process.env.CSP_SCRIPT_SRC_EXTRA.trim()}` : '';
const extraConnectSrc = process.env.CSP_CONNECT_SRC_EXTRA ? ` ${process.env.CSP_CONNECT_SRC_EXTRA.trim()}` : '';
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' https://apis.google.com${gaScriptSrc}${extraScriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.googleapis.com${gaConnectSrc}${extraConnectSrc}`,
  `frame-src 'self' ${firebaseAuthDomain ? `https://${firebaseAuthDomain} ` : ''}https://*.firebaseapp.com https://accounts.google.com https://apis.google.com`,
  "worker-src 'self' blob:"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=()');
  if (isProduction) {
    res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    // HTTPS を強制し、中間者攻撃や HTTP へのダウングレードを防ぐ（2年・サブドメイン含む）。
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

// 全 API への緩めの制限と、認証系エンドポイントへの厳しめの制限。
const RATE_LIMIT_API_PER_MIN = envInt('RATE_LIMIT_API_PER_MIN', 120, { min: 1, max: 10000 });
const RATE_LIMIT_AUTH_PER_MIN = envInt('RATE_LIMIT_AUTH_PER_MIN', 20, { min: 1, max: 1000 });
const RATE_LIMIT_REPORT_PER_MIN = envInt('RATE_LIMIT_REPORT_PER_MIN', 10, { min: 1, max: 1000 });
const RATE_LIMIT_DM_PER_MIN = envInt('RATE_LIMIT_DM_PER_MIN', 30, { min: 1, max: 1000 });
const MAX_REPORTS_PER_DAY = envInt('MAX_REPORTS_PER_DAY', 20, { min: 1, max: 1000 });
const REPORT_AUTO_HIDE_THRESHOLD = envInt('REPORT_AUTO_HIDE_THRESHOLD', 3, { min: 1, max: 1000 });
const MAX_AUDIT_EVENTS = envInt('MAX_AUDIT_EVENTS', 5000, { min: 100, max: 100000 });
const MAX_REPORTS_STORED = envInt('MAX_REPORTS_STORED', 10000, { min: 100, max: 200000 });
const MAX_MESSAGES_STORED = envInt('MAX_MESSAGES_STORED', 50000, { min: 1000, max: 500000 });
const DM_THREAD_MESSAGE_LIMIT = envInt('DM_THREAD_MESSAGE_LIMIT', 100, { min: 1, max: 500 });
const DM_THREADS_LIMIT = envInt('DM_THREADS_LIMIT', 100, { min: 1, max: 500 });
const RECEIVED_LIKES_LIMIT = envInt('RECEIVED_LIKES_LIMIT', 200, { min: 1, max: 1000 });
const ADMIN_REPORTS_LIMIT = envInt('ADMIN_REPORTS_LIMIT', 200, { min: 1, max: 1000 });

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: RATE_LIMIT_API_PER_MIN });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: RATE_LIMIT_AUTH_PER_MIN, message: '認証の試行が多すぎます。しばらくしてからお試しください。' });
const reportLimiter = rateLimit({ windowMs: 60 * 1000, max: RATE_LIMIT_REPORT_PER_MIN, keyGenerator: accountRateLimitKey, message: '通報の送信が多すぎます。しばらくしてからお試しください。' });
const dmLimiter = rateLimit({ windowMs: 60 * 1000, max: RATE_LIMIT_DM_PER_MIN, keyGenerator: accountRateLimitKey, message: 'メッセージの送信が多すぎます。しばらくしてからお試しください。' });
app.use('/api', apiLimiter);

validateProductionConfig();

const plans = {
  FREE: {
    name: 'FREE',
    price: 0,
    likeLimit: 10,
    superLimit: 1,
    dualLimit: 5,
    genderFilter: false,
    unlimited: false,
    features: ['通常LIKE 10回/day', 'SUPER LIKE 1回/day', '両LIKE 5回', 'マッチ後DM']
  },
  PLUS: {
    name: 'PLUS',
    price: 980,
    likeLimit: 40,
    superLimit: 5,
    dualLimit: 10,
    genderFilter: true,
    unlimited: false,
    features: ['LIKE 40回/day', 'SUPER LIKE 5回/day', '両LIKE 10回', '性別指定フィルター', '足あと閲覧']
  },
  VIP: {
    name: 'VIP',
    price: 1980,
    likeLimit: 'unlimited',
    superLimit: 'unlimited',
    dualLimit: 'unlimited',
    genderFilter: true,
    unlimited: true,
    features: ['全制限解除', 'LIKE無制限', 'SUPER/両LIKE無制限', '性別指定フィルター', '上位表示']
  }
};

const singleItems = [
  { name: '性別指定フィルター7日', price: 400, detail: 'FREEでも7日間だけ表示性別を指定できます。' },
  { name: 'ブースト24時間', price: 300, detail: 'プロフィールを表示候補に出やすくします。' },
  { name: 'SUPER LIKE 3回', price: 500, detail: '相手に強めのLIKEを送れます。' },
  { name: 'プロフィール目立たせ7日', price: 700, detail: '検索・候補カードで視認性を上げます。' }
];

// 単発課金の効果定義。timed = 期限付き特典 / consumable = 回数消費型。
const DAY_MS = 24 * 60 * 60 * 1000;
const singleItemConfig = {
  '性別指定フィルター7日': { perk: 'genderFilter', kind: 'timed', durationMs: 7 * DAY_MS },
  'ブースト24時間': { perk: 'boost', kind: 'timed', durationMs: DAY_MS },
  'SUPER LIKE 3回': { perk: 'superCredits', kind: 'consumable', count: 3 },
  'プロフィール目立たせ7日': { perk: 'spotlight', kind: 'timed', durationMs: 7 * DAY_MS }
};

const allowedGenders = ['男性', '女性', 'その他/未設定'];
const valorantRanks = [
  'Unranked',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant'
];
const valorantRoles = ['デュエリスト', 'イニシエーター', 'コントローラー', 'センチネル'];
const regions = ['北海道', '東北', '関東', '甲信越', '北陸', '東海', '近畿', '中国', '四国', '九州', '沖縄', '海外'];
const allowedVcs = ['なし', 'Discord', 'Skype', 'その他'];
const allowedMaps = ['アセント', 'スプリット', 'ヘイヴン', 'バインド', 'アイスボックス', 'ブリーズ', 'フラクチャー', 'パール', 'ロータス', 'サンセット', 'アビス', 'カロード'];
const allowedWeapons = ['Vandal', 'Phantom', 'Operator', 'Sheriff', 'Ghost', 'Marshal', 'Judge', 'Odin'];

function sanitizeMapsField(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v) => allowedMaps.includes(cleanText(v, 30))).slice(0, 5);
}
const rankAliases = new Map([
  ['Iron', 'Iron 1'],
  ['Bronze', 'Bronze 1'],
  ['Silver', 'Silver 1'],
  ['Gold', 'Gold 1'],
  ['Platinum', 'Platinum 1'],
  ['Diamond', 'Diamond 1'],
  ['Ascendant', 'Ascendant 1'],
  ['Immortal', 'Immortal 1']
]);

function enumValue(value, allowed, fallback = '') {
  const normalized = cleanText(value, 60);
  return allowed.includes(normalized) ? normalized : fallback;
}

// クライアントの AGE_RANGES と一致させる。数値年齢（旧形式）も後方互換で受け付ける。
const AGE_RANGE_OPTIONS = ['10代', '20代前半', '20代後半', '30代', '40代以上'];
function cleanAgeField(value) {
  const text = cleanText(value, 20);
  if (AGE_RANGE_OPTIONS.includes(text)) return text;
  return cleanAge(text); // 後方互換：数値年齢 13〜80
}

function normalizeGender(gender) {
  return enumValue(gender, allowedGenders, 'その他/未設定');
}

function normalizeRank(rank) {
  const value = cleanText(rank, 60);
  return enumValue(rankAliases.get(value) || value, valorantRanks, 'Gold 1');
}

function normalizeRole(role) {
  return enumValue(role, valorantRoles, 'デュエリスト');
}

function normalizeRegion(region) {
  return enumValue(region, regions, '');
}

function validateProfileEnums(payload, existing = {}) {
  const gender = enumValue(payload.gender, allowedGenders);
  if (!gender) return { status: 400, message: '性別の値が不正です。' };
  const region = enumValue(payload.region, regions);
  if (!region) return { status: 400, message: '地域の値が不正です。' };
  const rankInput = cleanText(payload.rank || existing.rank || 'Gold 1', 60);
  const rank = enumValue(rankAliases.get(rankInput) || rankInput, valorantRanks);
  if (!rank) return { status: 400, message: 'ランクの値が不正です。' };
  const role = enumValue(payload.role || existing.role || 'デュエリスト', valorantRoles);
  if (!role) return { status: 400, message: 'ロールの値が不正です。' };
  return { gender, region, rank, role };
}

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function sameDay(isoA, isoB = new Date().toISOString()) {
  return isoA?.slice(0, 10) === isoB.slice(0, 10);
}

function countTodayUsage(likes, userId, type) {
  return likes.filter((like) => like.userId === userId && like.type === type && sameDay(like.createdAt)).length;
}

function quotaFor(planName, type) {
  const plan = plans[planName] || plans.FREE;
  if (plan.unlimited) return Infinity;
  if (type === 'super') return plan.superLimit;
  if (type === 'dual') return plan.dualLimit;
  return plan.likeLimit;
}

function weightedShuffle(profiles, planName, boostedIds = new Set()) {
  const planBonus = planName === 'VIP' ? 0.08 : planName === 'PLUS' ? 0.04 : 0;
  return [...profiles]
    .map((profile) => {
      // 閲覧者の性別に関わらず、女性候補は候補順位を下げてマッチ機会を抑制する。
      // 値を大きくするほど女性が下位（=後ろのカード）に回り、マッチしにくくなる。
      const femaleGuard = profile.gender === '女性' ? 0.5 : 0;
      // ブースト/目立たせ購入者は候補上位に出やすくする。
      const boostBonus = boostedIds.has(profile.id) ? 0.5 : 0;
      const score = Math.random() + Number(profile.matchScore || 70) / 100 + planBonus - femaleGuard + boostBonus;
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.profile);
}

// cleanText / cleanAge / sanitizeMedia / emailKey は ./lib/validation.js に集約（単体テスト対象）。

// 本番環境では ENABLE_DEMO_PURCHASE=true を明示しないと決済を通さない（フェイルクローズ）。
function isDemoPaymentAllowed() {
  return !isProduction || process.env.ENABLE_DEMO_PURCHASE === 'true';
}

function publicUser(user) {
  // 内部識別子・認証関連の秘密はクライアントへ返さない。
  // firebaseUid はサーバー内部の紐付け専用でフロントは使用しない。
  const { authCode, authCodeHash, authCodeSalt, otpSecret, firebaseUid, ...safeUser } = user;
  return safeUser;
}

function isVisibleUser(user) {
  return Boolean(user?.firebaseUid) && !user.autoHidden;
}

function pairBlocked(blocks, aId, bId) {
  return blocks.some((block) =>
    (block.userId === aId && block.profileId === bId) ||
    (block.userId === bId && block.profileId === aId)
  );
}

// 管理者メール許可リスト（ADMIN_EMAILS=a@x.com,b@y.com）。
// 未設定なら誰も管理者でない（管理APIは全拒否＝フェイルクローズ）。
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
function isAdmin(user) {
  return adminEmails.size > 0 && adminEmails.has(emailKey(user?.email));
}

// 通報の悪用対策しきい値（環境変数で調整可能）。
// MAX_REPORTS_PER_DAY: 1アカウントが1日に出せる通報数の上限（大量通報の抑止／永続=reports.json基準）。
// REPORT_AUTO_HIDE_THRESHOLD: 異なる通報者がこの人数に達したら候補から自動非表示にする。
const REPORT_AUTO_HIDE_WINDOW_MS = 30 * DAY_MS;

function clientIp(req) {
  return requestIp(req);
}

// 監査ログ（append-only・上限5000件）。ブロック/通報/管理操作などの追跡用。
// 書き込み失敗でメインのリクエストを止めないよう内部で握りつぶす（fire-and-forget可）。
function appendAudit(action, actorId, targetId, meta = {}) {
  return updateJson('audit.json', [], (log) => {
    const entry = { id: uid('audit'), action, actorId: actorId || null, targetId: targetId || null, meta, createdAt: new Date().toISOString() };
    const next = [entry, ...log];
    return { value: next.length > MAX_AUDIT_EVENTS ? next.slice(0, MAX_AUDIT_EVENTS) : next, result: entry };
  }).catch((error) => console.error('[audit] write failed', error));
}

async function findAndLinkFirebaseProfile(firebaseUser) {
  let profile = null;
  const firebaseUid = cleanText(firebaseUser.uid, 120);
  const firebaseEmail = cleanText(firebaseUser.email, 120);
  const firebaseEmailKey = emailKey(firebaseEmail);

  await updateJson('users.json', [], (users) => {
    const byUid = users.find((user) => user.firebaseUid === firebaseUid);
    if (byUid) {
      profile = byUid;
      return { value: undefined, result: profile };
    }

    const byEmailIndex = users.findIndex((user) => firebaseEmailKey && emailKey(user.email) === firebaseEmailKey);
    if (byEmailIndex < 0) return { value: undefined, result: null };

    // メール一致での自動リンクは「メール所有を証明済み（emailVerified）」の時だけ許可。
    // 未確認メールでリンクを許すと、攻撃者が被害者のメールで未確認アカウントを作り
    // 既存プロフィールを自分の firebaseUid に奪える（アカウント乗っ取り）。
    if (!firebaseUser.emailVerified) return { value: undefined, result: null };

    const existing = users[byEmailIndex];
    const updated = {
      ...existing,
      firebaseUid,
      email: firebaseEmail || existing.email,
      firebaseLinkedAt: existing.firebaseLinkedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const next = [...users];
    next[byEmailIndex] = updated;
    profile = updated;
    return { value: next, result: profile };
  });

  return profile;
}

function userToProfile(user) {
  const hasVoiceIntro = Boolean(user.voiceIntro);
  return {
    id: user.id,
    name: user.name,
    gender: normalizeGender(user.gender),
    ageRange: user.age ? (/^\d+$/.test(user.age) ? `${user.age}歳` : user.age) : '年齢未設定',
    region: normalizeRegion(user.region),
    rank: normalizeRank(user.rank),
    peakRank: normalizeRank(user.peakRank || user.rank),
    role: normalizeRole(user.role),
    riotId: user.riotId || '',
    tags: Array.isArray(user.tags) ? user.tags : [],
    modes: Array.isArray(user.modes) ? user.modes : [],
    agents: Array.isArray(user.agents) ? user.agents : [],
    xHandle: user.xHandle || '',
    vc: user.vc || '',
    maps: Array.isArray(user.maps) ? user.maps : [],
    favoriteWeapon: user.favoriteWeapon || '',
    profilePhoto: user.profilePhoto || '',
    bio: user.bio || '',
    voiceIntro: user.voiceIntro || '',
    voice: user.voice || (hasVoiceIntro ? '声の自己紹介あり' : '未設定'),
    activeTime: user.activeTime || '',
    trust: user.verified ? 90 : 72,
    verified: Boolean(user.verified),
    reasons: Array.isArray(user.reasons) ? user.reasons : [],
    matchScore: 82,
    matchChance: 0.3,
    guarded: false,
    opener: `${user.name}さんとマッチしました！`
  };
}

// 候補はログイン可能な実アカウントのみ（firebaseUid あり、自分を除く）。
// ダミー profiles.json や firebaseUid を持たない旧テストユーザーは、
// いいねを受け取って返せないため候補から除外する。
async function readCandidateProfiles(excludeUserId = '') {
  const users = await readJson('users.json', []);
  return users
    // autoHidden（複数通報で自動非表示）は新規候補から除外する。既存マッチ/DMには影響しない。
    .filter((user) => isVisibleUser(user) && user.id !== excludeUserId)
    .map((user) => ({ ...userToProfile(user), isRealUser: true }));
}

// --- 単発課金の特典（エンタイトルメント） ---

// あるユーザーの有効な特典を集計する。timed は期限内、consumable は残数を合算。
function activeEntitlements(singlePurchases, userId, now = Date.now()) {
  const result = { genderFilter: false, boost: false, spotlight: false, superCredits: 0 };
  for (const p of singlePurchases) {
    if (p.userId !== userId) continue;
    if (p.kind === 'timed') {
      if (p.expiresAt && new Date(p.expiresAt).getTime() > now && (p.perk in result)) {
        result[p.perk] = true;
      }
    } else if (p.kind === 'consumable' && p.perk === 'superCredits') {
      result.superCredits += toNonNegativeInt(p.remaining, 0);
    }
  }
  return result;
}

// boost / spotlight が有効なユーザーID集合（候補ランキングの優先表示用）。
function boostedUserIds(singlePurchases, now = Date.now()) {
  const ids = new Set();
  for (const p of singlePurchases) {
    if (p.kind === 'timed' && (p.perk === 'boost' || p.perk === 'spotlight')
      && p.expiresAt && new Date(p.expiresAt).getTime() > now) {
      ids.add(p.userId);
    }
  }
  return ids;
}

// --- 実プレイヤー同士の接続（双方向マッチング）ヘルパー ---

function isRealUserId(id, users) {
  return users.some((user) => user.id === id);
}

// received_likes の1件を組み立てる。
// fromProfile = いいねを「送った側」のプロフィール、forUserId = 受け取る側のユーザーID。
function buildReceivedLikeEntry(fromProfile, forUserId, likeType) {
  return {
    id: uid('rl'),
    forUserId,
    fromProfileId: fromProfile.id,
    fromProfileName: fromProfile.name,
    fromPhoto: fromProfile.profilePhoto || '',
    fromRank: fromProfile.rank || '',
    fromRole: fromProfile.role || '',
    fromGender: fromProfile.gender || '',
    fromAgeRange: fromProfile.ageRange || '',
    likeType,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
}

function pairAlreadyMatched(matches, aId, bId) {
  return matches.some((m) =>
    (m.userId === aId && m.profileId === bId) ||
    (m.userId === bId && m.profileId === aId));
}

function userHasLiked(likes, userId, profileId) {
  return likes.some((like) => like.userId === userId && like.profileId === profileId);
}

function makeMatchRow(ownerUserId, otherProfile, conversationId, isRealUser) {
  return {
    id: uid('match'),
    userId: ownerUserId,
    profileId: otherProfile.id,
    profileName: otherProfile.name,
    profilePhoto: otherProfile.profilePhoto || '',
    profileRank: otherProfile.rank || '',
    profileRole: otherProfile.role || '',
    profileGender: otherProfile.gender || '',
    profileAgeRange: otherProfile.ageRange || '',
    profileRegion: otherProfile.region || '',
    profileBio: otherProfile.bio || '',
    profileRiotId: otherProfile.riotId || '',
    profileXHandle: otherProfile.xHandle || '',
    profileTags: Array.isArray(otherProfile.tags) ? otherProfile.tags : [],
    profileAgents: Array.isArray(otherProfile.agents) ? otherProfile.agents : [],
    profileVc: otherProfile.vc || '',
    profileMaps: Array.isArray(otherProfile.maps) ? otherProfile.maps : [],
    profileFavoriteWeapon: otherProfile.favoriteWeapon || '',
    opener: `${otherProfile.name}さんとマッチしました！`,
    dmUnlocked: true,
    conversationId,
    isRealUser: Boolean(isRealUser),
    createdAt: new Date().toISOString()
  };
}

// 相互いいねが成立している場合だけ、2人の実ユーザー間に双方向のマッチ行を作る。
// 相互判定（likes.json 読み取り）とマッチ作成を matches.json の updateJson 内で
// 行うことで直列化し、A→B と B→A の同時いいねで二重 pending になる競合を防ぐ。
// 既にマッチ済み or 新規作成後、対象ペア両側のマッチ行を返す（未成立なら空配列）。
async function tryCreateMutualMatch(userA, userB) {
  if (userA?.autoHidden || userB?.autoHidden) return [];
  await updateJson('matches.json', [], async (matches) => {
    if (pairAlreadyMatched(matches, userA.id, userB.id)) {
      return { value: undefined, result: false };
    }
    const likes = await readJson('likes.json', []);
    const reciprocal =
      likes.some((l) => l.userId === userA.id && l.profileId === userB.id) &&
      likes.some((l) => l.userId === userB.id && l.profileId === userA.id);
    if (!reciprocal) return { value: undefined, result: false };
    const conversationId = uid('conv');
    const rowForA = makeMatchRow(userA.id, userToProfile(userB), conversationId, true);
    const rowForB = makeMatchRow(userB.id, userToProfile(userA), conversationId, true);
    return { value: [rowForB, rowForA, ...matches], result: true };
  });
  const matches = await readJson('matches.json', []);
  return matches.filter((m) =>
    (m.userId === userA.id && m.profileId === userB.id) ||
    (m.userId === userB.id && m.profileId === userA.id));
}

// 対象ペア間で pending のままの received_likes を accepted に変える。
async function resolvePendingBetween(userAId, userBId) {
  await updateJson('received_likes.json', [], (received) => {
    let changed = false;
    const next = received.map((r) => {
      const betweenPair =
        (r.forUserId === userAId && r.fromProfileId === userBId) ||
        (r.forUserId === userBId && r.fromProfileId === userAId);
      if (betweenPair && r.status === 'pending') {
        changed = true;
        return { ...r, status: 'accepted', acceptedAt: new Date().toISOString() };
      }
      return r;
    });
    return { value: changed ? next : undefined, result: changed };
  });
}

async function setReceivedLikesFromUserStatus(fromUserId, hidden) {
  const now = new Date().toISOString();
  return updateJson('received_likes.json', [], (received) => {
    let changed = false;
    const next = received.map((item) => {
      if (item.fromProfileId !== fromUserId) return item;
      if (hidden && item.status === 'pending') {
        changed = true;
        return { ...item, status: 'auto_hidden', autoHiddenAt: now };
      }
      if (!hidden && item.status === 'auto_hidden') {
        changed = true;
        return { ...item, status: 'pending', unhiddenAt: now };
      }
      return item;
    });
    return { value: changed ? next : undefined, result: changed };
  });
}

// あるメッセージが、ある人の視点で「自分が送った」ものかを判定。
function senderFor(message, viewerUserId) {
  if (message.senderUserId) return message.senderUserId === viewerUserId ? 'user' : 'match';
  return message.sender || 'match'; // 旧データ互換
}

// メッセージがそのマッチ（会話）に属するか。conversationId 優先、旧データは matchId。
function messageBelongsToMatch(message, match) {
  const convId = match.conversationId || match.id;
  if (message.conversationId) return message.conversationId === convId;
  return message.matchId === match.id;
}

// 検証済みトークンの短期キャッシュ。
// 認証付きリクエストごとに Google Identity Toolkit を呼ぶとレイテンシ・コスト・
// レート制限の負担が大きいため、トークン単位で短時間キャッシュする。
// TTL はトークン有効期限（約1時間）より十分短くする。
const TOKEN_CACHE_TTL_MS = envInt('TOKEN_CACHE_TTL_MS', 5 * 60 * 1000, { min: 1000, max: 60 * 60 * 1000 });
const TOKEN_CACHE_MAX = 5000;
const tokenCache = new Map(); // token -> { value, expiresAt }
let firebaseAdminAuthPromise = null;

function getCachedIdentity(token) {
  const hit = tokenCache.get(token);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    tokenCache.delete(token);
    return null;
  }
  return hit.value;
}

function setCachedIdentity(token, value) {
  // 単純なサイズ上限。超えたら最古を1件捨てる（挿入順 Map）。
  if (tokenCache.size >= TOKEN_CACHE_MAX) {
    const oldestKey = tokenCache.keys().next().value;
    if (oldestKey !== undefined) tokenCache.delete(oldestKey);
  }
  tokenCache.set(token, { value, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}

function hasFirebaseAdminConfig() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
    || process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

function readFirebaseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8')
      : '');
  if (!raw) return null;
  try {
    const credential = JSON.parse(raw);
    if (typeof credential.private_key === 'string') {
      credential.private_key = credential.private_key.replace(/\\n/g, '\n');
    }
    return credential;
  } catch {
    const error = new Error('Firebase Admin service accountのJSONが不正です。');
    error.status = 500;
    throw error;
  }
}

async function getFirebaseAdminAuth() {
  if (!hasFirebaseAdminConfig()) return null;
  if (!firebaseAdminAuthPromise) {
    firebaseAdminAuthPromise = (async () => {
      const [{ applicationDefault, cert, getApps, initializeApp }, { getAuth }] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth')
      ]);
      if (!getApps().length) {
        const serviceAccount = readFirebaseServiceAccount();
        initializeApp({
          credential: serviceAccount ? cert(serviceAccount) : applicationDefault()
        });
      }
      return getAuth();
    })().catch((error) => {
      firebaseAdminAuthPromise = null;
      const wrapped = new Error(error.message || 'Firebase Admin SDKの初期化に失敗しました。');
      wrapped.status = error.status || 500;
      throw wrapped;
    });
  }
  return firebaseAdminAuthPromise;
}

async function verifyWithFirebaseAdmin(token) {
  const auth = await getFirebaseAdminAuth();
  if (!auth) return null;
  try {
    const decoded = await auth.verifyIdToken(token, process.env.FIREBASE_CHECK_REVOKED_TOKENS === 'true');
    return {
      uid: cleanText(decoded.uid, 120),
      email: cleanText(decoded.email, 120),
      emailVerified: Boolean(decoded.email_verified)
    };
  } catch {
    const error = new Error('Firebase認証の確認に失敗しました。再ログインしてください。');
    error.status = 401;
    throw error;
  }
}

async function verifyFirebaseIdentity(idToken) {
  const token = cleanText(idToken, 4096);
  if (!token) {
    const error = new Error('Firebase ID tokenが必要です。');
    error.status = 401;
    throw error;
  }
  const cached = getCachedIdentity(token);
  if (cached) return cached;

  const adminIdentity = await verifyWithFirebaseAdmin(token);
  if (adminIdentity) {
    setCachedIdentity(token, adminIdentity);
    return adminIdentity;
  }

  const apiKey = cleanText(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY, 200);
  if (!apiKey) {
    const error = new Error('Firebase Web API Keyがサーバーに設定されていません。');
    error.status = 500;
    throw error;
  }
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.users?.length) {
    const error = new Error('Firebase認証の確認に失敗しました。再ログインしてください。');
    error.status = 401;
    throw error;
  }
  const firebaseUser = payload.users[0];
  const identity = {
    uid: cleanText(firebaseUser.localId, 120),
    email: cleanText(firebaseUser.email, 120),
    emailVerified: Boolean(firebaseUser.emailVerified)
  };
  setCachedIdentity(token, identity);
  return identity;
}

async function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return res.status(401).json({ message: '認証が必要です。再ログインしてください。' });
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdentity(token);
  } catch (error) {
    return res.status(error.status || 401).json({ message: error.message || '認証に失敗しました。' });
  }
  if (!firebaseUser.emailVerified) return res.status(403).json({ message: 'メール認証を完了してください。' });
  const user = await findAndLinkFirebaseProfile(firebaseUser);
  if (!user) return res.status(404).json({ message: 'Pairlyプロフィールが見つかりません。' });
  req.authedUser = user;
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Pairly API', framework: 'React + Vite + Express' });
});

app.get('/api/plans', (req, res) => {
  res.json({ plans, singleItems });
});

app.post('/api/register', authLimiter, async (req, res) => {
  const payload = req.body || {};
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdentity(payload.idToken);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Firebase認証の確認に失敗しました。' });
  }
  if (!firebaseUser.emailVerified) return res.status(403).json({ message: 'メール認証を完了してからプロフィールを作成してください。' });
  const existingProfile = await findAndLinkFirebaseProfile(firebaseUser);
  if (existingProfile) {
    return res.json({ user: { ...publicUser(existingProfile), isAdmin: isAdmin(existingProfile) }, message: '保存済みプロフィールでログインしました。' });
  }
  if (!payload.gender) return res.status(400).json({ message: '性別選択が必要です。' });
  if (!payload.name) return res.status(400).json({ message: '表示名が必要です。' });
  if (!payload.riotId) return res.status(400).json({ message: 'Riot IDが必要です。' });
  if (!payload.region) return res.status(400).json({ message: '地域が必要です。' });
  if (!payload.agreed) return res.status(400).json({ message: '利用規約への同意が必要です。' });
  const safeAge = cleanAgeField(payload.age);
  if (!safeAge) return res.status(400).json({ message: '年齢帯を選択してください。' });
  const profileEnums = validateProfileEnums(payload);
  if (profileEnums.status) return res.status(profileEnums.status).json({ message: profileEnums.message });

  const riotId = cleanRiotId(payload.riotId);
  if (!riotId) return res.status(400).json({ message: 'Riot IDはGameName#Tagline形式で入力してください（例：たろう#JP1）。' });
  const result = await updateJson('users.json', [], (users) => {
    if (users.some((user) => user.firebaseUid === firebaseUser.uid || emailKey(user.email) === emailKey(firebaseUser.email))) {
      return { value: undefined, result: { status: 409, message: 'このメールアドレスは登録済みです。ログインしてください。' } };
    }
    if (users.some((user) => user.riotId === riotId)) {
      return { value: undefined, result: { status: 409, message: 'このRiot IDは登録済みです。Firebaseログインしてください。' } };
    }
    const user = {
      id: uid('user'),
      firebaseUid: firebaseUser.uid,
      email: firebaseUser.email,
      name: cleanText(payload.name, 40),
      gender: profileEnums.gender,
      riotId,
      age: safeAge,
      region: profileEnums.region,
      profilePhoto: sanitizeMedia(payload.profilePhoto, 'image', 2000000),
      rank: profileEnums.rank,
      role: profileEnums.role,
      tags: Array.isArray(payload.tags) ? payload.tags.map((v) => cleanText(v, 30)).slice(0, 4) : [],
      agents: Array.isArray(payload.agents) ? payload.agents.map((v) => cleanText(v, 20)).slice(0, 6) : [],
      xHandle: cleanText(payload.xHandle, 40),
      bio: cleanText(payload.bio, 240),
      voiceIntro: sanitizeMedia(payload.voiceIntro, 'audio', 1500000),
      vc: enumValue(payload.vc, allowedVcs, ''),
      maps: sanitizeMapsField(payload.maps),
      favoriteWeapon: enumValue(payload.favoriteWeapon, allowedWeapons, ''),
      plan: 'FREE',
      verified: true,
      agreedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    return { value: [...users, user], result: { user } };
  });
  if (result?.status) return res.status(result.status).json({ message: result.message });
  const user = result.user;
  res.status(201).json({ user: { ...publicUser(user), isAdmin: isAdmin(user) }, message: 'アカウントを作成しました。' });
});

app.post('/api/login', authLimiter, async (req, res) => {
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdentity(req.body?.idToken);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Firebase認証の確認に失敗しました。' });
  }
  if (!firebaseUser.emailVerified) return res.status(403).json({ message: 'メール認証を完了してください。' });
  const found = await findAndLinkFirebaseProfile(firebaseUser);
  if (!found) return res.status(404).json({ message: 'Pairlyプロフィールが見つかりません。先にアカウント作成してください。' });
  res.json({ user: { ...publicUser(found), isAdmin: isAdmin(found) } });
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const payload = req.body || {};
  const userId = req.authedUser.id;
  if (!payload.gender) return res.status(400).json({ message: '性別選択が必要です。' });
  if (!payload.name) return res.status(400).json({ message: '表示名が必要です。' });
  if (!payload.riotId) return res.status(400).json({ message: 'Riot IDが必要です。' });
  if (!payload.region) return res.status(400).json({ message: '地域が必要です。' });
  const safeAge = cleanAgeField(payload.age);
  if (!safeAge) return res.status(400).json({ message: '年齢帯を選択してください。' });

  const riotId = cleanRiotId(payload.riotId);
  if (!riotId) return res.status(400).json({ message: 'Riot IDはGameName#Tagline形式で入力してください（例：たろう#JP1）。' });
  const result = await updateJson('users.json', [], (users) => {
    const index = users.findIndex((user) => user.id === userId);
    if (index < 0) return { value: undefined, result: { status: 404, message: 'プロフィールが見つかりません。' } };
    const profileEnums = validateProfileEnums(payload, users[index]);
    if (profileEnums.status) return { value: undefined, result: profileEnums };
    if (users.some((user) => user.id !== userId && user.riotId === riotId)) {
      return { value: undefined, result: { status: 409, message: 'このRiot IDは別のアカウントで使用されています。' } };
    }

    const updated = {
      ...users[index],
      name: cleanText(payload.name, 40),
      gender: profileEnums.gender,
      riotId,
      age: safeAge,
      region: profileEnums.region,
      profilePhoto: sanitizeMedia(payload.profilePhoto, 'image', 2000000),
      rank: profileEnums.rank,
      role: profileEnums.role,
      tags: Array.isArray(payload.tags) ? payload.tags.map((v) => cleanText(v, 30)).slice(0, 4) : [],
      agents: Array.isArray(payload.agents) ? payload.agents.map((v) => cleanText(v, 20)).slice(0, 6) : [],
      xHandle: cleanText(payload.xHandle, 40),
      bio: cleanText(payload.bio, 240),
      voiceIntro: sanitizeMedia(payload.voiceIntro, 'audio', 1500000),
      vc: enumValue(payload.vc, allowedVcs, ''),
      maps: sanitizeMapsField(payload.maps),
      favoriteWeapon: enumValue(payload.favoriteWeapon, allowedWeapons, ''),
      updatedAt: new Date().toISOString()
    };
    const next = [...users];
    next[index] = updated;
    return { value: next, result: { user: updated } };
  });
  if (result?.status) {
    return res.status(result.status).json({ message: result.message });
  }
  const updated = result.user;
  res.json({ user: { ...publicUser(updated), isAdmin: isAdmin(updated) }, message: 'プロフィールを更新しました。' });
});

app.get('/api/profiles', requireAuth, async (req, res) => {
  const planName = String(req.authedUser.plan || 'FREE').toUpperCase();
  const rawTargetGender = cleanText(req.query.targetGender || 'all', 20);
  const targetGender = rawTargetGender === 'all' || allowedGenders.includes(rawTargetGender) ? rawTargetGender : 'all';
  const userId = req.authedUser.id;
  if (req.authedUser.autoHidden) {
    return res.json({ profiles: [], plan: plans[planName] || plans.FREE, entitlements: { genderFilter: false, boost: false, spotlight: false, superCredits: 0 }, genderFilterAllowed: false, targetGenderApplied: false });
  }
  const [profiles, blocks, singlePurchases] = await Promise.all([
    readCandidateProfiles(userId),
    readJson('blocks.json', []),
    readJson('single_purchases.json', [])
  ]);
  const plan = plans[planName] || plans.FREE;
  const entitlements = activeEntitlements(singlePurchases, userId);
  // 小規模公開では、登録済み実アカウントは自分以外すべて候補に出す。
  // LIKE済み・マッチ済みは除外しない。ブロック済みだけ非表示にする。
  const genderFilterAllowed = plan.genderFilter || entitlements.genderFilter;
  const hiddenIds = new Set(
    blocks
      .filter((block) => block.userId === userId || block.profileId === userId)
      .map((block) => block.userId === userId ? block.profileId : block.userId)
  );
  let results = profiles.filter((profile) => !hiddenIds.has(profile.id));
  const targetGenderApplied = targetGender !== 'all' && genderFilterAllowed;
  if (targetGenderApplied) {
    results = results.filter((profile) => profile.gender === targetGender);
  }
  const boosted = boostedUserIds(singlePurchases);
  res.json({ profiles: weightedShuffle(results, planName, boosted), plan, entitlements, genderFilterAllowed, targetGenderApplied });
});

app.post('/api/like', requireAuth, async (req, res) => {
  const profileId = cleanText(req.body?.profileId, 80);
  const type = cleanText(req.body?.type || 'like', 20);
  const userId = req.authedUser.id;
  if (req.authedUser.autoHidden) return res.status(403).json({ message: '現在この操作は利用できません。' });
  const planName = String(req.authedUser.plan || 'FREE').toUpperCase();
  const selectedType = ['like', 'super', 'dual'].includes(type) ? type : 'like';
  const limit = quotaFor(planName, selectedType);

  const [profiles, users, matches, blocks, singlePurchases] = await Promise.all([
    readCandidateProfiles(userId),
    readJson('users.json', []),
    readJson('matches.json', []),
    readJson('blocks.json', []),
    readJson('single_purchases.json', [])
  ]);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return res.status(404).json({ message: 'プロフィールが見つかりません。' });

  // SUPER LIKE 3回 の購入分は、プランの本日上限を超えても消費して送れる。
  const superCredits = selectedType === 'super' ? activeEntitlements(singlePurchases, userId).superCredits : 0;
  const effectiveLimit = limit === Infinity ? Infinity : limit + superCredits;
  if (pairBlocked(blocks, userId, profileId)) {
    return res.status(403).json({ message: 'ブロック済みの相手にはいいねできません。' });
  }
  if (pairAlreadyMatched(matches, userId, profileId)) {
    const match = matches.find((item) => item.userId === userId && item.profileId === profileId) || null;
    return res.json({ ok: true, already_matched: true, matched: true, match });
  }

  // 利用枠チェックと like 追加を 1ファイルにつき直列・原子的に行い、
  // 同時リクエストでの枠の二重消費を防ぐ。
  const like = { id: uid('like'), userId, profileId, type: selectedType, plan: planName, createdAt: new Date().toISOString() };
  let usedSuperCredit = false;
  const likeResult = await updateJson('likes.json', [], (likes) => {
    if (userHasLiked(likes, userId, profileId)) return { value: undefined, result: 'duplicate' };
    const used = countTodayUsage(likes, userId, selectedType);
    if (used >= effectiveLimit) return { value: undefined, result: 'quota' };
    usedSuperCredit = selectedType === 'super' && used >= limit; // プラン上限超過 = 購入分を消費
    return { value: [...likes, like], result: 'created' };
  });
  if (likeResult === 'quota') return res.status(402).json({ message: '本日の利用枠を使い切りました。PLUS/VIPで上限を増やせます。' });

  // 購入したスーパーいいねを1回分消費する。
  if (likeResult === 'created' && usedSuperCredit) {
    await updateJson('single_purchases.json', [], (purchases) => {
      const idx = purchases.findIndex((p) => p.userId === userId && p.perk === 'superCredits' && toNonNegativeInt(p.remaining, 0) > 0);
      if (idx < 0) return { value: undefined, result: false };
      const next = [...purchases];
      next[idx] = { ...next[idx], remaining: toNonNegativeInt(next[idx].remaining, 0) - 1 };
      return { value: next, result: true };
    });
  }

  // スーパーいいね枠を消費した可能性があるため、最新のエンタイトルメントを返し、
  // クライアント側の残数表示（superCredits 等）を即時更新できるようにする。
  const latestPurchases = usedSuperCredit ? await readJson('single_purchases.json', []) : singlePurchases;
  const updatedEntitlements = activeEntitlements(latestPurchases, userId);

  // 候補は実ユーザー限定。念のため非実ユーザーは安全に返す。
  if (!isRealUserId(profileId, users)) {
    return res.json({ ok: true, like: likeResult === 'created' ? like : null, already_liked: likeResult === 'duplicate', matched: false, entitlements: updatedEntitlements });
  }

  const me = req.authedUser;
  const targetUser = users.find((u) => u.id === profileId);
  if (!targetUser || targetUser.autoHidden) return res.status(404).json({ message: 'プロフィールが見つかりません。' });

  // 相互いいねが成立していれば、その場で双方向マッチ（競合に強い直列化版）。
  const matchRows = await tryCreateMutualMatch(me, targetUser);
  const myMatch = matchRows.find((m) => m.userId === userId) || null;
  if (myMatch) {
    await resolvePendingBetween(userId, profileId);
    return res.json({ ok: true, like: likeResult === 'created' ? like : null, already_liked: likeResult === 'duplicate', matched: true, match: myMatch, entitlements: updatedEntitlements });
  }

  // 既にいいね済みでまだ相互でない → 何もせず終了（pending は初回に作成済み）。
  if (likeResult === 'duplicate') {
    return res.json({ ok: true, like: null, already_liked: true, matched: false, entitlements: updatedEntitlements });
  }

  // 初回いいねでまだ片方だけ → 相手に「いいねが届いた」状態を1件積み、送信者にも返す。
  const myProfile = userToProfile(me);
  const receivedLike = buildReceivedLikeEntry(myProfile, profileId, selectedType);
  const pendingResult = await updateJson('received_likes.json', [], (received) => {
    const exists = received.some((r) => r.forUserId === profileId && r.fromProfileId === userId && r.status === 'pending');
    if (exists) return { value: undefined, result: false };
    return { value: [receivedLike, ...received], result: true };
  });
  return res.json({ ok: true, like, matched: false, pending_sent: Boolean(pendingResult), receivedLike: pendingResult ? receivedLike : null, entitlements: updatedEntitlements });
});

async function sendReceivedLikesForCurrentUser(req, res) {
  if (req.authedUser.autoHidden) return res.json({ receivedLikes: [] });
  const [received, users] = await Promise.all([
    readJson('received_likes.json', []),
    readJson('users.json', [])
  ]);
  const visibleUserIds = new Set(users.filter(isVisibleUser).map((user) => user.id));
  res.json({
    receivedLikes: received
      .filter((r) => r.forUserId === req.authedUser.id && r.status === 'pending' && visibleUserIds.has(r.fromProfileId))
      .slice(0, RECEIVED_LIKES_LIMIT)
  });
}

// /me は明示的な現在ユーザー専用エンドポイント。
// /:userId は旧互換で残すが req.params.userId は信用せず req.authedUser.id を使う。
app.get('/api/received-likes/me', requireAuth, sendReceivedLikesForCurrentUser);
app.get('/api/received-likes/:userId', requireAuth, sendReceivedLikesForCurrentUser);

app.post('/api/accept-like', requireAuth, async (req, res) => {
  const receivedLikeId = cleanText(req.body?.receivedLikeId, 80);
  const userId = req.authedUser.id;
  const me = req.authedUser;
  if (me.autoHidden) return res.status(403).json({ message: '現在この操作は利用できません。' });
  if (!receivedLikeId) return res.status(400).json({ message: '対象のいいねが必要です。' });

  const received = await readJson('received_likes.json', []);
  const rl = received.find((r) => r.id === receivedLikeId && r.forUserId === userId && r.status === 'pending');
  if (!rl) return res.status(404).json({ message: '対象のいいねが見つかりません。' });

  const [users, blocks] = await Promise.all([
    readJson('users.json', []),
    readJson('blocks.json', [])
  ]);
  const fromUser = users.find((u) => u.id === rl.fromProfileId);
  if (!fromUser) return res.status(404).json({ message: '対象のいいねが見つかりません。' });
  if (fromUser.autoHidden) {
    await setReceivedLikesFromUserStatus(fromUser.id, true);
    return res.status(404).json({ message: '対象のいいねが見つかりません。' });
  }
  if (pairBlocked(blocks, userId, rl.fromProfileId)) {
    await updateJson('received_likes.json', [], (current) => {
      let changed = false;
      const next = current.map((item) => {
        if (item.id === receivedLikeId && item.status === 'pending') {
          changed = true;
          return { ...item, status: 'blocked', blockedAt: new Date().toISOString() };
        }
        return item;
      });
      return { value: changed ? next : undefined, result: changed };
    });
    return res.status(403).json({ message: 'ブロック済みの相手とはマッチできません。' });
  }

  const accepted = await updateJson('received_likes.json', [], (received) => {
    const idx = received.findIndex((r) => r.id === receivedLikeId && r.forUserId === userId && r.status === 'pending');
    if (idx < 0) return { value: undefined, result: false };
    const next = [...received];
    next[idx] = { ...rl, status: 'accepted', acceptedAt: new Date().toISOString() };
    return { value: next, result: true };
  });
  if (!accepted) return res.status(404).json({ message: '対象のいいねが見つかりません。' });

  // いいねを返す＝自分も相手をいいねしたとみなし、likes.json にも記録（真の相互いいね）。
  await updateJson('likes.json', [], (likes) => {
    const exists = likes.some((l) => l.userId === userId && l.profileId === rl.fromProfileId);
    if (exists) return { value: undefined, result: false };
    return { value: [...likes, { id: uid('like'), userId, profileId: rl.fromProfileId, type: 'like', plan: me.plan || 'FREE', createdAt: new Date().toISOString() }], result: true };
  });
  const matchRows = await tryCreateMutualMatch(me, fromUser);
  await resolvePendingBetween(userId, rl.fromProfileId);
  const myMatch = matchRows.find((m) => m.userId === userId) || null;
  return res.json({ ok: true, match: myMatch, matched: true });
});

app.get('/api/matches/:userId', requireAuth, async (req, res) => {
  const [matches, users] = await Promise.all([
    readJson('matches.json', []),
    readJson('users.json', [])
  ]);
  const visibleUserIds = new Set(users.filter(isVisibleUser).map((user) => user.id));
  res.json({ matches: matches.filter((match) => match.userId === req.authedUser.id && match.dmUnlocked && visibleUserIds.has(match.profileId)) });
});

// 足あと（自分の操作履歴）をサーバーに永続化する。リロードしても残る。
app.get('/api/footprints/me', requireAuth, async (req, res) => {
  const footprints = await readJson('footprints.json', []);
  res.json({ footprints: footprints.filter((f) => f.userId === req.authedUser.id).slice(0, 50) });
});

app.post('/api/footprint', requireAuth, async (req, res) => {
  const userId = req.authedUser.id;
  const profileId = cleanText(req.body?.profileId, 80);
  const action = cleanText(req.body?.action, 20) || '見送り';
  if (!profileId) return res.status(400).json({ message: '対象が必要です。' });
  const users = await readJson('users.json', []);
  const target = users.find((u) => u.id === profileId);
  if (!target) return res.status(404).json({ message: '対象ユーザーが見つかりません。' });
  const entry = {
    id: uid('fp'), userId, profileId,
    name: target.name, rank: target.rank || '', gender: target.gender || '',
    action, createdAt: new Date().toISOString()
  };
  // ユーザーごとに直近50件だけ保持する（無制限肥大を防ぐ）。
  const saved = await updateJson('footprints.json', [], (footprints) => {
    const mine = footprints.filter((f) => f.userId === userId);
    const others = footprints.filter((f) => f.userId !== userId);
    const nextMine = [entry, ...mine].slice(0, 50);
    return { value: [...nextMine, ...others], result: entry };
  });
  res.status(201).json({ footprint: saved });
});

app.get('/api/dm/:userId', requireAuth, async (req, res) => {
  const viewerId = req.authedUser.id;
  if (req.authedUser.autoHidden) return res.json({ threads: [] });
  const [matches, messages, users] = await Promise.all([
    readJson('matches.json', []),
    readJson('messages.json', []),
    readJson('users.json', [])
  ]);
  const visibleUserIds = new Set(users.filter(isVisibleUser).map((user) => user.id));
  const userMatches = matches
    .filter((match) => match.userId === viewerId && match.dmUnlocked && visibleUserIds.has(match.profileId))
    .slice(0, DM_THREADS_LIMIT);
  const convIds = new Set(userMatches.map((match) => match.conversationId || match.id));
  const messagesByConversation = new Map();
  for (const message of messages) {
    const convId = message.conversationId || message.matchId;
    if (!convIds.has(convId)) continue;
    const list = messagesByConversation.get(convId) || [];
    list.push(message);
    messagesByConversation.set(convId, list);
  }
  const threads = userMatches.map((match) => {
    const allThreadMessages = (messagesByConversation.get(match.conversationId || match.id) || [])
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const threadMessages = allThreadMessages
      .slice(-DM_THREAD_MESSAGE_LIMIT)
      .map((message) => ({ ...message, sender: senderFor(message, viewerId) }));
    const openerMessage = {
      id: `opener_${match.id}`,
      matchId: match.id,
      sender: 'match',
      body: match.opener || `${match.profileName}さんとマッチしました。最初のメッセージを送ってみましょう。`,
      createdAt: match.createdAt,
      readAt: match.readAt || null,
      system: true
    };
    return {
      match,
      messages: [openerMessage, ...threadMessages],
      unreadCount: (openerMessage.readAt ? 0 : 1) + allThreadMessages.filter((message) => senderFor(message, viewerId) !== 'user' && !message.readAt).length,
      updatedAt: allThreadMessages.at(-1)?.createdAt || match.createdAt
    };
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ threads });
});

app.post('/api/dm/read', requireAuth, async (req, res) => {
  const viewerId = req.authedUser.id;
  const matchId = cleanText(req.body?.matchId, 80);
  if (!matchId) return res.status(400).json({ message: '既読にする会話が必要です。' });

  const [matches, users] = await Promise.all([
    readJson('matches.json', []),
    readJson('users.json', [])
  ]);
  const matchIndex = matches.findIndex((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
  if (matchIndex < 0) return res.status(403).json({ message: 'マッチ後だけ既読にできます。' });
  const match = matches[matchIndex];
  const targetUser = users.find((user) => user.id === match.profileId);
  if (req.authedUser.autoHidden || !isVisibleUser(targetUser)) return res.status(403).json({ message: 'この会話は現在利用できません。' });
  const convId = match.conversationId || match.id;

  const readAt = new Date().toISOString();
  await updateJson('matches.json', [], (currentMatches) => {
    const currentIndex = currentMatches.findIndex((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
    if (currentIndex < 0) return { value: undefined, result: false };
    const nextMatches = [...currentMatches];
    nextMatches[currentIndex] = { ...nextMatches[currentIndex], readAt };
    return { value: nextMatches, result: true };
  });
  await updateJson('messages.json', [], (messages) => {
    let changed = false;
    const nextMessages = messages.map((message) => {
      const belongs = message.conversationId ? message.conversationId === convId : message.matchId === matchId;
      const incoming = senderFor(message, viewerId) !== 'user';
      if (belongs && incoming && !message.readAt) {
        changed = true;
        return { ...message, readAt };
      }
      return message;
    });
    return { value: changed ? nextMessages : undefined, result: changed };
  });

  res.json({ ok: true, matchId, readAt });
});

app.post('/api/dm', requireAuth, dmLimiter, async (req, res) => {
  const viewerId = req.authedUser.id;
  const matchId = cleanText(req.body?.matchId, 80);
  const body = cleanText(req.body?.body, 500);
  if (!matchId || !body) return res.status(400).json({ message: '送信先とメッセージ本文が必要です。' });
  if (req.authedUser.autoHidden) return res.status(403).json({ message: '現在この操作は利用できません。' });

  const [matches, blocks, users] = await Promise.all([
    readJson('matches.json', []),
    readJson('blocks.json', []),
    readJson('users.json', [])
  ]);
  const match = matches.find((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
  if (!match) return res.status(403).json({ message: 'マッチ後だけDMを送信できます。' });
  const targetUser = users.find((user) => user.id === match.profileId);
  if (!isVisibleUser(targetUser)) return res.status(403).json({ message: 'この相手には現在DMを送信できません。' });

  if (pairBlocked(blocks, viewerId, match.profileId)) return res.status(403).json({ message: 'ブロック済みの相手にはDMを送信できません。' });

  // 会話IDで保存することで、双方向マッチの両側に同じメッセージが見える。
  const conversationId = match.conversationId || match.id;
  const createdAt = new Date().toISOString();
  const message = { id: uid('msg'), conversationId, matchId: match.id, senderUserId: viewerId, profileId: match.profileId, body, createdAt, readAt: null };
  const savedMessage = await updateJson('messages.json', [], (messages) => {
    const recentDuplicate = messages.some((existing) =>
      (existing.conversationId ? existing.conversationId === conversationId : existing.matchId === match.id) &&
      existing.senderUserId === viewerId &&
      existing.body === body &&
      Date.now() - new Date(existing.createdAt).getTime() < 2500
    );
    if (recentDuplicate) return { value: undefined, result: null };
    const next = [...messages, message];
    return { value: next.length > MAX_MESSAGES_STORED ? next.slice(-MAX_MESSAGES_STORED) : next, result: message };
  });
  if (!savedMessage) {
    return res.status(409).json({ message: '同じメッセージを連続送信しています。少し待ってから送信してください。' });
  }
  res.status(201).json({ message: { ...savedMessage, sender: 'user' } });
});

app.post('/api/report', requireAuth, reportLimiter, async (req, res) => {
  const profileId = cleanText(req.body.profileId, 80);
  if (!profileId) return res.status(400).json({ message: '通報する相手が必要です。' });
  if (profileId === req.authedUser.id) return res.status(400).json({ message: '自分自身を通報することはできません。' });
  const users = await readJson('users.json', []);
  if (!users.some((u) => u.id === profileId)) return res.status(404).json({ message: '対象ユーザーが見つかりません。' });
  const actorId = req.authedUser.id;
  const report = { id: uid('report'), userId: actorId, profileId, reason: cleanText(req.body.reason || '迷惑行為/不適切な内容', 120), status: 'open', createdAt: new Date().toISOString() };
  const outcome = await updateJson('reports.json', [], (reports) => {
    const mine24h = reports.filter((r) => r.userId === actorId && Date.now() - new Date(r.createdAt).getTime() < DAY_MS);
    // アカウント単位の永続レート制限（再起動で消えない）。
    if (mine24h.length >= MAX_REPORTS_PER_DAY) return { value: undefined, result: { code: 'too_many' } };
    // 同一相手への24時間以内の重複通報を防ぐ。
    if (mine24h.some((r) => r.profileId === profileId)) return { value: undefined, result: { code: 'duplicate' } };
    const next = [report, ...reports];
    return { value: next.length > MAX_REPORTS_STORED ? next.slice(0, MAX_REPORTS_STORED) : next, result: { code: 'ok', report } };
  });
  if (!outcome) return res.status(500).json({ message: '通報の保存に失敗しました。' });
  if (outcome.code === 'too_many') return res.status(429).json({ message: '本日の通報回数の上限に達しました。時間をおいてください。' });
  if (outcome.code === 'duplicate') return res.status(409).json({ message: 'このユーザーはすでに通報済みです。時間をおいてください。' });

  appendAudit('report', actorId, profileId, { reason: report.reason, ip: clientIp(req) });

  // 自動エスカレーション: 異なる通報者がしきい値に達したら候補から自動非表示にする。
  // dismissed（管理者が確認済み）の通報はカウントしない。
  const allReports = await readJson('reports.json', []);
  const distinctReporters = new Set(
    allReports
      .filter((r) => r.profileId === profileId && r.status !== 'dismissed' && Date.now() - new Date(r.createdAt).getTime() < REPORT_AUTO_HIDE_WINDOW_MS)
      .map((r) => r.userId)
  );
  if (distinctReporters.size >= REPORT_AUTO_HIDE_THRESHOLD) {
    const hidden = await updateJson('users.json', [], (users) => {
      const idx = users.findIndex((u) => u.id === profileId);
      if (idx < 0 || users[idx].autoHidden) return { value: undefined, result: false };
      const next = [...users];
      next[idx] = { ...next[idx], autoHidden: true, autoHiddenAt: new Date().toISOString(), autoHiddenReporters: distinctReporters.size };
      return { value: next, result: true };
    });
    if (hidden) {
      await setReceivedLikesFromUserStatus(profileId, true);
      appendAudit('auto_hide', null, profileId, { reporters: distinctReporters.size });
    }
  }

  res.status(201).json({ report: outcome.report });
});

app.post('/api/block', requireAuth, async (req, res) => {
  const userId = req.authedUser.id;
  const profileId = cleanText(req.body.profileId, 80);
  if (!profileId) return res.status(400).json({ message: 'ブロックする相手が必要です。' });
  if (profileId === userId) return res.status(400).json({ message: '自分自身をブロックすることはできません。' });
  const users = await readJson('users.json', []);
  if (!users.some((u) => u.id === profileId)) return res.status(404).json({ message: 'ブロック対象ユーザーが見つかりません。' });
  let block = null;
  await updateJson('blocks.json', [], (blocks) => {
    const existing = blocks.find((item) => item.userId === userId && item.profileId === profileId);
    if (existing) {
      block = existing;
      return { value: undefined, result: false };
    }
    block = { id: uid('block'), userId, profileId, createdAt: new Date().toISOString() };
    return { value: [block, ...blocks], result: true };
  });
  await updateJson('received_likes.json', [], (received) => {
    let changed = false;
    const next = received.map((item) => {
      const related =
        (item.forUserId === userId && item.fromProfileId === profileId) ||
        (item.forUserId === profileId && item.fromProfileId === userId);
      if (related && item.status === 'pending') {
        changed = true;
        return { ...item, status: 'blocked', blockedAt: new Date().toISOString() };
      }
      return item;
    });
    return { value: changed ? next : undefined, result: changed };
  });
  await updateJson('matches.json', [], (matches) => {
    let changed = false;
    const next = matches.map((match) => {
      const related =
        (match.userId === userId && match.profileId === profileId) ||
        (match.userId === profileId && match.profileId === userId);
      if (related && match.dmUnlocked) {
        changed = true;
        return { ...match, dmUnlocked: false, blockedAt: new Date().toISOString() };
      }
      return match;
    });
    return { value: changed ? next : undefined, result: changed };
  });
  appendAudit('block', userId, profileId, { ip: clientIp(req) });
  res.status(201).json({ block });
});

app.get('/api/admin/reports', requireAuth, async (req, res) => {
  if (!isAdmin(req.authedUser)) return res.status(403).json({ message: '管理者のみアクセスできます。' });
  const [reports, users] = await Promise.all([
    readJson('reports.json', []),
    readJson('users.json', [])
  ]);
  // 通報相手の表示名を補完し、自動非表示中のユーザー一覧も返す（管理者レビュー用）。
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const queryLimit = Number(req.query.limit);
  const requestedLimit = Number.isInteger(queryLimit) && queryLimit > 0
    ? Math.min(queryLimit, ADMIN_REPORTS_LIMIT)
    : ADMIN_REPORTS_LIMIT;
  const enrichedReports = reports.slice(0, requestedLimit).map((r) => ({ ...r, profileName: nameById.get(r.profileId) || null }));
  const flaggedUsers = users
    .filter((u) => u.autoHidden)
    .map((u) => ({ id: u.id, name: u.name, autoHiddenAt: u.autoHiddenAt || null, reporters: u.autoHiddenReporters || 0 }));
  appendAudit('admin_view_reports', req.authedUser.id, null, { ip: clientIp(req) });
  res.json({ reports: enrichedReports, flaggedUsers });
});

// 管理者が自動非表示を解除する。誤通報による永久ロックを防ぐための復旧手段。
// 対象ユーザーの未処理通報は dismissed にして、再び自動非表示にならないようにする。
app.post('/api/admin/unhide', requireAuth, async (req, res) => {
  if (!isAdmin(req.authedUser)) return res.status(403).json({ message: '管理者のみアクセスできます。' });
  const profileId = cleanText(req.body?.profileId, 80);
  if (!profileId) return res.status(400).json({ message: '対象ユーザーが必要です。' });
  const cleared = await updateJson('users.json', [], (users) => {
    const idx = users.findIndex((u) => u.id === profileId);
    if (idx < 0) return { value: undefined, result: false };
    const next = [...users];
    const { autoHidden, autoHiddenAt, autoHiddenReporters, ...rest } = next[idx];
    next[idx] = rest;
    return { value: next, result: true };
  });
  if (!cleared) return res.status(404).json({ message: '対象ユーザーが見つかりません。' });
  await updateJson('reports.json', [], (reports) => {
    let changed = false;
    const next = reports.map((r) => {
      if (r.profileId === profileId && r.status !== 'dismissed') {
        changed = true;
        return { ...r, status: 'dismissed', dismissedAt: new Date().toISOString() };
      }
      return r;
    });
    return { value: changed ? next : undefined, result: changed };
  });
  await setReceivedLikesFromUserStatus(profileId, false);
  appendAudit('admin_unhide', req.authedUser.id, profileId, { ip: clientIp(req) });
  res.json({ ok: true, profileId });
});

// 監査ログ閲覧（管理者のみ）。直近 limit 件を新しい順で返す。
app.get('/api/admin/audit', requireAuth, async (req, res) => {
  if (!isAdmin(req.authedUser)) return res.status(403).json({ message: '管理者のみアクセスできます。' });
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const log = await readJson('audit.json', []);
  res.json({ audit: log.slice(0, limit) });
});

app.post('/api/purchase', requireAuth, async (req, res) => {
  if (!isDemoPaymentAllowed()) {
    return res.status(503).json({ message: '決済機能は現在準備中です。しばらくお待ちください。' });
  }
  const userId = req.authedUser.id;
  const selected = String(req.body?.plan || 'PLUS').toUpperCase();
  const validPlan = plans[selected] ? selected : 'PLUS';
  const purchase = { id: uid('purchase'), userId, plan: validPlan, amount: plans[validPlan].price, status: 'demo_paid', createdAt: new Date().toISOString() };
  await updateJson('purchases.json', [], (purchases) => ({ value: [purchase, ...purchases], result: purchase }));
  await updateJson('users.json', [], (users) => {
    const userIdx = users.findIndex((u) => u.id === userId);
    if (userIdx < 0) return { value: undefined, result: false };
    const next = [...users];
    next[userIdx] = { ...next[userIdx], plan: validPlan };
    return { value: next, result: true };
  });
  appendAudit('demo_purchase_plan', userId, userId, { plan: validPlan, amount: purchase.amount });
  res.status(201).json({ purchase });
});

// 現在有効な単発課金の特典を返す。
app.get('/api/entitlements/:userId', requireAuth, async (req, res) => {
  const singlePurchases = await readJson('single_purchases.json', []);
  res.json({ entitlements: activeEntitlements(singlePurchases, req.authedUser.id) });
});

// 単発課金（性別フィルター7日 / ブースト / SUPER LIKE 3回 / 目立たせ）を購入する。
app.post('/api/purchase-item', requireAuth, async (req, res) => {
  if (!isDemoPaymentAllowed()) {
    return res.status(503).json({ message: '決済機能は現在準備中です。しばらくお待ちください。' });
  }
  const userId = req.authedUser.id;
  const itemName = cleanText(req.body?.item, 60);
  const config = singleItemConfig[itemName];
  const meta = singleItems.find((i) => i.name === itemName);
  if (!config || !meta) return res.status(400).json({ message: '不明な商品です。' });

  const now = Date.now();
  const record = {
    id: uid('single'),
    userId,
    item: itemName,
    perk: config.perk,
    kind: config.kind,
    amount: meta.price,
    status: 'demo_paid',
    createdAt: new Date().toISOString(),
    expiresAt: config.kind === 'timed' ? new Date(now + config.durationMs).toISOString() : null,
    remaining: config.kind === 'consumable' ? config.count : null
  };

  let entitlements = null;
  await updateJson('single_purchases.json', [], (purchases) => {
    const next = [record, ...purchases];
    entitlements = activeEntitlements(next, userId, now);
    return { value: next, result: true };
  });
  appendAudit('demo_purchase_item', userId, userId, { item: itemName, perk: record.perk, amount: record.amount });
  res.status(201).json({ purchase: record, entitlements });
});

// 未知の /api ルートは HTML ではなく JSON の 404 を返す
// （SPA フォールバックに飲み込ませない）。
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'APIエンドポイントが見つかりません。' });
});

if (isProduction) {
  const distPath = path.resolve(__dirname, '../dist');
  // index.html は no-cache（デプロイ後に最新を取得させる）
  // ハッシュ付きアセット（JS/CSS）は長期キャッシュ可
  app.use(express.static(distPath, {
    maxAge: '1y',
    etag: true,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === 'index.html') {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    }
  }));
  // SPA フォールバック。Express 5 (path-to-regexp v8) では裸の '*' は使えないため
  // 名前付きワイルドカード '/*splat' を使う。/api は上で処理済み。
  app.get('/*splat', (req, res, next) => {
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) return next();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.sendFile(indexPath);
  });
}

// 集約エラーハンドラ。CORS 拒否やハンドラ内の例外を JSON で返し、
// 本番ではスタックトレースを漏らさない。
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: '許可されていないオリジンからのリクエストです。' });
  }
  console.error('[unhandled error]', err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({
    message: isProduction ? 'サーバーエラーが発生しました。' : (err?.message || 'サーバーエラーが発生しました。')
  });
});

const server = app.listen(port, () => {
  console.log(`Pairly API running on http://localhost:${port} (${isProduction ? 'production' : 'development'})`);
});

// グレースフルシャットダウン。PaaS / コンテナは停止時に SIGTERM を送るため、
// 進行中のリクエストを捌いてから終了する。
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  // 一定時間で閉じきれなければ強制終了。
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref?.();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});
