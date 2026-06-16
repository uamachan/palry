'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const PLAN_LIMITS = {
  FREE: { dailyLikes: 10, dailySuperLikes: 1 },
  PLUS: { dailyLikes: 40, dailySuperLikes: 5 },
  VIP:  { dailyLikes: -1, dailySuperLikes: -1 },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

exports.sendLike = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');

  const uid = request.auth.uid;
  const { profileId, type = 'like', acceptingLikeId } = request.data || {};

  if (!profileId || typeof profileId !== 'string') {
    throw new HttpsError('invalid-argument', 'profileId が不正です');
  }
  if (profileId === uid) {
    throw new HttpsError('invalid-argument', '自分自身にLIKEできません');
  }
  if (!['like', 'super', 'dual'].includes(type)) {
    throw new HttpsError('invalid-argument', 'type が不正です');
  }

  const [mySnap, theirSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users').doc(profileId).get(),
  ]);

  if (!mySnap.exists) throw new HttpsError('not-found', '自分のプロフィールが見つかりません');
  if (!theirSnap.exists) throw new HttpsError('not-found', '相手のプロフィールが見つかりません');

  const myData = mySnap.data();
  const theirData = theirSnap.data();

  if (theirData.autoHidden === true) {
    throw new HttpsError('not-found', '相手が見つかりません');
  }

  // ブロックチェック（双方向）
  const [blockByMe, blockByThem] = await Promise.all([
    db.collection('blocks').doc(`${uid}_block_${profileId}`).get(),
    db.collection('blocks').doc(`${profileId}_block_${uid}`).get(),
  ]);
  if (blockByMe.exists || blockByThem.exists) {
    throw new HttpsError('permission-denied', 'このユーザーにLIKEできません');
  }

  const plan = myData.plan || 'FREE';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
  const isSuperLike = type === 'super';
  const nowStr = new Date().toISOString();

  // acceptingLikeId が指定された場合: 自分への receivedLike であることをサーバーで確認してからクォータ免除。
  let skipQuota = false;
  if (acceptingLikeId) {
    const rlSnap = await db.collection('receivedLikes').doc(acceptingLikeId).get();
    if (rlSnap.exists && rlSnap.data().forUid === uid && rlSnap.data().fromUid === profileId
        && rlSnap.data().status === 'pending') {
      skipQuota = true;
    }
  }

  const quotaId = `${uid}_${today()}`;
  const quotaRef = db.collection('likeQuota').doc(quotaId);

  const matchId = [uid, profileId].sort().join('_match_');

  const result = await db.runTransaction(async (tx) => {
    // トランザクション内は先にすべてのドキュメントを read してから write する。
    const likeRef    = db.collection('likes').doc(`${uid}_${profileId}`);
    const rlRef      = db.collection('receivedLikes').doc(`${profileId}_from_${uid}`);
    const mutualRef  = db.collection('likes').doc(`${profileId}_${uid}`);
    const matchRef   = db.collection('matches').doc(matchId);
    const theirRlRef = db.collection('receivedLikes').doc(`${uid}_from_${profileId}`);

    const [quotaSnap, existingLike, existingRl, mutualSnap, existingMatch] = await Promise.all([
      tx.get(quotaRef),
      tx.get(likeRef),
      tx.get(rlRef),
      tx.get(mutualRef),
      tx.get(matchRef),
    ]);

    const quota = quotaSnap.exists ? quotaSnap.data() : { likes: 0, superLikes: 0 };

    if (!skipQuota) {
      if (isSuperLike) {
        if (limits.dailySuperLikes !== -1 && (quota.superLikes || 0) >= limits.dailySuperLikes) {
          throw new HttpsError('resource-exhausted', '本日のSUPER LIKE上限に達しました');
        }
      } else {
        if (limits.dailyLikes !== -1 && (quota.likes || 0) >= limits.dailyLikes) {
          throw new HttpsError('resource-exhausted', '本日のLIKE上限に達しました');
        }
      }
    }

    if (existingLike.exists) throw new HttpsError('already-exists', 'すでにLIKE済みです');

    const isMatching = mutualSnap.exists;

    // likes 書き込み
    tx.set(likeRef, { fromUid: uid, toUid: profileId, type, createdAt: nowStr });

    // receivedLikes 書き込み: 相互LIKE成立なら最初から accepted にする。
    if (!existingRl.exists) {
      tx.set(rlRef, { forUid: profileId, fromUid: uid, type, status: isMatching ? 'accepted' : 'pending', createdAt: nowStr });
    } else if (isMatching && existingRl.data().status === 'pending') {
      tx.update(rlRef, { status: 'accepted' });
    }

    // クォータ更新
    if (!skipQuota) {
      const increment = FieldValue.increment(1);
      tx.set(quotaRef, {
        uid,
        date: today(),
        likes: isSuperLike ? (quota.likes || 0) : increment,
        superLikes: isSuperLike ? increment : (quota.superLikes || 0),
      }, { merge: true });
    }

    // acceptingLikeId があれば自分宛ての receivedLike を accepted に更新
    if (skipQuota && acceptingLikeId) {
      tx.update(db.collection('receivedLikes').doc(acceptingLikeId), { status: 'accepted' });
    }

    if (isMatching) {
      if (!existingMatch.exists) {
        tx.set(matchRef, {
          id: matchId,
          participants: [uid, profileId],
          createdAt: nowStr,
          // マッチ成立後のみ riotId/xHandle を双方が参照できるよう保存する。
          // publicProfiles には含めない（マッチ前の漏洩防止）。
          profileData: {
            [uid]: { riotId: myData.riotId || '', xHandle: myData.xHandle || '' },
            [profileId]: { riotId: theirData.riotId || '', xHandle: theirData.xHandle || '' },
          },
        });
      }
      // 相手が以前送った receivedLike（自分が受け取ったいいね）も accepted に更新
      tx.set(theirRlRef, { status: 'accepted' }, { merge: true });
      return { matched: true };
    }
    return { matched: false };
  });

  if (result.matched) {
    const theirProfile = theirData;
    const match = {
      id: matchId,
      profileId: theirProfile.id || profileId,
      profileName: theirProfile.name || '',
      profilePhoto: theirProfile.profilePhoto || '',
      profileRank: theirProfile.rank || '未設定',
      profileRole: theirProfile.role || '未設定',
      profileGender: theirProfile.gender || '',
      profileAgeRange: theirProfile.ageRange || theirProfile.age || '',
      profileRegion: theirProfile.region || '',
      profileTags: theirProfile.tags || [],
      profileAgents: theirProfile.agents || [],
      profileXHandle: theirProfile.xHandle || '',
      profileVc: theirProfile.vc || '',
      profileMaps: theirProfile.maps || [],
      profileFavoriteWeapon: theirProfile.favoriteWeapon || '',
      profileVoiceIntro: theirProfile.voiceIntro || '',
      profileBio: theirProfile.bio || '',
      profileRiotId: theirProfile.riotId || '',
      dmUnlocked: true,
      createdAt: nowStr,
      opener: `${theirProfile.name || '相手'}さんとマッチしました！`,
    };
    return { match, matched: true, pending_sent: false };
  }

  return { match: null, matched: false, pending_sent: true };
});

