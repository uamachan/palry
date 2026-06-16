/**
 * Firestore Rules ユニットテスト
 *
 * 実行方法:
 *   firebase emulators:exec --only firestore 'npm run test:rules'
 *
 * または Firestore エミュレータを先に起動してから:
 *   npm run test:rules
 */

import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES = readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8');
const PROJECT_ID = 'palry-rules-test';

const NOW = new Date().toISOString();

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES, host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

// ── ヘルパー ──────────────────────────────────────────────────────────────
function authed(uid, emailVerified = true) {
  return testEnv.authenticatedContext(uid, { email_verified: emailVerified });
}
function unauthed() {
  return testEnv.unauthenticatedContext();
}

// テスト用にデータをセットアップ（Admin SDK 経由でルールをバイパス）
async function adminSet(path, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const parts = path.split('/');
    const ref = doc(db, ...parts);
    await setDoc(ref, data);
  });
}

// ── users ─────────────────────────────────────────────────────────────────
describe('users/{uid}', () => {
  before(async () => {
    await adminSet('users/alice', { id: 'alice', name: 'Alice', plan: 'FREE', verified: true });
    await adminSet('users/bob', { id: 'bob', name: 'Bob', plan: 'FREE', verified: true });
  });

  it('本人は読める', async () => {
    const db = authed('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
  });

  it('他人は読めない', async () => {
    const db = authed('bob').firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
  });

  it('未認証は読めない', async () => {
    const db = unauthed().firestore();
    await assertFails(getDoc(doc(db, 'users/alice')));
  });

  it('削除は不可', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    const db = authed('alice').firestore();
    await assertFails(deleteDoc(doc(db, 'users/alice')));
  });
});

// ── publicProfiles ────────────────────────────────────────────────────────
describe('publicProfiles/{uid}', () => {
  before(async () => {
    await adminSet('publicProfiles/alice', {
      id: 'alice', name: 'Alice', gender: '女性', rank: 'Gold 1',
      verified: true, createdAt: NOW, updatedAt: NOW,
    });
  });

  it('ログイン済みなら読める', async () => {
    const db = authed('bob').firestore();
    await assertSucceeds(getDoc(doc(db, 'publicProfiles/alice')));
  });

  it('未認証は読めない', async () => {
    const db = unauthed().firestore();
    await assertFails(getDoc(doc(db, 'publicProfiles/alice')));
  });

  it('riotId は保存できない', async () => {
    await adminSet('users/alice', { id: 'alice', name: 'Alice', plan: 'FREE', verified: true });
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'publicProfiles/alice'), {
      id: 'alice', name: 'Alice', riotId: 'Alice#1234', createdAt: NOW, updatedAt: NOW,
    }));
  });

  it('xHandle は保存できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'publicProfiles/alice'), {
      id: 'alice', name: 'Alice', xHandle: '@alice', createdAt: NOW, updatedAt: NOW,
    }));
  });

  it('plan は保存できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'publicProfiles/alice'), {
      id: 'alice', name: 'Alice', plan: 'VIP', createdAt: NOW, updatedAt: NOW,
    }));
  });

  it('doc ID と異なる id フィールドは保存できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'publicProfiles/alice'), {
      id: 'bob', name: 'Alice', createdAt: NOW, updatedAt: NOW,
    }));
  });
});

// ── likes ─────────────────────────────────────────────────────────────────
describe('likes/{likeId}', () => {
  it('クライアントから作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'likes/alice_bob'), {
      fromUid: 'alice', toUid: 'bob', type: 'like', createdAt: NOW,
    }));
  });

  it('クライアントから更新できない', async () => {
    await adminSet('likes/alice_bob', { fromUid: 'alice', toUid: 'bob', type: 'like', createdAt: NOW });
    const { updateDoc } = await import('firebase/firestore');
    const db = authed('alice').firestore();
    await assertFails(updateDoc(doc(db, 'likes/alice_bob'), { type: 'super' }));
  });

  it('クライアントから削除できない', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    const db = authed('alice').firestore();
    await assertFails(deleteDoc(doc(db, 'likes/alice_bob')));
  });

  it('本人は読める', async () => {
    await adminSet('likes/alice_bob', { fromUid: 'alice', toUid: 'bob', type: 'like', createdAt: NOW });
    const db = authed('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'likes/alice_bob')));
  });
});

// ── receivedLikes ──────────────────────────────────────────────────────────
describe('receivedLikes/{id}', () => {
  it('クライアントから作成できない', async () => {
    const db = authed('bob').firestore();
    await assertFails(setDoc(doc(db, 'receivedLikes/bob_from_alice'), {
      forUid: 'bob', fromUid: 'alice', type: 'like', status: 'pending', createdAt: NOW,
    }));
  });

  it('受信者が status:blocked に更新できる', async () => {
    await adminSet('receivedLikes/bob_from_alice', {
      forUid: 'bob', fromUid: 'alice', type: 'like', status: 'pending', createdAt: NOW,
    });
    const { updateDoc } = await import('firebase/firestore');
    const db = authed('bob').firestore();
    await assertSucceeds(updateDoc(doc(db, 'receivedLikes/bob_from_alice'), { status: 'blocked' }));
  });

  it('受信者が status:accepted には更新できない（Function経由のみ）', async () => {
    await adminSet('receivedLikes/bob_from_alice', {
      forUid: 'bob', fromUid: 'alice', type: 'like', status: 'pending', createdAt: NOW,
    });
    const { updateDoc } = await import('firebase/firestore');
    const db = authed('bob').firestore();
    await assertFails(updateDoc(doc(db, 'receivedLikes/bob_from_alice'), { status: 'accepted' }));
  });
});

