import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson, uid } from './lib/jsonStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadLocalEnv();
const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '5mb' }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));

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

async function getUsage(userId, type) {
  const likes = await readJson('likes.json', []);
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

function calculateMatch(profile, type, planName) {
  const base = Number(profile.matchChance ?? 0.34);
  const typeBoost = type === 'dual' ? 0.32 : type === 'super' ? 0.22 : 0;
  const planBoost = planName === 'VIP' ? 0.12 : planName === 'PLUS' ? 0.06 : 0;
  const femaleGuard = profile.gender === '女性' ? 0.2 : 0;
  const chance = Math.max(0.08, Math.min(0.9, base + typeBoost + planBoost - femaleGuard));
  return Math.random() < chance;
}

function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function publicUser(user) {
  const { authCode, authCodeHash, authCodeSalt, otpSecret, ...safeUser } = user;
  return safeUser;
}

async function verifyFirebaseIdentity(idToken) {
  const token = cleanText(idToken, 4096);
  const apiKey = cleanText(process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY, 200);
  if (!token) {
    const error = new Error('Firebase ID tokenが必要です。');
    error.status = 401;
    throw error;
  }
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
  return {
    uid: cleanText(firebaseUser.localId, 120),
    email: cleanText(firebaseUser.email, 120),
    emailVerified: Boolean(firebaseUser.emailVerified)
  };
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'Pairly API', framework: 'React + Vite + Express' });
});

app.get('/api/plans', (req, res) => {
  res.json({ plans, singleItems });
});

app.post('/api/register', async (req, res) => {
  const payload = req.body || {};
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdentity(payload.idToken);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Firebase認証の確認に失敗しました。' });
  }
  if (!firebaseUser.emailVerified) return res.status(403).json({ message: 'メール認証を完了してからプロフィールを作成してください。' });
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
    profilePhoto: cleanText(payload.profilePhoto, 250000),
    rank: cleanText(payload.rank || 'Gold', 30),
    role: cleanText(payload.role || 'フレックス', 30),
    tags: Array.isArray(payload.tags) ? payload.tags.map((v) => cleanText(v, 30)).slice(0, 4) : [],
    agents: Array.isArray(payload.agents) ? payload.agents.map((v) => cleanText(v, 20)).slice(0, 6) : [],
    xHandle: cleanText(payload.xHandle, 40),
    bio: cleanText(payload.bio, 240),
    plan: 'FREE',
    verified: true,
    agreedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeJson('users.json', users);
  res.status(201).json({ user: publicUser(user), message: 'アカウントを作成しました。' });
});

app.post('/api/login', async (req, res) => {
  let firebaseUser;
  try {
    firebaseUser = await verifyFirebaseIdentity(req.body?.idToken);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || 'Firebase認証の確認に失敗しました。' });
  }
  if (!firebaseUser.emailVerified) return res.status(403).json({ message: 'メール認証を完了してください。' });
  const users = await readJson('users.json', []);
  const found = users.find((user) => user.firebaseUid === firebaseUser.uid);
  if (!found) return res.status(404).json({ message: 'Pairlyプロフィールが見つかりません。先にアカウント作成してください。' });
  res.json({ user: publicUser(found) });
});

app.put('/api/profile', async (req, res) => {
  const payload = req.body || {};
  const userId = cleanText(payload.userId, 80);
  if (!userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
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
    profilePhoto: cleanText(payload.profilePhoto, 250000),
    rank: cleanText(payload.rank || users[index].rank || 'Gold', 30),
    role: cleanText(payload.role || users[index].role || 'フレックス', 30),
    tags: Array.isArray(payload.tags) ? payload.tags.map((v) => cleanText(v, 30)).slice(0, 4) : [],
    agents: Array.isArray(payload.agents) ? payload.agents.map((v) => cleanText(v, 20)).slice(0, 6) : [],
    xHandle: cleanText(payload.xHandle, 40),
    bio: cleanText(payload.bio, 240),
    updatedAt: new Date().toISOString()
  };
  users[index] = updated;
  await writeJson('users.json', users);
  res.json({ user: publicUser(updated), message: 'プロフィールを更新しました。' });
});

