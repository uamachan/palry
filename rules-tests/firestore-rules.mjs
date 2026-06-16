import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';

let rulesTesting = null;
try {
  rulesTesting = await import('@firebase/rules-unit-testing');
} catch (error) {
  test('Firestore Rules tests require @firebase/rules-unit-testing', { skip: 'Install @firebase/rules-unit-testing to run this test file.' }, () => {});
}

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (rulesTesting && !emulatorHost) {
  test('Firestore Rules tests require the Firestore emulator', { skip: 'Run with FIRESTORE_EMULATOR_HOST, for example via firebase emulators:exec --only firestore.' }, () => {});
}

if (rulesTesting && emulatorHost) {
  const {
    assertFails,
    assertSucceeds,
    clearFirestoreData,
    initializeTestEnvironment,
  } = rulesTesting;

  const projectId = process.env.GCLOUD_PROJECT || process.env.FIREBASE_CONFIG_PROJECT || 'demo-palry-rules';
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });

  test.after(async () => {
    await testEnv.cleanup();
  });

  test.beforeEach(async () => {
    await clearFirestoreData({ projectId });
  });

  function authDb(uid) {
    return testEnv.authenticatedContext(uid, { email_verified: true }).firestore();
  }

  async function seed(seedFn) {
    await testEnv.withSecurityRulesDisabled(async (context) => seedFn(context.firestore()));
  }

  const validPublicProfile = (id) => ({
    id,
    name: `User ${id}`,
    ageRange: '18-22',
    gender: '男性',
    rank: 'ゴールド 1',
    verified: true,
    createdAt: '2026-06-16T00:00:00.000Z',
    updatedAt: '2026-06-16T00:00:00.000Z',
  });

  test('users/{uid} は本人だけ読める', async () => {
    await seed((db) => setDoc(doc(db, 'users', 'alice'), { id: 'alice', plan: 'FREE' }));
    await assertSucceeds(getDoc(doc(authDb('alice'), 'users', 'alice')));
    await assertFails(getDoc(doc(authDb('bob'), 'users', 'alice')));
  });

  test('publicProfiles はログイン済みなら読める', async () => {
    await seed((db) => setDoc(doc(db, 'publicProfiles', 'alice'), validPublicProfile('alice')));
    await assertSucceeds(getDoc(doc(authDb('bob'), 'publicProfiles', 'alice')));
  });

  test('likes / receivedLikes / matches / reports はクライアントから作成できない', async () => {
    const db = authDb('alice');
    await assertFails(setDoc(doc(db, 'likes', 'alice_bob'), { fromUid: 'alice', toUid: 'bob', createdAt: 'now' }));
    await assertFails(setDoc(doc(db, 'receivedLikes', 'bob_from_alice'), { forUid: 'bob', fromUid: 'alice', status: 'pending' }));
    await assertFails(setDoc(doc(db, 'matches', 'alice_match_bob'), { participants: ['alice', 'bob'], createdAt: 'now' }));
    await assertFails(setDoc(doc(db, 'reports', 'alice_bob'), { reporterUid: 'alice', profileId: 'bob', reason: '', createdAt: 'now' }));
  });

  test('messages はマッチ参加者だけ作成できる', async () => {
    await seed((db) => setDoc(doc(db, 'matches', 'alice_match_bob'), { participants: ['alice', 'bob'] }));
    await assertSucceeds(addDoc(collection(authDb('alice'), 'messages'), {
      matchId: 'alice_match_bob',
      senderUid: 'alice',
      body: 'こんにちは',
      createdAt: '2026-06-16T00:00:00.000Z',
      readAt: null,
    }));
    await assertFails(addDoc(collection(authDb('mallory'), 'messages'), {
      matchId: 'alice_match_bob',
      senderUid: 'mallory',
      body: '割り込み',
      createdAt: '2026-06-16T00:00:00.000Z',
      readAt: null,
    }));
  });

  test('ブロック済み相手にはDMできない', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'matches', 'alice_match_bob'), { participants: ['alice', 'bob'] });
      await setDoc(doc(db, 'blocks', 'bob_block_alice'), { byUid: 'bob', targetUid: 'alice', createdAt: 'now' });
    });
    await assertFails(addDoc(collection(authDb('alice'), 'messages'), {
      matchId: 'alice_match_bob',
      senderUid: 'alice',
      body: '送れないはず',
      createdAt: '2026-06-16T00:00:00.000Z',
      readAt: null,
    }));
  });

  test('footprints.action は許可リストだけ保存できる', async () => {
    await assertSucceeds(addDoc(collection(authDb('alice'), 'footprints'), {
      actorUid: 'alice',
      profileId: 'bob',
      action: 'プロフィール閲覧',
      createdAt: '2026-06-16T00:00:00.000Z',
    }));
    await assertFails(addDoc(collection(authDb('alice'), 'footprints'), {
      actorUid: 'alice',
      profileId: 'bob',
      action: '外部誘導',
      createdAt: '2026-06-16T00:00:00.000Z',
    }));
  });

  test('publicProfiles.riotId / xHandle / plan / email は保存できない', async () => {
    const db = authDb('alice');
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      riotId: 'alice#JP1',
    }));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      xHandle: '@alice',
    }));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      plan: 'VIP',
    }));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      email: 'alice@example.com',
    }));
  });

  test('publicProfiles の巨大な画像・音声インライン保存は拒否される', async () => {
    const db = authDb('alice');
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      profilePhoto: 'x'.repeat(300001),
    }));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      voiceIntro: 'x'.repeat(300001),
    }));
  });
}
