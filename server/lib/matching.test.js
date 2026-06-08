// `node --test` で実行。マッチング/利用枠/エンタイトルメントの純粋関数を検証。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sameDay, countTodayUsage, weightedShuffle, activeEntitlements, boostedUserIds,
  isRealUserId, pairAlreadyMatched, userHasLiked, buildReceivedLikeEntry, makeMatchRow,
  senderFor, conversationIdOf, messageInConversation
} from './matching.js';
import { LIKE_STATUS } from './statuses.js';

test('sameDay: 日付(YYYY-MM-DD)一致', () => {
  assert.equal(sameDay('2026-06-08T01:00:00Z', '2026-06-08T23:00:00Z'), true);
  assert.equal(sameDay('2026-06-08T01:00:00Z', '2026-06-09T00:00:00Z'), false);
  assert.equal(sameDay(undefined, '2026-06-08T00:00:00Z'), false);
});

test('countTodayUsage: 本日・指定種別のみ数える', () => {
  const today = new Date().toISOString();
  const likes = [
    { userId: 'u1', type: 'like', createdAt: today },
    { userId: 'u1', type: 'like', createdAt: today },
    { userId: 'u1', type: 'super', createdAt: today },     // 種別違い
    { userId: 'u2', type: 'like', createdAt: today },       // 他人
    { userId: 'u1', type: 'like', createdAt: '2000-01-01T00:00:00Z' } // 過去
  ];
  assert.equal(countTodayUsage(likes, 'u1', 'like'), 2);
  assert.equal(countTodayUsage(likes, 'u1', 'super'), 1);
});

test('weightedShuffle: 要素を落とさず並べ替える', () => {
  const profiles = [{ id: 'a' }, { id: 'b', gender: '女性' }, { id: 'c' }];
  const out = weightedShuffle(profiles, 'FREE');
  assert.equal(out.length, 3);
  assert.deepEqual(new Set(out.map((p) => p.id)), new Set(['a', 'b', 'c']));
  // 入力配列は破壊しない
  assert.equal(profiles[0].id, 'a');
});

test('activeEntitlements: 期限内 timed と consumable 合算', () => {
  const now = Date.now();
  const future = new Date(now + 1000).toISOString();
  const past = new Date(now - 1000).toISOString();
  const purchases = [
    { userId: 'u1', kind: 'timed', perk: 'genderFilter', expiresAt: future },
    { userId: 'u1', kind: 'timed', perk: 'boost', expiresAt: past },        // 期限切れ
    { userId: 'u1', kind: 'consumable', perk: 'superCredits', remaining: 3 },
    { userId: 'u1', kind: 'consumable', perk: 'superCredits', remaining: 2 },
    { userId: 'u2', kind: 'consumable', perk: 'superCredits', remaining: 9 } // 他人
  ];
  const ent = activeEntitlements(purchases, 'u1', now);
  assert.equal(ent.genderFilter, true);
  assert.equal(ent.boost, false);
  assert.equal(ent.superCredits, 5);
});

test('boostedUserIds: 有効な boost/spotlight のユーザー集合', () => {
  const now = Date.now();
  const future = new Date(now + 1000).toISOString();
  const past = new Date(now - 1000).toISOString();
  const ids = boostedUserIds([
    { userId: 'a', kind: 'timed', perk: 'boost', expiresAt: future },
    { userId: 'b', kind: 'timed', perk: 'spotlight', expiresAt: past }, // 期限切れ
    { userId: 'c', kind: 'consumable', perk: 'superCredits', remaining: 1 }
  ], now);
  assert.deepEqual([...ids], ['a']);
});

test('isRealUserId / pairAlreadyMatched / userHasLiked', () => {
  assert.equal(isRealUserId('u1', [{ id: 'u1' }]), true);
  assert.equal(isRealUserId('zz', [{ id: 'u1' }]), false);

  const matches = [{ userId: 'a', profileId: 'b' }];
  assert.equal(pairAlreadyMatched(matches, 'a', 'b'), true);
  assert.equal(pairAlreadyMatched(matches, 'b', 'a'), true); // 逆向きも
  assert.equal(pairAlreadyMatched(matches, 'a', 'c'), false);

  const likes = [{ userId: 'a', profileId: 'b' }];
  assert.equal(userHasLiked(likes, 'a', 'b'), true);
  assert.equal(userHasLiked(likes, 'b', 'a'), false);
});

test('buildReceivedLikeEntry: pending で組み立てる', () => {
  const e = buildReceivedLikeEntry({ id: 'p1', name: 'はな', profilePhoto: '', rank: 'Gold 1' }, 'u2', 'super');
  assert.equal(e.forUserId, 'u2');
  assert.equal(e.fromProfileId, 'p1');
  assert.equal(e.likeType, 'super');
  assert.equal(e.status, LIKE_STATUS.PENDING);
  assert.ok(e.id.startsWith('rl_'));
});

test('makeMatchRow: 所有者と相手プロフィールを保持', () => {
  const row = makeMatchRow('owner', { id: 'other', name: 'はな', rank: 'Gold 1' }, 'conv1', true);
  assert.equal(row.userId, 'owner');
  assert.equal(row.profileId, 'other');
  assert.equal(row.conversationId, 'conv1');
  assert.equal(row.dmUnlocked, true);
  assert.equal(row.isRealUser, true);
  assert.ok(row.id.startsWith('match_'));
});

test('senderFor: 視点に応じた送信者判定', () => {
  assert.equal(senderFor({ senderUserId: 'me' }, 'me'), 'user');
  assert.equal(senderFor({ senderUserId: 'other' }, 'me'), 'match');
  assert.equal(senderFor({ sender: 'match' }, 'me'), 'match'); // 旧データ
});

test('conversationIdOf / messageInConversation: 新旧データ判定', () => {
  assert.equal(conversationIdOf({ conversationId: 'c1', id: 'm1' }), 'c1');
  assert.equal(conversationIdOf({ id: 'm1' }), 'm1'); // 旧データはマッチID

  // 新データは conversationId で判定
  assert.equal(messageInConversation({ conversationId: 'c1' }, 'c1', 'm1'), true);
  assert.equal(messageInConversation({ conversationId: 'c2' }, 'c1', 'm1'), false);
  // 旧データは matchId で判定
  assert.equal(messageInConversation({ matchId: 'm1' }, 'c1', 'm1'), true);
  assert.equal(messageInConversation({ matchId: 'm9' }, 'c1', 'm1'), false);
});
