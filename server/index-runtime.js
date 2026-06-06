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
await fs.writeFile(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