// ── matches ────────────────────────────────────────────────────────────────
describe('matches/{matchId}', () => {
  it('クライアントから作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'matches/alice_match_bob'), {
      id: 'alice_match_bob', participants: ['alice', 'bob'], createdAt: NOW,
    }));
  });

  it('参加者は読める', async () => {
    await adminSet('matches/alice_match_bob', {
      id: 'alice_match_bob', participants: ['alice', 'bob'], createdAt: NOW,
    });
    const db = authed('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'matches/alice_match_bob')));
  });

  it('第三者は読めない', async () => {
    const db = authed('charlie').firestore();
    await assertFails(getDoc(doc(db, 'matches/alice_match_bob')));
  });
});

// ── messages ───────────────────────────────────────────────────────────────
describe('messages/{messageId}', () => {
  before(async () => {
    await adminSet('matches/alice_match_bob', {
      id: 'alice_match_bob', participants: ['alice', 'bob'], createdAt: NOW,
    });
  });

  it('マッチ参加者はメッセージを作成できる', async () => {
    const db = authed('alice').firestore();
    await assertSucceeds(addDoc(collection(db, 'messages'), {
      matchId: 'alice_match_bob', senderUid: 'alice',
      body: 'こんにちは', createdAt: NOW, readAt: null,
    }));
  });

  it('非参加者はメッセージを作成できない', async () => {
    const db = authed('charlie').firestore();
    await assertFails(addDoc(collection(db, 'messages'), {
      matchId: 'alice_match_bob', senderUid: 'charlie',
      body: 'こんにちは', createdAt: NOW, readAt: null,
    }));
  });

  it('空のメッセージは作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(addDoc(collection(db, 'messages'), {
      matchId: 'alice_match_bob', senderUid: 'alice',
      body: '', createdAt: NOW, readAt: null,
    }));
  });

  it('500文字超のメッセージは作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(addDoc(collection(db, 'messages'), {
      matchId: 'alice_match_bob', senderUid: 'alice',
      body: 'あ'.repeat(501), createdAt: NOW, readAt: null,
    }));
  });
});

// ── reports ────────────────────────────────────────────────────────────────
describe('reports/{reportId}', () => {
  it('クライアントから作成できない（Callable Function経由のみ）', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'reports/alice_bob'), {
      reporterUid: 'alice', profileId: 'bob',
      reason: '不適切', status: 'open', createdAt: NOW,
    }));
  });

  it('通報者本人は読める', async () => {
    await adminSet('reports/alice_bob', {
      reporterUid: 'alice', profileId: 'bob',
      reason: '不適切', status: 'open', createdAt: NOW,
    });
    const db = authed('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'reports/alice_bob')));
  });

  it('第三者は読めない', async () => {
    const db = authed('charlie').firestore();
    await assertFails(getDoc(doc(db, 'reports/alice_bob')));
  });
});

// ── footprints ─────────────────────────────────────────────────────────────
describe('footprints/{footprintId}', () => {
  it('許可リストの action は保存できる', async () => {
    const db = authed('alice').firestore();
    await assertSucceeds(addDoc(collection(db, 'footprints'), {
      actorUid: 'alice', profileId: 'bob', action: 'LIKE', createdAt: NOW,
    }));
  });

  it('許可リスト外の action は保存できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(addDoc(collection(db, 'footprints'), {
      actorUid: 'alice', profileId: 'bob', action: 'HACK', createdAt: NOW,
    }));
  });

  it('自分自身への足あとは作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(addDoc(collection(db, 'footprints'), {
      actorUid: 'alice', profileId: 'alice', action: 'LIKE', createdAt: NOW,
    }));
  });
});

// ── blocks ────────────────────────────────────────────────────────────────
describe('blocks/{blockId}', () => {
  it('正しい形式でブロックを作成できる', async () => {
    const db = authed('alice').firestore();
    await assertSucceeds(setDoc(doc(db, 'blocks/alice_block_bob'), {
      byUid: 'alice', targetUid: 'bob', createdAt: NOW,
    }));
  });

  it('他人名義のブロックは作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'blocks/bob_block_charlie'), {
      byUid: 'bob', targetUid: 'charlie', createdAt: NOW,
    }));
  });

  it('自分自身のブロックは作成できない', async () => {
    const db = authed('alice').firestore();
    await assertFails(setDoc(doc(db, 'blocks/alice_block_alice'), {
      byUid: 'alice', targetUid: 'alice', createdAt: NOW,
    }));
  });
});