app.get('/api/profiles', async (req, res) => {
  const planName = String(req.query.plan || 'FREE').toUpperCase();
  const targetGender = String(req.query.targetGender || 'all');
  const profiles = await readJson('profiles.json', []);
  const plan = plans[planName] || plans.FREE;
  let results = profiles;
  if (targetGender !== 'all' && plan.genderFilter) {
    results = results.filter((profile) => profile.gender === targetGender);
  }
  res.json({ profiles: weightedShuffle(results, planName), plan, targetGenderApplied: targetGender !== 'all' && plan.genderFilter });
});

app.post('/api/like', async (req, res) => {
  const { userId, profileId, type = 'like', plan = 'FREE' } = req.body || {};
  if (!userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  const planName = String(plan || 'FREE').toUpperCase();
  const selectedType = ['like', 'super', 'dual'].includes(type) ? type : 'like';
  const limit = quotaFor(planName, selectedType);
  const used = await getUsage(userId, selectedType);
  if (used >= limit) return res.status(402).json({ message: '本日の利用枠を使い切りました。PLUS/VIPで上限を増やせます。' });

  const profiles = await readJson('profiles.json', []);
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return res.status(404).json({ message: 'プロフィールが見つかりません。' });

  const likes = await readJson('likes.json', []);
  const like = { id: uid('like'), userId, profileId, type: selectedType, plan: planName, createdAt: new Date().toISOString() };
  likes.push(like);
  await writeJson('likes.json', likes);

  // マッチングは自動ではなく「相手が承認したとき」に確定する。
  // プロフィールが返いいねする確率を計算し、返いいねした場合は received_likes に積む。
  const likedBack = calculateMatch(profile, selectedType, planName);
  if (likedBack) {
    const received = await readJson('received_likes.json', []);
    const alreadyPending = received.some((r) => r.forUserId === userId && r.fromProfileId === profileId && r.status === 'pending');
    if (!alreadyPending) {
      received.unshift({ id: uid('rl'), forUserId: userId, fromProfileId: profileId, fromProfileName: profile.name, fromPhoto: profile.profilePhoto || '', fromRank: profile.rank || '', fromRole: profile.role || '', fromGender: profile.gender || '', fromAgeRange: profile.ageRange || '', likeType: selectedType, status: 'pending', createdAt: new Date().toISOString() });
      await writeJson('received_likes.json', received);
    }
  }
  res.json({ ok: true, like, liked_back: likedBack });
});

app.get('/api/received-likes/:userId', async (req, res) => {
  const received = await readJson('received_likes.json', []);
  res.json({ receivedLikes: received.filter((r) => r.forUserId === req.params.userId && r.status === 'pending') });
});

app.post('/api/accept-like', async (req, res) => {
  const { userId, receivedLikeId } = req.body || {};
  if (!userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  const received = await readJson('received_likes.json', []);
  const idx = received.findIndex((r) => r.id === receivedLikeId && r.forUserId === userId && r.status === 'pending');
  if (idx < 0) return res.status(404).json({ message: '対象のいいねが見つかりません。' });
  const rl = received[idx];
  received[idx] = { ...rl, status: 'accepted', acceptedAt: new Date().toISOString() };
  await writeJson('received_likes.json', received);
  const profiles = await readJson('profiles.json', []);
  const profile = profiles.find((p) => p.id === rl.fromProfileId);
  const matches = await readJson('matches.json', []);
  const match = { id: uid('match'), userId, profileId: rl.fromProfileId, profileName: rl.fromProfileName, opener: profile?.opener || `${rl.fromProfileName}さんとマッチしました！`, dmUnlocked: true, createdAt: new Date().toISOString() };
  matches.unshift(match);
  await writeJson('matches.json', matches);
  res.json({ ok: true, match, matched: true });
});

app.get('/api/matches/:userId', async (req, res) => {
  const matches = await readJson('matches.json', []);
  res.json({ matches: matches.filter((match) => match.userId === req.params.userId) });
});

app.get('/api/dm/:userId', async (req, res) => {
  const matches = await readJson('matches.json', []);
  const messages = await readJson('messages.json', []);
  const userMatches = matches.filter((match) => match.userId === req.params.userId && match.dmUnlocked);
  const threads = userMatches.map((match) => {
    const threadMessages = messages
      .filter((message) => message.matchId === match.id)
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

app.post('/api/dm/read', async (req, res) => {
  const userId = cleanText(req.body?.userId, 80);
  const matchId = cleanText(req.body?.matchId, 80);
  if (!userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  if (!matchId) return res.status(400).json({ message: '既読にする会話が必要です。' });

  const matches = await readJson('matches.json', []);
  const matchIndex = matches.findIndex((item) => item.id === matchId && item.userId === userId && item.dmUnlocked);
  if (matchIndex < 0) return res.status(403).json({ message: 'マッチ後だけ既読にできます。' });

  const readAt = new Date().toISOString();
  matches[matchIndex] = { ...matches[matchIndex], readAt };
  await writeJson('matches.json', matches);

  const messages = await readJson('messages.json', []);
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message.matchId === matchId && message.sender !== 'user' && !message.readAt) {
      changed = true;
      return { ...message, readAt };
    }
    return message;
  });
  if (changed) await writeJson('messages.json', nextMessages);

  res.json({ ok: true, matchId, readAt });
});

app.post('/api/dm', async (req, res) => {
  const userId = cleanText(req.body?.userId, 80);
  const matchId = cleanText(req.body?.matchId, 80);
  const body = cleanText(req.body?.body, 500);
  if (!userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  if (!matchId || !body) return res.status(400).json({ message: '送信先とメッセージ本文が必要です。' });

  const matches = await readJson('matches.json', []);
  const match = matches.find((item) => item.id === matchId && item.userId === userId && item.dmUnlocked);
  if (!match) return res.status(403).json({ message: 'マッチ後だけDMを送信できます。' });

  const messages = await readJson('messages.json', []);
  const createdAt = new Date().toISOString();
  const message = { id: uid('msg'), matchId, userId, profileId: match.profileId, sender: 'user', body, createdAt, readAt: createdAt };
  messages.push(message);
  await writeJson('messages.json', messages);
  res.status(201).json({ message });
});

app.post('/api/report', async (req, res) => {
  if (!req.body?.userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  const reports = await readJson('reports.json', []);
  const report = { id: uid('report'), userId: req.body.userId, profileId: req.body.profileId, reason: cleanText(req.body.reason || '迷惑行為/不適切な内容', 120), status: 'open', createdAt: new Date().toISOString() };
  reports.unshift(report);
  await writeJson('reports.json', reports);
  res.status(201).json({ report });
});

app.post('/api/block', async (req, res) => {
  if (!req.body?.userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  const blocks = await readJson('blocks.json', []);
  const block = { id: uid('block'), userId: req.body.userId, profileId: req.body.profileId, createdAt: new Date().toISOString() };
  blocks.unshift(block);
  await writeJson('blocks.json', blocks);
  res.status(201).json({ block });
});

app.get('/api/admin/reports', async (req, res) => {
  const reports = await readJson('reports.json', []);
  res.json({ reports });
});

app.post('/api/purchase', async (req, res) => {
  if (!req.body?.userId) return res.status(401).json({ message: 'アカウント作成後に利用できます。' });
  const purchases = await readJson('purchases.json', []);
  const selected = String(req.body?.plan || 'PLUS').toUpperCase();
  const purchase = { id: uid('purchase'), userId: req.body.userId, plan: selected, amount: plans[selected]?.price || 0, status: 'demo_paid', createdAt: new Date().toISOString() };
  purchases.unshift(purchase);
  await writeJson('purchases.json', purchases);
  res.status(201).json({ purchase });
});

if (isProduction) {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(port, () => {
  console.log(`Pairly API running on http://localhost:${port}`);
});
