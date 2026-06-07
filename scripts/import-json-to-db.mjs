import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const reset = argv.includes('--reset');

function argValue(name, fallback = undefined) {
  const eq = argv.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || fallback : fallback;
}

const dataDir = path.resolve(argValue('--data-dir', process.env.DATA_DIR || path.join(repoRoot, 'server/data')));

const SECRET_KEYS = new Set(['otpSecret', 'authCodeSalt', 'authCodeHash']);
const USER_MAPPED_KEYS = new Set([
  'id', 'name', 'gender', 'riotId', 'rank', 'peakRank', 'role', 'agents', 'xHandle', 'bio',
  'plan', 'verified', 'agreedAt', 'createdAt', 'firebaseUid', 'email', 'age', 'ageRange',
  'region', 'profilePhoto', 'tags', 'modes', 'reasons', 'updatedAt', 'voiceIntro', 'voice',
  'activeTime', 'matchScore', 'matchChance', 'trust', 'guarded', 'opener', 'autoHidden',
  'autoHiddenAt', 'autoHiddenReporters'
]);

function text(value, max = 1000) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function intOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

function floatOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bool(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOrNow(value) {
  return dateOrNull(value) || new Date();
}

function jsonOrNull(value) {
  return value === undefined ? null : value;
}

function safeLegacyData(row, mappedKeys = USER_MAPPED_KEYS) {
  const legacy = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (SECRET_KEYS.has(key) || mappedKeys.has(key)) continue;
    legacy[key] = value;
  }
  return Object.keys(legacy).length ? legacy : null;
}

function fallbackId(prefix, ...parts) {
  const raw = parts.map((part) => text(part, 80)).filter(Boolean).join('_') || `${Date.now()}`;
  return `${prefix}_${raw}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
}

async function readJsonArray(file) {
  const fullPath = path.join(dataDir, file);
  try {
    const parsed = JSON.parse(await fs.readFile(fullPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Failed to read ${fullPath}: ${error.message}`);
  }
}

function mapUser(row, source) {
  const id = text(row.id, 80);
  if (!id) return null;
  return {
    id,
    source,
    isLegacyProfile: source !== 'user',
    firebaseUid: source === 'user' ? text(row.firebaseUid, 128) : null,
    email: source === 'user' ? text(row.email, 190)?.toLowerCase() || null : null,
    name: text(row.name, 80) || id,
    gender: text(row.gender, 40),
    riotId: source === 'user' ? text(row.riotId, 80) : null,
    age: intOrNull(row.age),
    ageRange: text(row.ageRange, 40),
    region: text(row.region, 60),
    rank: text(row.rank, 60),
    peakRank: text(row.peakRank, 60),
    role: text(row.role, 60),
    agents: jsonOrNull(Array.isArray(row.agents) ? row.agents : null),
    tags: jsonOrNull(Array.isArray(row.tags) ? row.tags : null),
    modes: jsonOrNull(Array.isArray(row.modes) ? row.modes : null),
    reasons: jsonOrNull(Array.isArray(row.reasons) ? row.reasons : null),
    xHandle: text(row.xHandle, 80),
    bio: text(row.bio, 5000),
    profilePhoto: text(row.profilePhoto, 2_000_000),
    voiceIntro: text(row.voiceIntro, 2_000_000),
    voice: text(row.voice, 120),
    activeTime: text(row.activeTime, 120),
    opener: text(row.opener, 1000),
    matchScore: intOrNull(row.matchScore),
    matchChance: floatOrNull(row.matchChance),
    trust: intOrNull(row.trust),
    guarded: typeof row.guarded === 'boolean' ? row.guarded : null,
    plan: text(row.plan, 20) || 'FREE',
    verified: bool(row.verified, false),
    autoHidden: bool(row.autoHidden, false),
    autoHiddenAt: dateOrNull(row.autoHiddenAt),
    autoHiddenReporters: intOrNull(row.autoHiddenReporters),
    agreedAt: dateOrNull(row.agreedAt),
    createdAt: dateOrNow(row.createdAt),
    updatedAt: dateOrNull(row.updatedAt),
    legacyData: safeLegacyData(row)
  };
}

