// `node --test` で実行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicUser, isVisibleUser, pairBlocked, userToProfile } from './users.js';

test('publicUser: 認証関連の秘密を落とす', () => {
  const safe = publicUser({
    id: 'u1', name: 'たろう', email: 'a@b.com',
    authCode: 'x', authCodeHash: 'y', authCodeSalt: 'z', otpSecret: 's', firebaseUid: 'fb'
  });
  assert.equal(safe.id, 'u1');
  assert.equal(safe.name, 'たろう');
  assert.equal(safe.email, 'a@b.com');
  for (const secret of ['authCode', 'authCodeHash', 'authCodeSalt', 'otpSecret', 'firebaseUid']) {
    assert.ok(!(secret in safe), `${secret} が漏れている`);
  }
});

test('isVisibleUser: firebaseUid あり かつ 非autoHidden のみ true', () => {
  assert.equal(isVisibleUser({ firebaseUid: 'fb' }), true);
  assert.equal(isVisibleUser({ firebaseUid: 'fb', autoHidden: true }), false);
  assert.equal(isVisibleUser({}), false);          // firebaseUid なし
  assert.equal(isVisibleUser(null), false);
});

test('pairBlocked: どちら向きのブロックでも検出', () => {
  const blocks = [{ userId: 'a', profileId: 'b' }];
  assert.equal(pairBlocked(blocks, 'a', 'b'), true);
  assert.equal(pairBlocked(blocks, 'b', 'a'), true); // 逆向きも
  assert.equal(pairBlocked(blocks, 'a', 'c'), false);
  assert.equal(pairBlocked([], 'a', 'b'), false);
});

test('userToProfile: 整形と既定値', () => {
  const p = userToProfile({ id: 'u1', name: 'はな', gender: '女性', age: '25', region: '関東', rank: 'Gold', role: 'センチネル', verified: true });
  assert.equal(p.id, 'u1');
  assert.equal(p.gender, '女性');
  assert.equal(p.ageRange, '25歳');     // 数値年齢は「歳」付与
  assert.equal(p.rank, 'Gold 1');        // 別名展開
  assert.equal(p.trust, 90);             // verified=true
  assert.equal(p.guarded, false);
  // 配列項目は既定で空配列
  assert.deepEqual(p.tags, []);
  assert.deepEqual(p.maps, []);
  // 年齢未設定
  assert.equal(userToProfile({ id: 'u2', name: 'x' }).ageRange, '年齢未設定');
  assert.equal(userToProfile({ id: 'u3', name: 'y' }).trust, 72); // 未認証
});