const DAILY_REPORT_LIMIT = 5;

exports.sendReport = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');

  const uid = request.auth.uid;
  const { profileId, reason = '' } = request.data || {};

  if (!profileId || typeof profileId !== 'string') {
    throw new HttpsError('invalid-argument', 'profileId が不正です');
  }
  if (profileId === uid) {
    throw new HttpsError('invalid-argument', '自分自身を通報できません');
  }
  if (typeof reason !== 'string' || reason.length > 200) {
    throw new HttpsError('invalid-argument', '通報理由が不正です');
  }

  // users ドキュメントで対象ユーザーの存在を確認する（publicProfiles は autoHidden 時に非表示になるため users で確認）。
  const targetSnap = await db.collection('users').doc(profileId).get();
  if (!targetSnap.exists) {
    throw new HttpsError('not-found', '対象ユーザーが見つかりません');
  }

  const reportRef = db.collection('reports').doc(`${uid}_${profileId}`);
  const quotaRef  = db.collection('reportQuota').doc(`${uid}_${today()}`);
  const nowStr    = new Date().toISOString();

  await db.runTransaction(async (tx) => {
    const [existingReport, quotaSnap] = await Promise.all([
      tx.get(reportRef),
      tx.get(quotaRef),
    ]);

    if (existingReport.exists) {
      throw new HttpsError('already-exists', 'すでにこのユーザーを通報済みです');
    }

    const todayCount = quotaSnap.exists ? (quotaSnap.data().count || 0) : 0;
    if (todayCount >= DAILY_REPORT_LIMIT) {
      throw new HttpsError('resource-exhausted', '本日の通報上限に達しました');
    }

    tx.set(reportRef, { reporterUid: uid, profileId, reason, status: 'open', createdAt: nowStr });
    tx.set(quotaRef, { uid, date: today(), count: FieldValue.increment(1) }, { merge: true });
  });

  return {};
});

exports.adminUnhide = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || !callerSnap.data().isAdmin) {
    throw new HttpsError('permission-denied', '権限がありません');
  }
  const { profileId } = request.data || {};
  if (!profileId || typeof profileId !== 'string') {
    throw new HttpsError('invalid-argument', 'profileId が不正です');
  }
  await db.collection('users').doc(profileId).update({ autoHidden: false });
  await db.collection('publicProfiles').doc(profileId).set({ visible: true }, { merge: true });
  return {};
});

// 通報が 3 件以上になったプロフィールを自動非表示にする。
// Admin SDK で書き込むため Firestore Rules のクライアント制限を回避できる。
exports.autoHideOnReport = onDocumentCreated(
  { document: 'reports/{reportId}', region: 'asia-northeast1' },
  async (event) => {
    const data = event.data?.data();
    if (!data?.profileId) return;
    const { profileId } = data;

    const [reportsSnap, userSnap] = await Promise.all([
      db.collection('reports').where('profileId', '==', profileId).where('status', '==', 'open').get(),
      db.collection('users').doc(profileId).get(),
    ]);

    if (reportsSnap.size < 3) return;
    // users doc が存在しない場合（削除済みアカウント等）は何もしない。
    if (!userSnap.exists) return;

    const batch = db.batch();
    batch.update(db.collection('users').doc(profileId), { autoHidden: true });
    batch.set(db.collection('publicProfiles').doc(profileId), { visible: false }, { merge: true });
    await batch.commit();
  }
);