function placeholderUser(id) {
  return {
    id,
    source: 'legacy_missing',
    isLegacyProfile: true,
    firebaseUid: null,
    email: null,
    name: `missing:${id}`.slice(0, 80),
    gender: null,
    riotId: null,
    age: null,
    ageRange: null,
    region: null,
    rank: null,
    peakRank: null,
    role: null,
    agents: null,
    tags: null,
    modes: null,
    reasons: null,
    xHandle: null,
    bio: null,
    profilePhoto: null,
    voiceIntro: null,
    voice: null,
    activeTime: null,
    opener: null,
    matchScore: null,
    matchChance: null,
    trust: null,
    guarded: null,
    plan: 'FREE',
    verified: false,
    autoHidden: false,
    autoHiddenAt: null,
    autoHiddenReporters: null,
    agreedAt: null,
    createdAt: new Date(0),
    updatedAt: null,
    legacyData: { reason: 'referenced_by_legacy_json' }
  };
}

function newer(a, b) {
  return dateOrNow(a.createdAt).getTime() >= dateOrNow(b.createdAt).getTime() ? a : b;
}

function uniqueBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, map.has(key) ? newer(row, map.get(key)) : row);
  }
  return [...map.values()];
}

function messageSenderUserId(row) {
  if (text(row.senderUserId, 80)) return text(row.senderUserId, 80);
  if (row.sender === 'user') return text(row.userId, 80);
  if (row.sender === 'match') return text(row.profileId, 80);
  return text(row.userId, 80);
}

function collectReferencedIds(data) {
  const ids = new Set();
  const add = (value) => {
    const id = text(value, 80);
    if (id) ids.add(id);
  };
  for (const row of data.likes) { add(row.userId); add(row.profileId); }
  for (const row of data.receivedLikes) { add(row.forUserId); add(row.fromProfileId || row.fromUserId); }
  for (const row of data.matches) { add(row.userId); add(row.profileId); }
  for (const row of data.messages) { add(row.userId); add(row.profileId); add(messageSenderUserId(row)); }
  for (const row of data.blocks) { add(row.userId); add(row.profileId); }
  for (const row of data.reports) { add(row.userId || row.reporterUserId); add(row.profileId); }
  for (const row of data.purchases) add(row.userId);
  for (const row of data.singlePurchases) add(row.userId);
  return ids;
}

async function loadData() {
  return {
    users: await readJsonArray('users.json'),
    profiles: await readJsonArray('profiles.json'),
    likes: await readJsonArray('likes.json'),
    receivedLikes: await readJsonArray('received_likes.json'),
    matches: await readJsonArray('matches.json'),
    messages: await readJsonArray('messages.json'),
    blocks: await readJsonArray('blocks.json'),
    reports: await readJsonArray('reports.json'),
    auditLogs: await readJsonArray('audit.json'),
    purchases: await readJsonArray('purchases.json'),
    singlePurchases: await readJsonArray('single_purchases.json')
  };
}

function buildUsers(data) {
  const byId = new Map();
  for (const profile of data.profiles) {
    const mapped = mapUser(profile, 'legacy_profile');
    if (mapped) byId.set(mapped.id, mapped);
  }
  for (const user of data.users) {
    const mapped = mapUser(user, 'user');
    if (mapped) byId.set(mapped.id, mapped);
  }

  const referenced = collectReferencedIds(data);
  const missing = [];
  for (const id of referenced) {
    if (!byId.has(id)) {
      const placeholder = placeholderUser(id);
      byId.set(id, placeholder);
      missing.push(id);
    }
  }
  return { users: [...byId.values()], missing };
}

function summarize(data, users, missing) {
  console.log(`[json-import] dataDir: ${dataDir}`);
  console.log(`[json-import] users=${users.length} (${data.users.length} real, ${data.profiles.length} legacy profiles, ${missing.length} placeholders)`);
  for (const [name, rows] of Object.entries(data)) {
    if (name === 'users' || name === 'profiles') continue;
    console.log(`[json-import] ${name}=${rows.length}`);
  }
  if (missing.length) {
    console.warn(`[json-import] missing referenced user ids converted to placeholders: ${missing.join(', ')}`);
  }
}

async function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Set it to your PostgreSQL connection string before importing.');
  }
  const [{ PrismaPg }, { PrismaClient }] = await Promise.all([
    import('@prisma/adapter-pg'),
    import('@prisma/client')
  ]);
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

async function resetTables(prisma) {
  await prisma.$transaction([
    prisma.message.deleteMany(),
    prisma.receivedLike.deleteMany(),
    prisma.like.deleteMany(),
    prisma.block.deleteMany(),
    prisma.report.deleteMany(),
    prisma.purchase.deleteMany(),
    prisma.singlePurchase.deleteMany(),
    prisma.match.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany()
  ]);
}

