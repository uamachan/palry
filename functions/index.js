'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const PLAN_LIMITS = {
  FREE: { dailyLikes: 10, dailyDualLikes: 5 },
  PLUS: { dailyLikes: 40, dailyDualLikes: 10 },
  VIP:  { dailyLikes: -1, dailyDualLikes: -1 },
};

const CANDIDATE_RESPONSE_LIMIT = 20;
const CANDIDATE_QUERY_LIMIT = 60;
const CANDIDATE_MAX_LIMIT = 30;
const CANDIDATE_MAX_ATTEMPTS = 2;
const CANDIDATE_SELECT_FIELDS = [
  'name', 'ageRange', 'age', 'gender', 'region',
  'profilePhotoUrl', 'profilePhotoPath',
  'rank', 'role', 'tags', 'agents', 'bio',
  'voiceIntroUrl', 'voiceIntroPath',
  'vc', 'maps', 'favoriteWeapon', 'verified',
  'visible', 'autoHidden', 'createdAt', 'updatedAt',
];
const PUBLIC_PROFILE_FIELDS = [
  'id', 'name', 'ageRange', 'age', 'gender', 'region',
  'profilePhoto', 'profilePhotoUrl', 'profilePhotoPath',
  'rank', 'role', 'tags', 'agents', 'bio',
  'voiceIntro', 'voiceIntroUrl', 'voiceIntroPath',
  'vc', 'maps', 'favoriteWeapon', 'verified', 'createdAt', 'updatedAt',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function randomCursorId() {
  return db.collection('_candidateCursors').doc().id;
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function rankTier(rank) {
  return String(rank || '').split(' ')[0];
}

function candidateMatchesFilters(profile, targetGender, targetRank, excludedUids) {
  if (!profile?.id || excludedUids.has(profile.id)) return false;
  if (profile.visible === false) return false;
  if (profile.autoHidden === true) return false;

  if (targetGender !== 'all') {
    const gender = profile.gender || '';
    if (targetGender === 'その他/未設定') {
      if (gender !== '' && gender !== 'その他/未設定') return false;
    } else if (gender !== targetGender) {
      return false;
    }
  }

  if (targetRank !== 'all' && rankTier(profile.rank) !== targetRank) return false;
  return true;
}

function sanitizePublicProfile(data, id) {
  const profile = { id };
  for (const key of PUBLIC_PROFILE_FIELDS) {
    if (key === 'id') continue;
    if (key === 'profilePhoto') {
      profile.profilePhoto = data.profilePhotoUrl || '';
      continue;
    }
    if (key === 'voiceIntro') {
      profile.voiceIntro = data.voiceIntroUrl || '';
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(data, key)) profile[key] = data[key];
  }
  return profile;
}

function publicPhoto(profile) {
  return profile?.profilePhotoUrl || profile?.profilePhoto || '';
}

function publicVoice(profile) {
  return profile?.voiceIntroUrl || profile?.voiceIntro || '';
}

function profileSnapshot(profile, id) {
  return {
    id,
    name: profile?.name || '',
    profilePhoto: publicPhoto(profile),
    rank: profile?.rank || '未設定',
    role: profile?.role || '未設定',
    gender: profile?.gender || '',
    ageRange: profile?.ageRange || profile?.age || '',
    region: profile?.region || '',
    tags: Array.isArray(profile?.tags) ? profile.tags : [],
    agents: Array.isArray(profile?.agents) ? profile.agents : [],
    xHandle: profile?.xHandle || '',
    riotId: profile?.riotId || '',
    vc: profile?.vc || '',
    maps: Array.isArray(profile?.maps) ? profile.maps : [],
    favoriteWeapon: profile?.favoriteWeapon || '',
    voiceIntro: publicVoice(profile),
    bio: profile?.bio || '',
  };
}

function candidatePageQuery(cursorId = '') {
  let q = db.collection('publicProfiles').orderBy(FieldPath.documentId());
  if (cursorId) q = q.startAt(cursorId);
  return q.limit(CANDIDATE_QUERY_LIMIT).select(...CANDIDATE_SELECT_FIELDS);
}

async function removeExcludedCandidates(profiles, uid, targetGender, targetRank) {
  const selfOnly = new Set([uid]);
  const prelim = profiles.filter((profile) => candidateMatchesFilters(profile, targetGender, targetRank, selfOnly));
  if (prelim.length === 0) return [];

  const refs = [];
  for (const profile of prelim) {
    refs.push(db.collection('likes').doc(`${uid}_${profile.id}`));
    refs.push(db.collection('blocks').doc(`${uid}_block_${profile.id}`));
    refs.push(db.collection('blocks').doc(`${profile.id}_block_${uid}`));
  }

  const snaps = await db.getAll(...refs);
  const allowed = [];
  for (let i = 0; i < prelim.length; i++) {
    const base = i * 3;
    const alreadyLiked = snaps[base]?.exists;
    const blockedByMe = snaps[base + 1]?.exists;
    const blockedByThem = snaps[base + 2]?.exists;
    if (!alreadyLiked && !blockedByMe && !blockedByThem) {
      allowed.push(sanitizePublicProfile(prelim[i], prelim[i].id));
    }
  }
  return allowed;
}

function otherParticipant(participants, uid) {
  return Array.isArray(participants) ? participants.find((p) => p !== uid) : null;
}

async function assertDmAllowed(matchId, uid) {
  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError('not-found', 'マッチが見つかりません');
  const match = matchSnap.data() || {};
  const participants = Array.isArray(match.participants) ? match.participants : [];
  if (!participants.includes(uid)) throw new HttpsError('permission-denied', 'このDMを操作できません');
  const otherUid = otherParticipant(participants, uid);
  if (otherUid) {
    const [blockByMe, blockByThem] = await Promise.all([
      db.collection('blocks').doc(`${uid}_block_${otherUid}`).get(),
      db.collection('blocks').doc(`${otherUid}_block_${uid}`).get(),
    ]);
    if (blockByMe.exists || blockByThem.exists) {
      throw new HttpsError('permission-denied', 'このユーザーにDMできません');
    }
  }
  return { matchRef, match, participants, otherUid };
}

exports.getCandidateProfiles = onCall({ region: 'asia-northeast1', maxInstances: 20 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');

  const uid = request.auth.uid;

  // Server-side plan gate: FREE users cannot use gender/rank filters
  const userSnap = await db.collection('users').doc(uid).get();
  const plan = userSnap.exists ? (userSnap.data()?.plan || 'FREE') : 'FREE';
  const isPaid = plan === 'PLUS' || plan === 'VIP';

  const targetGender = isPaid && typeof request.data?.targetGender === 'string' ? request.data.targetGender : 'all';
  const targetRank   = isPaid && typeof request.data?.targetRank   === 'string' ? request.data.targetRank   : 'all';
  const requestedLimit = Number.isFinite(Number(request.data?.limit))
    ? Math.min(Math.max(Number(request.data.limit), 1), CANDIDATE_MAX_LIMIT)
    : CANDIDATE_RESPONSE_LIMIT;

  const seen = new Set();
  const candidates = [];

  async function collectFromQuery(query) {
    const snap = await query.get();
    const page = [];
    snap.forEach((doc) => {
      if (seen.has(doc.id)) return;
      seen.add(doc.id);
      page.push({ id: doc.id, ...(doc.data() || {}) });
    });
    const allowed = await removeExcludedCandidates(page, uid, targetGender, targetRank);
    candidates.push(...allowed);
  }

  for (let attempt = 0; attempt < CANDIDATE_MAX_ATTEMPTS && candidates.length < requestedLimit; attempt++) {
    await collectFromQuery(candidatePageQuery(randomCursorId()));
  }

  if (candidates.length < requestedLimit) {
    await collectFromQuery(candidatePageQuery());
  }

  return { profiles: shuffleInPlace(candidates).slice(0, requestedLimit) };
});

exports.markDmRead = onCall({ region: 'asia-northeast1', maxInstances: 20 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const uid = request.auth.uid;
  const matchId = String(request.data?.matchId || '').trim();
  if (!matchId) throw new HttpsError('invalid-argument', 'matchId が不正です');

  const { matchRef } = await assertDmAllowed(matchId, uid);
  const readAt = new Date().toISOString();
  const msgsSnap = await db.collection('messages')
    .where('matchId', '==', matchId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();

  const batch = db.batch();
  let writes = 0;
  msgsSnap.forEach((doc) => {
    const msg = doc.data() || {};
    if (msg.senderUid !== uid && !msg.readAt) {
      batch.update(doc.ref, { readAt });
      writes += 1;
    }
  });
  batch.set(matchRef, {
    [`lastReadAtBy.${uid}`]: readAt,
    [`unreadCountBy.${uid}`]: 0,
  }, { merge: true });
  await batch.commit();
  return { updatedMessages: writes };
});

exports.sendDm = onCall({ region: 'asia-northeast1', maxInstances: 40 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const uid = request.auth.uid;
  const matchId = String(request.data?.matchId || '').trim();
  const body = String(request.data?.body || '').trim();

  if (!matchId || !body) throw new HttpsError('invalid-argument', '送信内容が不正です');
  if (body.length > 500) throw new HttpsError('invalid-argument', 'DMは500文字以内です');

  const { matchRef, otherUid } = await assertDmAllowed(matchId, uid);
  const createdAt = new Date().toISOString();
  const messageRef = db.collection('messages').doc();
  const message = {
    matchId,
    senderUid: uid,
    body,
    createdAt,
    readAt: null,
    summaryApplied: true,
  };

  await db.runTransaction(async (tx) => {
    // Re-check blocks inside the transaction to close the race with concurrent block creation
    const txReads = [tx.get(matchRef)];
    if (otherUid) {
      txReads.push(tx.get(db.collection('blocks').doc(`${uid}_block_${otherUid}`)));
      txReads.push(tx.get(db.collection('blocks').doc(`${otherUid}_block_${uid}`)));
    }
    const [matchSnap, blockByMe, blockByThem] = await Promise.all(txReads);

    if (!matchSnap.exists) throw new HttpsError('not-found', 'マッチが見つかりません');
    const match = matchSnap.data() || {};
    const participants = Array.isArray(match.participants) ? match.participants : [];
    if (!participants.includes(uid)) throw new HttpsError('permission-denied', 'このDMを操作できません');
    if (blockByMe?.exists || blockByThem?.exists) {
      throw new HttpsError('permission-denied', 'このユーザーにDMできません');
    }

    const recipientUid = otherParticipant(participants, uid);
    const update = {
      lastMessage: {
        id: messageRef.id,
        body,
        senderUid: uid,
        createdAt,
      },
      lastMessageAt: createdAt,
      updatedAt: createdAt,
      matchSortAt: createdAt,
      [`lastReadAtBy.${uid}`]: createdAt,
    };

    if (recipientUid) {
      const recipientReadAt = match.lastReadAtBy?.[recipientUid] || '';
      if (!recipientReadAt || recipientReadAt < createdAt) {
        update[`unreadCountBy.${recipientUid}`] = FieldValue.increment(1);
      }
    }

    tx.set(messageRef, message);
    tx.set(matchRef, update, { merge: true });
  });

  return { message: { id: messageRef.id, sender: 'user', body, createdAt, readAt: null } };
});

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
  if (!['like', 'dual'].includes(type)) {
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

  const [blockByMe, blockByThem] = await Promise.all([
    db.collection('blocks').doc(`${uid}_block_${profileId}`).get(),
    db.collection('blocks').doc(`${profileId}_block_${uid}`).get(),
  ]);
  if (blockByMe.exists || blockByThem.exists) {
    throw new HttpsError('permission-denied', 'このユーザーにLIKEできません');
  }

  const plan = myData.plan || 'FREE';
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
  const nowStr = new Date().toISOString();

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
  const mySnapshot = profileSnapshot(myData, uid);
  const theirSnapshot = profileSnapshot(theirData, profileId);

  const result = await db.runTransaction(async (tx) => {
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

    const quota = quotaSnap.exists ? quotaSnap.data() : { likes: 0, dualLikes: 0 };

    if (!skipQuota) {
      if (limits.dailyLikes !== -1 && (quota.likes || 0) >= limits.dailyLikes) {
        throw new HttpsError('resource-exhausted', '本日のLIKE上限に達しました');
      }
      if (type === 'dual' && limits.dailyDualLikes !== -1 && (quota.dualLikes || 0) >= limits.dailyDualLikes) {
        throw new HttpsError('resource-exhausted', '本日の両LIKE上限に達しました');
      }
    }

    if (existingLike.exists) throw new HttpsError('already-exists', 'すでにLIKE済みです');

    const isMatching = mutualSnap.exists;
    tx.set(likeRef, { fromUid: uid, toUid: profileId, type, createdAt: nowStr });

    if (!existingRl.exists) {
      const fromSnap = {
        name: myData.name || '',
        profilePhoto: publicPhoto(myData),
        rank: myData.rank || '未設定',
        role: myData.role || '未設定',
      };
      tx.set(rlRef, { forUid: profileId, fromUid: uid, type, status: isMatching ? 'accepted' : 'pending', fromProfileSnapshot: fromSnap, createdAt: nowStr });
    } else if (isMatching && existingRl.data().status === 'pending') {
      tx.update(rlRef, { status: 'accepted' });
    }

    if (!skipQuota) {
      const quotaUpdate = {
        uid,
        date: today(),
        likes: FieldValue.increment(1),
      };
      if (type === 'dual') quotaUpdate.dualLikes = FieldValue.increment(1);
      tx.set(quotaRef, quotaUpdate, { merge: true });
    }

    if (skipQuota && acceptingLikeId) {
      tx.update(db.collection('receivedLikes').doc(acceptingLikeId), { status: 'accepted' });
    }

    if (isMatching) {
      const existingMatchData = existingMatch.exists ? existingMatch.data() : {};
      const matchSortAt = existingMatchData.matchSortAt || existingMatchData.updatedAt || existingMatchData.createdAt || nowStr;
      tx.set(matchRef, {
        id: matchId,
        participants: [uid, profileId],
        createdAt: existingMatchData.createdAt || nowStr,
        updatedAt: existingMatchData.updatedAt || nowStr,
        matchSortAt,
        unreadCountBy: existingMatchData.unreadCountBy || { [uid]: 0, [profileId]: 0 },
        lastReadAtBy: existingMatchData.lastReadAtBy || { [uid]: nowStr, [profileId]: nowStr },
        profileData: {
          [uid]: mySnapshot,
          [profileId]: theirSnapshot,
        },
      }, { merge: true });
      tx.set(theirRlRef, { status: 'accepted' }, { merge: true });
      return { matched: true };
    }
    return { matched: false };
  });

  if (result.matched) {
    const match = {
      id: matchId,
      profileId: theirSnapshot.id,
      profileName: theirSnapshot.name || '',
      profilePhoto: theirSnapshot.profilePhoto || '',
      profileRank: theirSnapshot.rank || '未設定',
      profileRole: theirSnapshot.role || '未設定',
      profileGender: theirSnapshot.gender || '',
      profileAgeRange: theirSnapshot.ageRange || '',
      profileRegion: theirSnapshot.region || '',
      profileTags: theirSnapshot.tags || [],
      profileAgents: theirSnapshot.agents || [],
      profileXHandle: theirSnapshot.xHandle || '',
      profileVc: theirSnapshot.vc || '',
      profileMaps: theirSnapshot.maps || [],
      profileFavoriteWeapon: theirSnapshot.favoriteWeapon || '',
      profileVoiceIntro: theirSnapshot.voiceIntro || '',
      profileBio: theirSnapshot.bio || '',
      profileRiotId: theirSnapshot.riotId || '',
      dmUnlocked: true,
      createdAt: nowStr,
      opener: `${theirSnapshot.name || '相手'}さんとマッチしました！`,
    };
    return { match, matched: true, pending_sent: false };
  }

  return { match: null, matched: false, pending_sent: true };
});

const DAILY_REPORT_LIMIT = 5;

exports.sendReport = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');

  const uid = request.auth.uid;
  const { profileId } = request.data || {};
  const reason = String(request.data?.reason || '').trim();

  if (!profileId || typeof profileId !== 'string') {
    throw new HttpsError('invalid-argument', 'profileId が不正です');
  }
  if (profileId === uid) {
    throw new HttpsError('invalid-argument', '自分自身を通報できません');
  }
  if (reason.length > 200) {
    throw new HttpsError('invalid-argument', '通報理由が不正です');
  }

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

exports.updateMatchSummaryOnMessage = onDocumentCreated(
  { document: 'messages/{messageId}', region: 'asia-northeast1' },
  async (event) => {
    const data = event.data?.data();
    if (data?.summaryApplied === true) return;
    if (!data?.matchId || !data?.senderUid || typeof data.body !== 'string') return;
    const createdAt = typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString();
    const matchRef = db.collection('matches').doc(data.matchId);

    await db.runTransaction(async (tx) => {
      const matchSnap = await tx.get(matchRef);
      if (!matchSnap.exists) return;
      const match = matchSnap.data() || {};
      const participants = Array.isArray(match.participants) ? match.participants : [];
      if (!participants.includes(data.senderUid)) return;
      const recipientUid = otherParticipant(participants, data.senderUid);
      const update = {
        lastMessage: {
          id: event.params.messageId,
          body: data.body.slice(0, 500),
          senderUid: data.senderUid,
          createdAt,
        },
        lastMessageAt: createdAt,
        updatedAt: createdAt,
        matchSortAt: createdAt,
      };
      if (recipientUid) {
        const recipientReadAt = match.lastReadAtBy?.[recipientUid] || '';
        if (!recipientReadAt || recipientReadAt < createdAt) {
          update[`unreadCountBy.${recipientUid}`] = FieldValue.increment(1);
        }
      }
      tx.set(matchRef, update, { merge: true });
    });
  }
);

// 管理者専用: matchSortAt / profileData が欠落した古い matches を補完する。
// limit 付き・再実行可能。大量書き込みを防ぐためデフォルト50件上限。
exports.adminBackfillMatches = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const callerSnap = await db.collection('users').doc(request.auth.uid).get();
  if (!callerSnap.exists || !callerSnap.data().isAdmin) {
    throw new HttpsError('permission-denied', '権限がありません');
  }
  const batchSize = Math.min(Math.max(Number(request.data?.limit) || 50, 1), 200);

  // 候補を多めに取得してフィルタリング
  const snap = await db.collection('matches').limit(batchSize * 10).get();

  const toUpdate = [];
  for (const d of snap.docs) {
    if (toUpdate.length >= batchSize) break;
    const data = d.data();
    const participants = Array.isArray(data.participants) ? data.participants : [];
    const needsSortAt = !data.matchSortAt;
    const needsProfileData = participants.some((p) => !data.profileData?.[p]?.name);
    if (needsSortAt || needsProfileData) {
      toUpdate.push({ ref: d.ref, data, participants, needsSortAt, needsProfileData });
    }
  }

  if (toUpdate.length === 0) return { updated: 0 };

  // 不足プロフィールを一括取得
  const uidsNeeded = new Set();
  for (const { participants, data, needsProfileData } of toUpdate) {
    if (needsProfileData) {
      for (const uid of participants) {
        if (!data.profileData?.[uid]?.name) uidsNeeded.add(uid);
      }
    }
  }

  const profileMap = {};
  if (uidsNeeded.size > 0) {
    const uidsArray = Array.from(uidsNeeded);
    const refs = uidsArray.flatMap((uid) => [
      db.collection('publicProfiles').doc(uid),
      db.collection('users').doc(uid),
    ]);
    const snaps = await db.getAll(...refs);
    for (let i = 0; i < uidsArray.length; i++) {
      const uid = uidsArray[i];
      const pubSnap = snaps[i * 2];
      const userSnap = snaps[i * 2 + 1];
      const rawData = (pubSnap.exists ? pubSnap.data() : null) || (userSnap.exists ? userSnap.data() : null);
      if (rawData) profileMap[uid] = rawData;
    }
  }

  const batch = db.batch();
  let updated = 0;
  const nowStr = new Date().toISOString();
  for (const { ref, data, participants, needsSortAt, needsProfileData } of toUpdate) {
    const update = {};
    if (needsSortAt) {
      update.matchSortAt = data.lastMessageAt || data.updatedAt || data.createdAt || nowStr;
    }
    if (needsProfileData) {
      const profileData = { ...(data.profileData || {}) };
      for (const uid of participants) {
        if (!profileData[uid]?.name && profileMap[uid]) {
          profileData[uid] = profileSnapshot(profileMap[uid], uid);
        }
      }
      update.profileData = profileData;
    }
    if (Object.keys(update).length > 0) {
      batch.update(ref, update);
      updated++;
    }
  }
  if (updated > 0) await batch.commit();
  return { updated };
});

