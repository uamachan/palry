import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, updateJson, uid } from './lib/jsonStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadLocalEnv();
const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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
function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }
  // 期限切れエントリを定期的に掃除してメモリ増加を防ぐ。
  const cleaner = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, windowMs);
  cleaner.unref?.(); // この timer でプロセスを生かし続けない
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
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
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://apis.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com",
  `frame-src 'self' ${firebaseAuthDomain ? `https://${firebaseAuthDomain} ` : ''}https://*.firebaseapp.com https://accounts.google.com https://apis.google.com`,
  "worker-src 'self' blob:"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=()');
  if (isProduction) res.setHeader('Content-Security-Policy', contentSecurityPolicy);
  next();
});

// 全 API への緩めの制限と、認証系エンドポイントへの厳しめの制限。
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_API_PER_MIN || 120) });
const authLimiter = rateLimit({ windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_AUTH_PER_MIN || 20), message: '認証の試行が多すぎます。しばらくしてからお試しください。' });
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

const valorantRoles = ['デュエリスト', 'イニシエーター', 'コントローラー', 'センチネル'];

function normalizeRole(role) {
  const value = cleanText(role, 30);
  return valorantRoles.includes(value) ? value : 'コントローラー';
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

function weightedShuffle(profiles, planName) {
  const planBonus = planName === 'VIP' ? 0.08 : planName === 'PLUS' ? 0.04 : 0;
  return [...profiles]
    .map((profile) => {
      const femaleGuard = profile.gender === '女性' ? 0.22 : 0;
      const score = Math.random() + Number(profile.matchScore || 70) / 100 + planBonus - femaleGuard;
      return { profile, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.profile);
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

// プロフィール写真/ボイスはユーザー入力をそのまま src として配信するため、
// 安全な media data URL（または https URL）以外は弾く。
// data:text/html や javascript: などのスキーム混入・ストレージ悪用を防ぐ。
function sanitizeMedia(value, kind, max) {
  const v = String(value || '').trim();
  if (!v || v.length > max) return '';
  if (kind === 'image' && /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/.test(v)) return v;
  if (kind === 'audio' && /^data:audio\/(webm|ogg|mpeg|mp3|wav|mp4|x-m4a);base64,[A-Za-z0-9+/=\s]+$/.test(v)) return v;
  if (/^https:\/\/[^\s"'<>]+$/.test(v)) return v;
  return '';
}

function publicUser(user) {
  const { authCode, authCodeHash, authCodeSalt, otpSecret, ...safeUser } = user;
  return safeUser;
}

function emailKey(email) {
  return cleanText(email, 120).toLowerCase();
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
    gender: user.gender,
    ageRange: user.age ? `${user.age}歳` : '年齢未設定',
    region: user.region || '',
    rank: user.rank || 'Gold',
    peakRank: user.peakRank || user.rank || '',
    role: normalizeRole(user.role),
    tags: Array.isArray(user.tags) ? user.tags : [],
    modes: Array.isArray(user.modes) ? user.modes : [],
    agents: Array.isArray(user.agents) ? user.agents : [],
    xHandle: user.xHandle || '',
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
    .filter((user) => user.firebaseUid && user.id !== excludeUserId)
    .map((user) => ({ ...userToProfile(user), isRealUser: true }));
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
const TOKEN_CACHE_TTL_MS = Number(process.env.TOKEN_CACHE_TTL_MS || 5 * 60 * 1000);
const TOKEN_CACHE_MAX = 5000;
const tokenCache = new Map(); // token -> { value, expiresAt }

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

async function verifyFirebaseIdentity(idToken) {
  const token = cleanText(idToken, 4096);
  if (!token) {
    const error = new Error('Firebase ID tokenが必要です。');
    error.status = 401;
    throw error;
  }
  const cached = getCachedIdentity(token);
  if (cached) return cached;

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
    return res.json({ user: publicUser(existingProfile), message: '保存済みプロフィールでログインしました。' });
  }
  if (!payload.gender) return res.status(400).json({ message: '性別選択が必要です。' });
  if (!payload.name) return res.status(400).json({ message: '表示名が必要です。' });
  if (!payload.riotId) return res.status(400).json({ message: 'Riot IDが必要です。' });
  if (!payload.age) return res.status(400).json({ message: '年齢が必要です。' });
  if (!payload.region) return res.status(400).json({ message: '地域が必要です。' });
  if (!payload.agreed) return res.status(400).json({ message: '利用規約への同意が必要です。' });

  const users = await readJson('users.json', []);
  if (users.some((user) => user.firebaseUid === firebaseUser.uid || user.email === firebaseUser.email)) {
    return res.status(409).json({ message: 'このメールアドレスは登録済みです。ログインしてください。' });
  }
  if (users.some((user) => user.riotId === cleanText(payload.riotId, 60))) {
    return res.status(409).json({ message: 'このRiot IDは登録済みです。Firebaseログインしてください。' });
  }
  const user = {
    id: uid('user'),
    firebaseUid: firebaseUser.uid,
    email: firebaseUser.email,
    name: cleanText(payload.name, 40),
    gender: cleanText(payload.gender, 20),
    riotId: cleanText(payload.riotId, 60),
    age: cleanText(payload.age, 10),
    region: cleanText(payload.region, 40),
    profilePhoto: sanitizeMedia(payload.profilePhoto, 'image', 2000000),
    rank: cleanText(payload.rank || 'Gold', 30),
    role: normalizeRole(payload.role || 'デュエリスト'),
    tags: Array.isArray(payload.tags) ? payload.tags.map((v) => cleanText(v, 30)).slice(0, 4) : [],
    agents: Array.isArray(payload.agents) ? payload.agents.map((v) => cleanText(v, 20)).slice(0, 6) : [],
    xHandle: cleanText(payload.xHandle, 40),
    bio: cleanText(payload.bio, 240),
    voiceIntro: sanitizeMedia(payload.voiceIntro, 'audio', 1500000),
    plan: 'FREE',
    verified: true,
    agreedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeJson('users.json', users);
  res.status(201).json({ user: publicUser(user), message: 'アカウントを作成しました。' });
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
  res.json({ user: publicUser(found) });
});

app.put('/api/profile', requireAuth, async (req, res) => {
  const payload = req.body || {};
  const userId = req.authedUser.id;
  if (!payload.gender) return res.status(400).json({ message: '性別選択が必要です。' });
  if (!payload.name) return res.status(400).json({ message: '表示名が必要です。' });
  if (!payload.riotId) return res.status(400).json({ message: 'Riot IDが必要です。' });
  if (!payload.age) return res.status(400).json({ message: '年齢が必要です。' });
  if (!payload.region) return res.status(400).json({ message: '地域が必要です。' });

  const users = await readJson('users.json', []);
  const index = users.findIndex((user) => user.id === userId);
  if (index < 0) return res.status(404).json({ message: 'プロフィールが見つかりません。' });

  const riotId = cleanText(payload.riotId, 60);
  if (users.some((user) => user.id !== userId && user.riotId === riotId)) {
    return res.status(409).json({ message: 'このRiot IDは別のアカウントで使用されています。' });
  }

  const updated = {
    ...users[index],
    name: cleanText(payload.name, 40),
    gender: cleanText(payload.gender, 20),
    riotId,
    age: cleanText(payload.age, 10),
    region: cleanText(payload.region, 40),
    profilePhoto: sanitizeMedia(payload.profilePhoto, 'image', 2000000),
    rank: cleanText(payload.rank || users[index].rank || 'Gold', 30),
    role: normalizeRole(payload.role || users[index].role || 'デュエリスト'),
    tags: Array.isArray(payload.tags) ? payload.tags.map((v) => cleanText(v, 30)).slice(0, 4) : [],
    agents: Array.isArray(payload.agents) ? payload.agents.map((v) => cleanText(v, 20)).slice(0, 6) : [],
    xHandle: cleanText(payload.xHandle, 40),
    bio: cleanText(payload.bio, 240),
    voiceIntro: sanitizeMedia(payload.voiceIntro, 'audio', 1500000),
    updatedAt: new Date().toISOString()
  };
  users[index] = updated;
  await writeJson('users.json', users);
  res.json({ user: publicUser(updated), message: 'プロフィールを更新しました。' });
});

app.get('/api/profiles', requireAuth, async (req, res) => {
  const planName = String(req.authedUser.plan || 'FREE').toUpperCase();
  const targetGender = String(req.query.targetGender || 'all');
  const userId = req.authedUser.id;
  const [profiles, likes, blocks, matches] = await Promise.all([
    readCandidateProfiles(userId),
    readJson('likes.json', []),
    readJson('blocks.json', []),
    readJson('matches.json', [])
  ]);
  const plan = plans[planName] || plans.FREE;
  const hiddenIds = new Set([
    ...likes.filter((like) => like.userId === userId).map((like) => like.profileId),
    ...blocks.filter((block) => block.userId === userId || block.profileId === userId).map((block) => block.userId === userId ? block.profileId : block.userId),
    ...matches.filter((match) => match.userId === userId).map((match) => match.profileId)
  ]);
  let results = profiles.filter((profile) => !hiddenIds.has(profile.id));
  if (targetGender !== 'all' && plan.genderFilter) {
    results = results.filter((profile) => profile.gender === targetGender);
  }
  res.json({ profiles: weightedShuffle(results, planName), plan, targetGenderApplied: targetGender !== 'all' && plan.genderFilter });
});

app.post('/api/like', requireAuth, async (req, res) => {
  const { profileId, type = 'like' } = req.body || {};
  const userId = req.authedUser.id;
  const planName = String(req.authedUser.plan || 'FREE').toUpperCase();
  const selectedType = ['like', 'super', 'dual'].includes(type) ? type : 'like';
  const limit = quotaFor(planName, selectedType);

  const [profiles, users, matches, blocks] = await Promise.all([
    readCandidateProfiles(userId),
    readJson('users.json', []),
    readJson('matches.json', []),
    readJson('blocks.json', [])
  ]);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return res.status(404).json({ message: 'プロフィールが見つかりません。' });
  if (blocks.some((block) =>
    (block.userId === userId && block.profileId === profileId) ||
    (block.userId === profileId && block.profileId === userId))) {
    return res.status(403).json({ message: 'ブロック済みの相手にはいいねできません。' });
  }
  if (pairAlreadyMatched(matches, userId, profileId)) {
    const match = matches.find((item) => item.userId === userId && item.profileId === profileId) || null;
    return res.json({ ok: true, already_matched: true, matched: true, match });
  }

  // 利用枠チェックと like 追加を 1ファイルにつき直列・原子的に行い、
  // 同時リクエストでの枠の二重消費を防ぐ。
  const like = { id: uid('like'), userId, profileId, type: selectedType, plan: planName, createdAt: new Date().toISOString() };
  const likeResult = await updateJson('likes.json', [], (likes) => {
    if (userHasLiked(likes, userId, profileId)) return { value: undefined, result: 'duplicate' };
    const used = countTodayUsage(likes, userId, selectedType);
    if (used >= limit) return { value: undefined, result: 'quota' };
    return { value: [...likes, like], result: 'created' };
  });
  if (likeResult === 'quota') return res.status(402).json({ message: '本日の利用枠を使い切りました。PLUS/VIPで上限を増やせます。' });

  // 候補は実ユーザー限定。念のため非実ユーザーは安全に返す。
  if (!isRealUserId(profileId, users)) {
    return res.json({ ok: true, like: likeResult === 'created' ? like : null, already_liked: likeResult === 'duplicate', matched: false });
  }

  const me = req.authedUser;
  const targetUser = users.find((u) => u.id === profileId);

  // 相互いいねが成立していれば、その場で双方向マッチ（競合に強い直列化版）。
  const matchRows = await tryCreateMutualMatch(me, targetUser);
  const myMatch = matchRows.find((m) => m.userId === userId) || null;
  if (myMatch) {
    await resolvePendingBetween(userId, profileId);
    return res.json({ ok: true, like: likeResult === 'created' ? like : null, already_liked: likeResult === 'duplicate', matched: true, match: myMatch });
  }

  // 既にいいね済みでまだ相互でない → 何もせず終了（pending は初回に作成済み）。
  if (likeResult === 'duplicate') {
    return res.json({ ok: true, like: null, already_liked: true, matched: false });
  }

  // 初回いいねでまだ片方だけ → 相手に「いいねが届いた」状態を1件積む。
  const myProfile = userToProfile(me);
  await updateJson('received_likes.json', [], (received) => {
    const exists = received.some((r) => r.forUserId === profileId && r.fromProfileId === userId && r.status === 'pending');
    if (exists) return { value: undefined, result: false };
    return { value: [buildReceivedLikeEntry(myProfile, profileId, selectedType), ...received], result: true };
  });
  return res.json({ ok: true, like, matched: false, pending_sent: true });
});

app.get('/api/received-likes/:userId', requireAuth, async (req, res) => {
  const [received, users] = await Promise.all([
    readJson('received_likes.json', []),
    readJson('users.json', [])
  ]);
  const realUserIds = new Set(users.map((user) => user.id));
  res.json({ receivedLikes: received.filter((r) => r.forUserId === req.authedUser.id && r.status === 'pending' && realUserIds.has(r.fromProfileId)) });
});

app.post('/api/accept-like', requireAuth, async (req, res) => {
  const { receivedLikeId } = req.body || {};
  const userId = req.authedUser.id;
  const me = req.authedUser;

  let rl = null;
  const accepted = await updateJson('received_likes.json', [], (received) => {
    const idx = received.findIndex((r) => r.id === receivedLikeId && r.forUserId === userId && r.status === 'pending');
    if (idx < 0) return { value: undefined, result: false };
    rl = received[idx];
    const next = [...received];
    next[idx] = { ...rl, status: 'accepted', acceptedAt: new Date().toISOString() };
    return { value: next, result: true };
  });
  if (!accepted || !rl) return res.status(404).json({ message: '対象のいいねが見つかりません。' });

  const users = await readJson('users.json', []);
  const fromUser = users.find((u) => u.id === rl.fromProfileId);
  // received-like は常に実ユーザー発のはず。万一見つからなければ対象なし扱い。
  if (!fromUser) return res.status(404).json({ message: '対象のいいねが見つかりません。' });

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
  const matches = await readJson('matches.json', []);
  res.json({ matches: matches.filter((match) => match.userId === req.authedUser.id) });
});

app.get('/api/dm/:userId', requireAuth, async (req, res) => {
  const viewerId = req.authedUser.id;
  const [matches, messages] = await Promise.all([
    readJson('matches.json', []),
    readJson('messages.json', [])
  ]);
  const userMatches = matches.filter((match) => match.userId === viewerId && match.dmUnlocked);
  const threads = userMatches.map((match) => {
    const threadMessages = messages
      .filter((message) => messageBelongsToMatch(message, match))
      .map((message) => ({ ...message, sender: senderFor(message, viewerId) }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const openerMessage = {
      id: `opener_${match.id}`,
      matchId: match.id,
      sender: 'match',
      body: match.opener || `${match.profileName}さんとマッチしました。最初のメッセージを送ってみましょう。`,
      createdAt: match.createdAt,
      readAt: match.readAt || null,
      system: true
    };
    // 自分が送ったメッセージは自分視点では常に既読扱いにして表示。
    const normalizedMessages = threadMessages.map((message) => (
      message.sender === 'user' && !message.readAt ? { ...message, readAt: message.createdAt } : message
    ));
    return {
      match,
      messages: [openerMessage, ...normalizedMessages],
      unreadCount: (openerMessage.readAt ? 0 : 1) + normalizedMessages.filter((message) => message.sender !== 'user' && !message.readAt).length,
      updatedAt: threadMessages.at(-1)?.createdAt || match.createdAt
    };
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ threads });
});

app.post('/api/dm/read', requireAuth, async (req, res) => {
  const viewerId = req.authedUser.id;
  const matchId = cleanText(req.body?.matchId, 80);
  if (!matchId) return res.status(400).json({ message: '既読にする会話が必要です。' });

  const matches = await readJson('matches.json', []);
  const matchIndex = matches.findIndex((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
  if (matchIndex < 0) return res.status(403).json({ message: 'マッチ後だけ既読にできます。' });
  const match = matches[matchIndex];
  const convId = match.conversationId || match.id;

  const readAt = new Date().toISOString();
  matches[matchIndex] = { ...match, readAt };
  await writeJson('matches.json', matches);

  const messages = await readJson('messages.json', []);
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
  if (changed) await writeJson('messages.json', nextMessages);

  res.json({ ok: true, matchId, readAt });
});

app.post('/api/dm', requireAuth, async (req, res) => {
  const viewerId = req.authedUser.id;
  const matchId = cleanText(req.body?.matchId, 80);
  const body = cleanText(req.body?.body, 500);
  if (!matchId || !body) return res.status(400).json({ message: '送信先とメッセージ本文が必要です。' });

  const matches = await readJson('matches.json', []);
  const match = matches.find((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
  if (!match) return res.status(403).json({ message: 'マッチ後だけDMを送信できます。' });

  // 会話IDで保存することで、双方向マッチの両側に同じメッセージが見える。
  const conversationId = match.conversationId || match.id;
  const createdAt = new Date().toISOString();
  const message = { id: uid('msg'), conversationId, matchId: match.id, senderUserId: viewerId, profileId: match.profileId, body, createdAt, readAt: null };
  const messages = await readJson('messages.json', []);
  messages.push(message);
  await writeJson('messages.json', messages);
  res.status(201).json({ message: { ...message, sender: 'user' } });
});

app.post('/api/report', requireAuth, async (req, res) => {
  const reports = await readJson('reports.json', []);
  const report = { id: uid('report'), userId: req.authedUser.id, profileId: cleanText(req.body.profileId, 80), reason: cleanText(req.body.reason || '迷惑行為/不適切な内容', 120), status: 'open', createdAt: new Date().toISOString() };
  reports.unshift(report);
  await writeJson('reports.json', reports);
  res.status(201).json({ report });
});

app.post('/api/block', requireAuth, async (req, res) => {
  const userId = req.authedUser.id;
  const profileId = cleanText(req.body.profileId, 80);
  if (!profileId) return res.status(400).json({ message: 'ブロックする相手が必要です。' });
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
      if (match.userId === userId && match.profileId === profileId && match.dmUnlocked) {
        changed = true;
        return { ...match, dmUnlocked: false, blockedAt: new Date().toISOString() };
      }
      return match;
    });
    return { value: changed ? next : undefined, result: changed };
  });
  res.status(201).json({ block });
});

app.get('/api/admin/reports', requireAuth, async (req, res) => {
  if (!isAdmin(req.authedUser)) return res.status(403).json({ message: '管理者のみアクセスできます。' });
  const reports = await readJson('reports.json', []);
  res.json({ reports });
});

app.post('/api/purchase', requireAuth, async (req, res) => {
  const userId = req.authedUser.id;
  const selected = String(req.body?.plan || 'PLUS').toUpperCase();
  const validPlan = plans[selected] ? selected : 'PLUS';
  const [purchases, users] = await Promise.all([readJson('purchases.json', []), readJson('users.json', [])]);
  const purchase = { id: uid('purchase'), userId, plan: validPlan, amount: plans[validPlan].price, status: 'demo_paid', createdAt: new Date().toISOString() };
  purchases.unshift(purchase);
  const userIdx = users.findIndex((u) => u.id === userId);
  if (userIdx >= 0) users[userIdx] = { ...users[userIdx], plan: validPlan };
  await Promise.all([writeJson('purchases.json', purchases), userIdx >= 0 ? writeJson('users.json', users) : Promise.resolve()]);
  res.status(201).json({ purchase });
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
