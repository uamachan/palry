import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'index.js');
const runtimePath = path.join(__dirname, '.index-runtime.generated.js');

let source = await fs.readFile(sourcePath, 'utf8');

const originalProfilesRouteBlock = `  const [profiles, likes, blocks, matches, singlePurchases] = await Promise.all([
    readCandidateProfiles(userId),
    readJson('likes.json', []),
    readJson('blocks.json', []),
    readJson('matches.json', []),
    readJson('single_purchases.json', [])
  ]);
  const plan = plans[planName] || plans.FREE;
  const entitlements = activeEntitlements(singlePurchases, userId);
  // 性別フィルターはプラン特典 or 単発購入（7日）で有効。
  const genderFilterAllowed = plan.genderFilter || entitlements.genderFilter;
  const hiddenIds = new Set([
    ...likes.filter((like) => like.userId === userId).map((like) => like.profileId),
    ...blocks.filter((block) => block.userId === userId || block.profileId === userId).map((block) => block.userId === userId ? block.profileId : block.userId),
    ...matches.filter((match) => match.userId === userId).map((match) => match.profileId)
  ]);
  let results = profiles.filter((profile) => !hiddenIds.has(profile.id));`;

const patchedProfilesRouteBlock = `  const [profiles, blocks, singlePurchases] = await Promise.all([
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
  let results = profiles.filter((profile) => !hiddenIds.has(profile.id));`;

if (!source.includes(originalProfilesRouteBlock)) {
  throw new Error('index-runtime patch failed: /api/profiles block not found. Update server/index-runtime.js to match server/index.js.');
}

source = source.replace(originalProfilesRouteBlock, patchedProfilesRouteBlock);

source = source.replace(
  `function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}`,
  `function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function cleanAge(value) {
  const digits = String(value || '').replace(/\\D/g, '').slice(0, 2);
  const age = Number(digits);
  if (!Number.isInteger(age) || age < 13 || age > 80) return '';
  return String(age);
}`
);

source = source.replace(
  `  if (!payload.age) return res.status(400).json({ message: '年齢が必要です。' });`,
  `  const safeAge = cleanAge(payload.age);
  if (!safeAge) return res.status(400).json({ message: '年齢は13〜80歳で入力してください。' });`
);
source = source.replace(
  `  if (!payload.age) return res.status(400).json({ message: '年齢が必要です。' });`,
  `  const safeAge = cleanAge(payload.age);
  if (!safeAge) return res.status(400).json({ message: '年齢は13〜80歳で入力してください。' });`
);
source = source.replaceAll(`age: cleanText(payload.age, 10),`, `age: safeAge,`);

const originalReceivedLikeBlock = `  const myProfile = userToProfile(me);
  await updateJson('received_likes.json', [], (received) => {
    const exists = received.some((r) => r.forUserId === profileId && r.fromProfileId === userId && r.status === 'pending');
    if (exists) return { value: undefined, result: false };
    return { value: [buildReceivedLikeEntry(myProfile, profileId, selectedType), ...received], result: true };
  });
  return res.json({ ok: true, like, matched: false, pending_sent: true });`;

const patchedReceivedLikeBlock = `  const myProfile = userToProfile(me);
  const receivedLike = buildReceivedLikeEntry(myProfile, profileId, selectedType);
  const pendingResult = await updateJson('received_likes.json', [], (received) => {
    const exists = received.some((r) => r.forUserId === profileId && r.fromProfileId === userId && r.status === 'pending');
    if (exists) return { value: undefined, result: false };
    return { value: [receivedLike, ...received], result: true };
  });
  return res.json({ ok: true, like, matched: false, pending_sent: Boolean(pendingResult), receivedLike: pendingResult ? receivedLike : null });`;

if (!source.includes(originalReceivedLikeBlock)) {
  throw new Error('index-runtime patch failed: /api/like received-like block not found. Update server/index-runtime.js to match server/index.js.');
}
source = source.replace(originalReceivedLikeBlock, patchedReceivedLikeBlock);

// 新フロントは /api/received-likes/me を使う。
// 既存の /api/received-likes/:userId は Express 上で me も受けられるが、
// runtime生成後のコードにも明示的に /me を追加してAPIの意図を固定する。
const receivedLikesRoute = `app.get('/api/received-likes/:userId', requireAuth, async (req, res) => {
  const [received, users] = await Promise.all([
    readJson('received_likes.json', []),
    readJson('users.json', [])
  ]);
  const realUserIds = new Set(users.map((user) => user.id));
  res.json({ receivedLikes: received.filter((r) => r.forUserId === req.authedUser.id && r.status === 'pending' && realUserIds.has(r.fromProfileId)) });
});`;