async function upsertById(model, data) {
  const { id, ...update } = data;
  await model.upsert({ where: { id }, update, create: data });
}

async function importUsers(prisma, users) {
  for (const user of users) await upsertById(prisma.user, user);
  return users.length;
}

async function importLikes(prisma, rows) {
  let count = 0;
  for (const row of uniqueBy(rows, (r) => `${text(r.userId, 80)}:${text(r.profileId, 80)}`)) {
    const fromUserId = text(row.userId, 80);
    const toUserId = text(row.profileId, 80);
    if (!fromUserId || !toUserId) continue;
    const data = {
      id: text(row.id, 80) || fallbackId('like', fromUserId, toUserId),
      fromUserId,
      toUserId,
      type: text(row.type, 20) || 'like',
      plan: text(row.plan, 20),
      createdAt: dateOrNow(row.createdAt)
    };
    const { id, ...update } = data;
    await prisma.like.upsert({
      where: { fromUserId_toUserId: { fromUserId, toUserId } },
      update,
      create: data
    });
    count += 1;
  }
  return count;
}

async function importReceivedLikes(prisma, rows, hiddenUserIds) {
  let count = 0;
  for (const row of rows) {
    const forUserId = text(row.forUserId, 80);
    const fromUserId = text(row.fromProfileId || row.fromUserId, 80);
    if (!forUserId || !fromUserId) continue;
    const rawStatus = text(row.status, 30) || 'pending';
    const status = hiddenUserIds.has(fromUserId) && rawStatus === 'pending' ? 'auto_hidden' : rawStatus;
    await upsertById(prisma.receivedLike, {
      id: text(row.id, 80) || fallbackId('received', forUserId, fromUserId),
      forUserId,
      fromUserId,
      type: text(row.type, 20) || 'like',
      status,
      createdAt: dateOrNow(row.createdAt),
      acceptedAt: dateOrNull(row.acceptedAt),
      autoHiddenAt: dateOrNull(row.autoHiddenAt) || (status === 'auto_hidden' ? new Date() : null),
      blockedAt: dateOrNull(row.blockedAt),
      unhiddenAt: dateOrNull(row.unhiddenAt)
    });
    count += 1;
  }
  return count;
}

async function importMatches(prisma, rows) {
  let count = 0;
  for (const row of uniqueBy(rows, (r) => `${text(r.userId, 80)}:${text(r.profileId, 80)}`)) {
    const userId = text(row.userId, 80);
    const profileId = text(row.profileId, 80);
    if (!userId || !profileId) continue;
    const data = {
      id: text(row.id, 80) || fallbackId('match', userId, profileId),
      userId,
      profileId,
      profileName: text(row.profileName, 80),
      opener: text(row.opener, 1000),
      conversationId: text(row.conversationId, 80),
      dmUnlocked: row.dmUnlocked !== false,
      readAt: dateOrNull(row.readAt),
      blockedAt: dateOrNull(row.blockedAt),
      createdAt: dateOrNow(row.createdAt)
    };
    const { id, ...update } = data;
    await prisma.match.upsert({
      where: { userId_profileId: { userId, profileId } },
      update,
      create: data
    });
    count += 1;
  }
  return count;
}

async function importMessages(prisma, rows, matchRows) {
  const matchesById = new Map(matchRows.map((match) => [match.id, match]));
  let count = 0;
  for (const row of rows) {
    const matchId = text(row.matchId, 80);
    const match = matchId ? matchesById.get(matchId) : null;
    const senderUserId = messageSenderUserId(row);
    const body = text(row.body, 500);
    if (!body) continue;
    await upsertById(prisma.message, {
      id: text(row.id, 80) || fallbackId('msg', matchId, row.createdAt, body.slice(0, 20)),
      matchId: match ? matchId : null,
      conversationId: text(row.conversationId, 80) || text(match?.conversationId, 80) || matchId || null,
      senderUserId,
      sender: text(row.sender, 20),
      userId: text(row.userId, 80),
      profileId: text(row.profileId, 80),
      body,
      readAt: dateOrNull(row.readAt),
      createdAt: dateOrNow(row.createdAt)
    });
    count += 1;
  }
  return count;
}

