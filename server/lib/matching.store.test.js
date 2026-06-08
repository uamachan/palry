// 永続化(jsonStore)を伴うマッチング関数の統合テスト。
// 一時ディレクトリを DATA_DIR にして実データを汚さない。
// jsonStore は読み込み時に DATA_DIR を確定するため、env 設定後に動的 import する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'palry-store-test-'));
process.env.DATA_DIR = tmpDir;

const { getDataDir, readJson, writeJson } = await import('./jsonStore.js');
const { tryCreateMutualMatch, resolvePendingBetween, setReceivedLikesFromUserStatus } = await import('./matching.js');
const { LIKE_STATUS } = await import('./statuses.js');

// 安全ガード: 万一 DATA_DIR が一時ディレクトリでなければ、実データ破壊を避けて即失敗させる。
assert.equal(getDataDir(), tmpDir, 'DATA_DIR が一時ディレクトリに向いていない');

const userA = { id: 'A', name: 'えー' };
const userB = { id: 'B', name: 'びー' };

test('tryCreateMutualMatch: 片側だけのいいねでは成立しない', async () => {
  await writeJson('likes.json', [{ userId: 'A', profileId: 'B' }]); // A→B のみ
  await writeJson('matches.json', []);
  const rows = await tryCreateMutualMatch(userA, userB);
  assert.deepEqual(rows, []);
  assert.deepEqual(await readJson('matches.json', []), []);
});

test('tryCreateMutualMatch: 相互いいねで双方向マッチを1回だけ作る', async () => {
  await writeJson('likes.json', [
    { userId: 'A', profileId: 'B' },
    { userId: 'B', profileId: 'A' }
  ]);
  await writeJson('matches.json', []);

  const rows = await tryCreateMutualMatch(userA, userB);
  assert.equal(rows.length, 2);
  const owners = rows.map((r) => r.userId).sort();
  assert.deepEqual(owners, ['A', 'B']);
  // 同じ会話IDを共有する
  assert.equal(rows[0].conversationId, rows[1].conversationId);

  // 二重実行しても増えない（既存行をそのまま返す）
  const again = await tryCreateMutualMatch(userA, userB);
  assert.equal(again.length, 2);
  assert.equal((await readJson('matches.json', [])).length, 2);
});

test('resolvePendingBetween: 対象ペアの pending を accepted に変える', async () => {
  await writeJson('received_likes.json', [
    { id: 'rl1', forUserId: 'B', fromProfileId: 'A', status: LIKE_STATUS.PENDING },
    { id: 'rl2', forUserId: 'C', fromProfileId: 'D', status: LIKE_STATUS.PENDING } // 無関係
  ]);
  await resolvePendingBetween('A', 'B');
  const rows = await readJson('received_likes.json', []);
  assert.equal(rows.find((r) => r.id === 'rl1').status, LIKE_STATUS.ACCEPTED);
  assert.equal(rows.find((r) => r.id === 'rl2').status, LIKE_STATUS.PENDING); // 無関係は不変
});

test('setReceivedLikesFromUserStatus: 自動非表示と解除で pending<->auto_hidden', async () => {
  await writeJson('received_likes.json', [
    { id: 'rl1', forUserId: 'B', fromProfileId: 'X', status: LIKE_STATUS.PENDING }
  ]);
  await setReceivedLikesFromUserStatus('X', true);
  assert.equal((await readJson('received_likes.json', []))[0].status, LIKE_STATUS.AUTO_HIDDEN);

  await setReceivedLikesFromUserStatus('X', false);
  assert.equal((await readJson('received_likes.json', []))[0].status, LIKE_STATUS.PENDING);
});

test.after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
