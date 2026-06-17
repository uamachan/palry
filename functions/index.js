'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;

function planFromPriceId(priceId) {
  if (!priceId) return null;
  if (process.env.STRIPE_PRICE_ID_PLUS && priceId === process.env.STRIPE_PRICE_ID_PLUS) return 'PLUS';
  if (process.env.STRIPE_PRICE_ID_VIP  && priceId === process.env.STRIPE_PRICE_ID_VIP)  return 'VIP';
  return null;
}

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

// 候補一覧カード表示に必要な最低限フィールド
const CANDIDATE_CARD_FIELDS = [
  'id', 'name', 'gender', 'ageRange', 'age', 'region',
  'profilePhotoUrl', 'profilePhotoPath',
  'rank', 'role', 'tags', 'agents', 'verified',
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

function sanitizeCandidateCard(data, id) {
  const profile = { id };
  for (const key of CANDIDATE_CARD_FIELDS) {
    if (key === 'id') continue;
    if (Object.prototype.hasOwnProperty.call(data, key)) profile[key] = data[key];
  }
  return profile;
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
    profilePhotoUrl: profile?.profilePhotoUrl || '',
    profilePhotoPath: profile?.profilePhotoPath || '',
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
    voiceIntroUrl: profile?.voiceIntroUrl || '',
    voiceIntroPath: profile?.voiceIntroPath || '',
    bio: profile?.bio || '',
  };
}

function participantZeroMap(participants) {
  return Object.fromEntries(participants.map((participant) => [participant, 0]));
}

function participantReadAtMap(participants, readAt) {
  return Object.fromEntries(participants.map((participant) => [participant, readAt]));
}

async function requireAdmin(uid) {
  const callerSnap = await db.collection('users').doc(uid).get();
  if (!callerSnap.exists || callerSnap.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', '権限がありません');
  }
  return callerSnap.data() || {};
}

async function loadProfileSnapshotForBackfill(uid) {
  const [userSnap, publicSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('publicProfiles').doc(uid).get(),
  ]);
  const profile = userSnap.exists ? userSnap.data() : publicSnap.exists ? publicSnap.data() : {};
  return profileSnapshot(profile, uid);
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
      allowed.push(sanitizeCandidateCard(prelim[i], prelim[i].id));
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

  // planをサーバー側で確認し、FREEユーザーのフィルター使用を禁止する
  const userSnap = await db.collection('users').doc(uid).get();
  const plan = userSnap.exists ? (userSnap.data()?.plan || 'FREE') : 'FREE';
  const isPaidUser = plan === 'PLUS' || plan === 'VIP';

  const targetGender = isPaidUser && typeof request.data?.targetGender === 'string'
    ? request.data.targetGender
    : 'all';
  const targetRank = isPaidUser && typeof request.data?.targetRank === 'string'
    ? request.data.targetRank
    : 'all';

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

  const { matchRef } = await assertDmAllowed(matchId, uid);
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
    const matchSnap = await tx.get(matchRef);
    if (!matchSnap.exists) throw new HttpsError('not-found', 'マッチが見つかりません');
    const match = matchSnap.data() || {};
    const participants = Array.isArray(match.participants) ? match.participants : [];
    if (!participants.includes(uid)) throw new HttpsError('permission-denied', 'このDMを操作できません');

    const recipientUid = otherParticipant(participants, uid);
    if (recipientUid) {
      const [blockByMe, blockByThem] = await Promise.all([
        tx.get(db.collection('blocks').doc(`${uid}_block_${recipientUid}`)),
        tx.get(db.collection('blocks').doc(`${recipientUid}_block_${uid}`)),
      ]);
      if (blockByMe.exists || blockByThem.exists) {
        throw new HttpsError('permission-denied', 'このユーザーにDMできません');
      }
    }

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
      tx.set(rlRef, { forUid: profileId, fromUid: uid, type, status: isMatching ? 'accepted' : 'pending', createdAt: nowStr, fromProfileSnapshot: mySnapshot });
    } else if (isMatching && existingRl.data().status === 'pending') {
      tx.update(rlRef, { status: 'accepted', fromProfileSnapshot: mySnapshot });
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
      profilePhoto: theirSnapshot.profilePhotoUrl || '',
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
      profileVoiceIntro: theirSnapshot.voiceIntroUrl || '',
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

exports.recordFootprint = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');

  const uid = request.auth.uid;
  const { profileId, action } = request.data || {};

  const allowedActions = ['見送り', 'LIKE', '両LIKE', 'プロフィール閲覧'];
  if (!profileId || typeof profileId !== 'string' || profileId === uid) return {};
  if (!allowedActions.includes(action)) return {};

  const actorSnap = await db.collection('users').doc(uid).get();
  const actorData = actorSnap.exists ? actorSnap.data() : {};
  const actorProfileSnapshot = profileSnapshot(actorData, uid);

  const nowStr = new Date().toISOString();
  const day = nowStr.slice(0, 10);
  const footprintId = `${profileId}_from_${uid}_${day}`;

  await db.collection('footprints').doc(footprintId).set({
    actorUid: uid,
    profileId,
    action,
    day,
    createdAt: nowStr,
    actorProfileSnapshot,
  }, { merge: true });

  return {};
});