async function importBlocks(prisma, rows) {
  let count = 0;
  for (const row of uniqueBy(rows, (r) => `${text(r.userId, 80)}:${text(r.profileId, 80)}`)) {
    const userId = text(row.userId, 80);
    const profileId = text(row.profileId, 80);
    if (!userId || !profileId) continue;
    const data = {
      id: text(row.id, 80) || fallbackId('block', userId, profileId),
      userId,
      profileId,
      createdAt: dateOrNow(row.createdAt)
    };
    const { id, ...update } = data;
    await prisma.block.upsert({
      where: { userId_profileId: { userId, profileId } },
      update,
      create: data
    });
    count += 1;
  }
  return count;
}

async function importReports(prisma, rows) {
  let count = 0;
  for (const row of rows) {
    const reporterUserId = text(row.userId || row.reporterUserId, 80);
    const profileId = text(row.profileId, 80);
    if (!reporterUserId || !profileId) continue;
    await upsertById(prisma.report, {
      id: text(row.id, 80) || fallbackId('report', reporterUserId, profileId, row.createdAt),
      reporterUserId,
      profileId,
      reason: text(row.reason, 120) || '迷惑行為/不適切な内容',
      status: text(row.status, 30) || 'open',
      createdAt: dateOrNow(row.createdAt),
      dismissedAt: dateOrNull(row.dismissedAt)
    });
    count += 1;
  }
  return count;
}

async function importPurchases(prisma, rows) {
  let count = 0;
  for (const row of rows) {
    const userId = text(row.userId, 80);
    if (!userId) continue;
    await upsertById(prisma.purchase, {
      id: text(row.id, 80) || fallbackId('purchase', userId, row.plan, row.createdAt),
      userId,
      plan: text(row.plan, 20) || 'PLUS',
      amount: intOrNull(row.amount) || 0,
      status: text(row.status, 30) || 'demo_paid',
      createdAt: dateOrNow(row.createdAt)
    });
    count += 1;
  }
  return count;
}

async function importSinglePurchases(prisma, rows) {
  let count = 0;
  for (const row of rows) {
    const userId = text(row.userId, 80);
    if (!userId) continue;
    await upsertById(prisma.singlePurchase, {
      id: text(row.id, 80) || fallbackId('single', userId, row.item, row.createdAt),
      userId,
      item: text(row.item, 80) || 'unknown',
      perk: text(row.perk, 40) || 'unknown',
      kind: text(row.kind, 30) || 'timed',
      amount: intOrNull(row.amount) || 0,
      status: text(row.status, 30) || 'demo_paid',
      createdAt: dateOrNow(row.createdAt),
      expiresAt: dateOrNull(row.expiresAt),
      remaining: intOrNull(row.remaining)
    });
    count += 1;
  }
  return count;
}

async function importAuditLogs(prisma, rows) {
  let count = 0;
  for (const row of rows) {
    const action = text(row.action, 80);
    if (!action) continue;
    await upsertById(prisma.auditLog, {
      id: text(row.id, 80) || fallbackId('audit', action, row.createdAt),
      action,
      actorId: text(row.actorId, 80),
      targetId: text(row.targetId, 80),
      meta: jsonOrNull(row.meta || null),
      createdAt: dateOrNow(row.createdAt)
    });
    count += 1;
  }
  return count;
}

const data = await loadData();
const { users, missing } = buildUsers(data);
summarize(data, users, missing);

if (dryRun) {
  console.log('[json-import] dry-run only; no database writes performed.');
  process.exit(0);
}

let prisma;
try {
  prisma = await createPrismaClient();
  if (reset) {
    console.warn('[json-import] --reset specified; deleting existing imported DB rows first.');
    await resetTables(prisma);
  }

  const hiddenUserIds = new Set(users.filter((user) => user.autoHidden).map((user) => user.id));
  const imported = {};
  imported.users = await importUsers(prisma, users);
  imported.likes = await importLikes(prisma, data.likes);
  imported.receivedLikes = await importReceivedLikes(prisma, data.receivedLikes, hiddenUserIds);
  imported.matches = await importMatches(prisma, data.matches);
  imported.messages = await importMessages(prisma, data.messages, data.matches);
  imported.blocks = await importBlocks(prisma, data.blocks);
  imported.reports = await importReports(prisma, data.reports);
  imported.purchases = await importPurchases(prisma, data.purchases);
  imported.singlePurchases = await importSinglePurchases(prisma, data.singlePurchases);
  imported.auditLogs = await importAuditLogs(prisma, data.auditLogs);

  console.log('[json-import] import complete');
  for (const [name, count] of Object.entries(imported)) {
    console.log(`[json-import] ${name}: ${count}`);
  }
} finally {
  await prisma?.$disconnect();
}
