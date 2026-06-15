'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
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

  // 年齢安全チェック: 10代ユーザーは成人ユーザーにLIKE不可（双方向）
  const myAge = String(myData.ageRange || '');
  const theirAge = String(theirData.ageRange || '');
  const myTeen = myAge.includes('10代') || myAge.includes('18') || myAge.includes('19');
  const theirTeen = theirAge.includes('10代') || theirAge.includes('18') || theirAge.includes('19');
  if (myTeen !== theirTeen) {
    throw new HttpsError('permission-denied', '年齢層が異なるため LIKE できません');
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
    const quotaSnap = await tx.get(quotaRef);
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

    const likeRef = db.collection('likes').doc(`${uid}_${profileId}`);
    const existingLike = await tx.get(likeRef);
    if (existingLike.exists) throw new HttpsError('already-exists', 'すでにLIKE済みです');

    // likes 書き込み
    tx.set(likeRef, { fromUid: uid, toUid: profileId, type, createdAt: nowStr });

    // receivedLikes 書き込み
    const rlId = `${profileId}_from_${uid}`;
    const rlRef = db.collection('receivedLikes').doc(rlId);
    const existingRl = await tx.get(rlRef);
    if (!existingRl.exists) {
      tx.set(rlRef, { forUid: profileId, fromUid: uid, type, status: 'pending', createdAt: nowStr });
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
      const myRlRef = db.collection('receivedLikes').doc(acceptingLikeId);
      tx.update(myRlRef, { status: 'accepted' });
    }

    // 相互いいねチェック
    const mutualRef = db.collection('likes').doc(`${profileId}_${uid}`);
    const mutualSnap = await tx.get(mutualRef);
    if (mutualSnap.exists) {
      const matchRef = db.collection('matches').doc(matchId);
      const existingMatch = await tx.get(matchRef);
      if (!existingMatch.exists) {
        tx.set(matchRef, { id: matchId, participants: [uid, profileId], createdAt: nowStr });
      }
      // 相手の receivedLike (自分が送ったいいね) を accepted に更新
      const theirRlRef = db.collection('receivedLikes').doc(`${uid}_from_${profileId}`);
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