exports.purchase = onCall({ region: 'asia-northeast1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  if (!stripe) throw new HttpsError('internal', '決済サービスが設定されていません');

  const uid = request.auth.uid;
  const { sessionId } = request.data || {};

  if (!sessionId || typeof sessionId !== 'string') {
    throw new HttpsError('invalid-argument', 'sessionId が不正です');
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items'],
    });
  } catch (e) {
    console.warn('[palry] Stripe session retrieval failed:', e.message);
    throw new HttpsError('not-found', 'Stripe セッションが見つかりません');
  }

  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw new HttpsError('failed-precondition', '決済が完了していません');
  }

  if (session.client_reference_id && session.client_reference_id !== uid) {
    throw new HttpsError('permission-denied', '不正なセッションです');
  }

  const priceId = session.line_items?.data?.[0]?.price?.id;
  const plan = planFromPriceId(priceId) ?? session.metadata?.plan ?? null;

  if (!plan || !['PLUS', 'VIP'].includes(plan)) {
    throw new HttpsError('invalid-argument', 'プランを特定できません');
  }

  const nowStr = new Date().toISOString();
  await db.collection('users').doc(uid).update({ plan, updatedAt: nowStr });

  return { plan };
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
  await requireAdmin(request.auth.uid);
  const { profileId } = request.data || {};
  if (!profileId || typeof profileId !== 'string') {
    throw new HttpsError('invalid-argument', 'profileId が不正です');
  }
  await db.collection('users').doc(profileId).update({ autoHidden: false });
  await db.collection('publicProfiles').doc(profileId).set({ visible: true }, { merge: true });
  return {};
});

exports.adminBackfillMatches = onCall({ region: 'asia-northeast1', maxInstances: 5 }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  await requireAdmin(request.auth.uid);

  const requestedLimit = Number.isFinite(Number(request.data?.limit))
    ? Math.min(Math.max(Number(request.data.limit), 1), 50)
    : 50;
  const cursor = typeof request.data?.cursor === 'string' ? request.data.cursor.trim() : '';
  let q = db.collection('matches').orderBy(FieldPath.documentId()).limit(requestedLimit);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  const batch = db.batch();
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const nowStr = new Date().toISOString();

  for (const doc of snap.docs) {
    scanned += 1;
    const match = doc.data() || {};
    const participants = Array.isArray(match.participants)
      ? match.participants.filter((participant) => typeof participant === 'string' && participant.trim())
      : [];

    if (participants.length < 2) {
      skipped += 1;
      continue;
    }

    const matchSortAt = match.matchSortAt || match.lastMessageAt || match.updatedAt || match.createdAt || nowStr;
    const update = {};
    if (!match.matchSortAt) update.matchSortAt = matchSortAt;
    if (!match.updatedAt) update.updatedAt = matchSortAt;
    if (!match.unreadCountBy) update.unreadCountBy = participantZeroMap(participants);
    if (!match.lastReadAtBy) update.lastReadAtBy = participantReadAtMap(participants, matchSortAt);

    const profileData = { ...(match.profileData || {}) };
    let profileDataChanged = false;
    for (const participant of participants) {
      if (!profileData[participant]) {
        profileData[participant] = await loadProfileSnapshotForBackfill(participant);
        profileDataChanged = true;
      }
    }
    if (profileDataChanged) update.profileData = profileData;

    if (Object.keys(update).length === 0) {
      skipped += 1;
      continue;
    }

    batch.set(doc.ref, update, { merge: true });
    updated += 1;
  }

  if (updated > 0) await batch.commit();
  const nextCursor = snap.docs.length === requestedLimit ? snap.docs[snap.docs.length - 1].id : null;
  return { scanned, updated, skipped, nextCursor };
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