const receivedLikesRoutes = `async function sendReceivedLikesForCurrentUser(req, res) {
  const [received, users] = await Promise.all([
    readJson('received_likes.json', []),
    readJson('users.json', [])
  ]);
  const realUserIds = new Set(users.map((user) => user.id));
  res.json({ receivedLikes: received.filter((r) => r.forUserId === req.authedUser.id && r.status === 'pending' && realUserIds.has(r.fromProfileId)) });
}

app.get('/api/received-likes/me', requireAuth, sendReceivedLikesForCurrentUser);
app.get('/api/received-likes/:userId', requireAuth, sendReceivedLikesForCurrentUser);`;

if (!source.includes(receivedLikesRoute)) {
  throw new Error('index-runtime patch failed: /api/received-likes route block not found. Update server/index-runtime.js to match server/index.js.');
}
source = source.replace(receivedLikesRoute, receivedLikesRoutes);

const originalReadStateBlock = `    // 自分が送ったメッセージは自分視点では常に既読扱いにして表示。
    const normalizedMessages = threadMessages.map((message) => (
      message.sender === 'user' && !message.readAt ? { ...message, readAt: message.createdAt } : message
    ));`;
const patchedReadStateBlock = `    // 自分が送ったメッセージも、相手が /api/dm/read するまで未読のまま返す。
    const normalizedMessages = threadMessages;`;
if (!source.includes(originalReadStateBlock)) {
  throw new Error('index-runtime patch failed: DM read-state block not found. Update server/index-runtime.js to match server/index.js.');
}
source = source.replace(originalReadStateBlock, patchedReadStateBlock);

const originalDmSendBlock = `  const matches = await readJson('matches.json', []);
  const match = matches.find((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
  if (!match) return res.status(403).json({ message: 'マッチ後だけDMを送信できます。' });

  // 会話IDで保存することで、双方向マッチの両側に同じメッセージが見える。
  const conversationId = match.conversationId || match.id;
  const createdAt = new Date().toISOString();
  const message = { id: uid('msg'), conversationId, matchId: match.id, senderUserId: viewerId, profileId: match.profileId, body, createdAt, readAt: null };
  await updateJson('messages.json', [], (messages) => ({ value: [...messages, message], result: message }));
  res.status(201).json({ message: { ...message, sender: 'user' } });`;
const patchedDmSendBlock = `  const [matches, blocks] = await Promise.all([
    readJson('matches.json', []),
    readJson('blocks.json', [])
  ]);
  const match = matches.find((item) => item.id === matchId && item.userId === viewerId && item.dmUnlocked);
  if (!match) return res.status(403).json({ message: 'マッチ後だけDMを送信できます。' });

  const blocked = blocks.some((block) =>
    (block.userId === viewerId && block.profileId === match.profileId) ||
    (block.userId === match.profileId && block.profileId === viewerId)
  );
  if (blocked) return res.status(403).json({ message: 'ブロック済みの相手にはDMを送信できません。' });

  // 会話IDで保存することで、双方向マッチの両側に同じメッセージが見える。
  const conversationId = match.conversationId || match.id;
  const createdAt = new Date().toISOString();
  const message = { id: uid('msg'), conversationId, matchId: match.id, senderUserId: viewerId, profileId: match.profileId, body, createdAt, readAt: null };
  await updateJson('messages.json', [], (messages) => {
    const recentDuplicate = messages.some((existing) =>
      (existing.conversationId ? existing.conversationId === conversationId : existing.matchId === match.id) &&
      existing.senderUserId === viewerId &&
      existing.body === body &&
      Date.now() - new Date(existing.createdAt).getTime() < 2500
    );
    if (recentDuplicate) return { value: undefined, result: message };
    return { value: [...messages, message], result: message };
  });
  res.status(201).json({ message: { ...message, sender: 'user' } });`;
if (!source.includes(originalDmSendBlock)) {
  throw new Error('index-runtime patch failed: DM send block not found. Update server/index-runtime.js to match server/index.js.');
}
source = source.replace(originalDmSendBlock, patchedDmSendBlock);

const originalBlockDmDisableBlock = `  await updateJson('matches.json', [], (matches) => {
    let changed = false;
    const next = matches.map((match) => {
      if (match.userId === userId && match.profileId === profileId && match.dmUnlocked) {
        changed = true;
        return { ...match, dmUnlocked: false, blockedAt: new Date().toISOString() };
      }
      return match;
    });
    return { value: changed ? next : undefined, result: changed };
  });`;
const patchedBlockDmDisableBlock = `  await updateJson('matches.json', [], (matches) => {
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
  });`;
if (!source.includes(originalBlockDmDisableBlock)) {
  throw new Error('index-runtime patch failed: block DM disable block not found. Update server/index-runtime.js to match server/index.js.');
}
source = source.replace(originalBlockDmDisableBlock, patchedBlockDmDisableBlock);

await fs.writeFile(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
