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
    await testEnv.clearFirestore();
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

  test('messages は参加者だけ読めるがクライアントから作成できない', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'matches', 'alice_match_bob'), { participants: ['alice', 'bob'] });
      await setDoc(doc(db, 'messages', 'm1'), {
        matchId: 'alice_match_bob',
        senderUid: 'alice',
        body: 'こんにちは',
        createdAt: '2026-06-16T00:00:00.000Z',
        readAt: null,
      });
    });

    await assertSucceeds(getDoc(doc(authDb('alice'), 'messages', 'm1')));
    await assertSucceeds(getDoc(doc(authDb('bob'), 'messages', 'm1')));
    await assertFails(getDoc(doc(authDb('mallory'), 'messages', 'm1')));
    await assertFails(addDoc(collection(authDb('alice'), 'messages'), {
      matchId: 'alice_match_bob',
      senderUid: 'alice',
      body: '直接送信は拒否される',
      createdAt: '2099-01-01T00:00:00.000Z',
      readAt: '2099-01-01T00:00:00.000Z',
    }));
  });

  test('footprints はクライアントから一切書き込めない（Functions経由のみ）', async () => {
    const db = authDb('alice');
    await assertFails(setDoc(doc(db, 'footprints', 'bob_from_alice_2026-06-16'), {
      actorUid: 'alice',
      profileId: 'bob',
      action: 'プロフィール閲覧',
      day: '2026-06-16',
      createdAt: '2026-06-16T00:00:00.000Z',
    }));
    await assertFails(setDoc(doc(db, 'footprints', 'random'), {
      actorUid: 'alice',
      profileId: 'bob',
      action: 'プロフィール閲覧',
      day: '2026-06-16',
      createdAt: '2026-06-16T00:00:00.000Z',
    }));
    await assertFails(setDoc(doc(db, 'footprints', 'bob_from_alice_2026-06-16'), {
      actorUid: 'alice',
      profileId: 'bob',
      action: '外部誘導',
      day: '2026-06-16',
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

  test('publicProfiles の外部メディアURLと他人のStorage pathは拒否される', async () => {
    const db = authDb('alice');
    await assertSucceeds(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      profilePhotoUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/profileMedia%2Falice%2Fa.png?alt=media',
      profilePhotoPath: 'profileMedia/alice/a.png',
    }));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      profilePhotoUrl: 'https://example.com/track.png',
    }));
    await assertFails(setDoc(doc(db, 'publicProfiles', 'alice'), {
      ...validPublicProfile('alice'),
      profilePhotoPath: 'profileMedia/bob/a.png',
    }));
  });

  test('users 作成は verified:true をクライアントから立てられない（spoofing防止）', async () => {
    const db = authDb('alice');
    const baseUserCreate = {
      id: 'alice',
      name: 'Alice',
      plan: 'FREE',
      createdAt: '2026-06-16T00:00:00.000Z',
      updatedAt: '2026-06-16T00:00:00.000Z',
    };
    // verified:true は拒否（信頼できる Functions/Admin SDK だけが立てられる）
    await assertFails(setDoc(doc(db, 'users', 'alice'), { ...baseUserCreate, verified: true }));
    // verified:false なら作成できる（register() が書き込む値）
    await assertSucceeds(setDoc(doc(db, 'users', 'alice'), { ...baseUserCreate, verified: false }));
  });
}