exports.recordFootprint = onCall({ region: 'asia-northeast1', maxInstances: 40 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const uid = request.auth.uid;
  const profileId = String(request.data?.profileId || '').trim();
  const action = String(request.data?.action || '').trim();

  if (!profileId || profileId === uid) return {};
  const ALLOWED_ACTIONS = ['見送り', 'LIKE', '両LIKE', 'プロフィール閲覧'];
  if (!ALLOWED_ACTIONS.includes(action)) return {};

  // actorSnapshot はサーバー側で publicProfiles から取得（クライアント入力を使わない）
  const actorSnap = await db.collection('publicProfiles').doc(uid).get();
  const actorData = actorSnap.exists ? (actorSnap.data() || {}) : {};

  const day = new Date().toISOString().slice(0, 10);
  const footprintId = `${profileId}_from_${uid}_${day}`;
  const nowStr = new Date().toISOString();

  await db.collection('footprints').doc(footprintId).set({
    actorUid: uid,
    profileId,
    action,
    day,
    createdAt: nowStr,
    actorSnapshot: {
      name: actorData.name || '',
      profilePhoto: publicPhoto(actorData),
      rank: actorData.rank || '未設定',
      gender: actorData.gender || '',
    },
  });
  return {};
});

exports.autoHideOnReport = onDocumentCreated(
  { document: 'reports/{reportId}', region: 'asia-northeast1' },
  async (event) => {
    const data = event.data?.data();
    if (!data?.profileId) return;
    const { profileId } = data;

    const [reportsSnap, userSnap] = await Promise.all([
      db.collection('reports')
        .where('profileId', '==', profileId)
        .where('status', '==', 'open')
        .limit(3)
        .get(),
      db.collection('users').doc(profileId).get(),
    ]);

    if (reportsSnap.size < 3) return;
    if (!userSnap.exists) return;

    const batch = db.batch();
    batch.update(db.collection('users').doc(profileId), { autoHidden: true });
    batch.set(db.collection('publicProfiles').doc(profileId), { visible: false }, { merge: true });
    await batch.commit();
  }
);
