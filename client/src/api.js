let _modsPromise = null;
async function getMods() {
  if (!_modsPromise) {
    _modsPromise = Promise.all([
      import('firebase/firestore'),
      import('./firebase.js'),
    ]).then(([fs, fb]) => ({
      collection: fs.collection,
      doc: fs.doc,
      getDoc: fs.getDoc,
      getDocs: fs.getDocs,
      setDoc: fs.setDoc,
      updateDoc: fs.updateDoc,
      addDoc: fs.addDoc,
      writeBatch: fs.writeBatch,
      deleteField: fs.deleteField,
      query: fs.query,
      where: fs.where,
      orderBy: fs.orderBy,
      limit: fs.limit,
      onSnapshot: fs.onSnapshot,
      db: fb.firebaseDb,
      auth: fb.firebaseAuth,
    }));
  }
  return _modsPromise;
}

async function getUid() {
  try {
    const { auth } = await getMods();
    return auth?.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function now() { return new Date().toISOString(); }
function dayKey() { return now().slice(0, 10); }

function apiError(message, httpStatus) {
  const e = new Error(message || 'リクエストに失敗しました');
  e.httpStatus = httpStatus;
  return e;
}

const PUBLIC_PROFILE_KEYS = [
  'id', 'name', 'ageRange', 'age', 'gender', 'region', 'profilePhoto',
  'profilePhotoUrl', 'profilePhotoPath', 'rank', 'role', 'tags', 'agents',
  'bio', 'voiceIntro', 'voiceIntroUrl', 'voiceIntroPath', 'vc', 'maps',
  'favoriteWeapon', 'verified', 'createdAt', 'updatedAt',
];

const INLINE_PROFILE_PHOTO_MAX_CHARS = 300000;
const INLINE_VOICE_INTRO_MAX_CHARS = 300000;
const PROFILE_RESULT_LIMIT = 20;
const PROFILE_FALLBACK_READ_LIMIT = 50;
const MATCH_THREAD_LIMIT = 100;
const DM_MESSAGE_LIMIT = 50;
const RECEIVED_LIKES_LIMIT = 50;
const FOOTPRINT_LIMIT = 50;
const ADMIN_REPORT_LIMIT = 100;

function validateInlineMediaPayload(data) {
  // TODO(storage-migration): upload profile media to Firebase Storage and keep only URL/path in Firestore.
  if (typeof data?.profilePhoto === 'string' && data.profilePhoto.length > INLINE_PROFILE_PHOTO_MAX_CHARS) {
    throw apiError('プロフィール画像が大きすぎます。画像を圧縮してください。', 413);
  }
  if (typeof data?.voiceIntro === 'string' && data.voiceIntro.length > INLINE_VOICE_INTRO_MAX_CHARS) {
    throw apiError('ボイス紹介が大きすぎます。短く録音してください。', 413);
  }
}

function pickProfilePhoto(profile) {
  return profile?.profilePhotoUrl || profile?.profilePhoto || '';
}

function pickVoiceIntro(profile) {
  return profile?.voiceIntroUrl || profile?.voiceIntro || '';
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function candidateAllowed(profile, excludedUids, targetGender, targetRank) {
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
  if (targetRank !== 'all') {
    const tier = (profile.rank || '').split(' ')[0];
    if (tier !== targetRank) return false;
  }
  return true;
}

async function fetchUserProfile(uid) {
  if (!uid) return null;
  try {
    const { doc, getDoc, db } = await getMods();
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id };
  } catch (e) {
    console.warn('[pairly] Firestore read failed:', e.message);
    return null;
  }
}

async function fetchPublicProfile(uid) {
  if (!uid) return null;
  try {
    const { doc, getDoc, db } = await getMods();
    const snap = await getDoc(doc(db, 'publicProfiles', uid));
    if (!snap.exists()) return null;
    return { ...snap.data(), id: snap.id };
  } catch (e) {
    console.warn('[palry] publicProfiles read failed:', e.message);
    return null;
  }
}

let _funcsPromise = null;
async function getFunctionsMods() {
  if (!_funcsPromise) {
    _funcsPromise = Promise.all([
      import('firebase/functions'),
      import('./firebase.js'),
    ]).then(([fnModule, fb]) => ({
      httpsCallable: fnModule.httpsCallable,
      functions: fnModule.getFunctions(fb.firebaseApp, 'asia-northeast1'),
    }));
  }
  return _funcsPromise;
}

async function writeUserProfile(uid, data) {
  validateInlineMediaPayload(data);
  const { doc, writeBatch, db } = await getMods();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), data, { merge: true });
    const publicData = {};
    for (const key of PUBLIC_PROFILE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(data, key)) publicData[key] = data[key];
    }
    if (Object.keys(publicData).length > 0) {
      batch.set(doc(db, 'publicProfiles', uid), publicData, { merge: true });
    }
    await batch.commit();
  } catch (e) {
    console.error('[palry] Firestore write failed:', e.message);
    if (e.message?.includes('Database') || e.message?.includes('not-found') || e.code === 'not-found') {
      throw new Error('Firestoreデータベースが見つかりません。Firebase ConsoleでFirestoreを有効化してください。');
    }
    if (e.code === 'permission-denied') {
      throw new Error('Firestoreの書き込みが拒否されました。セキュリティルールを確認してください。');
    }
    throw e;
  }
  return fetchUserProfile(uid);
}

async function fallbackProfiles(uid, targetGender, targetRank) {
  const { collection, query, where, getDocs, limit, db } = await getMods();
  const [blocksSnap, blockedBySnap, likesSnap] = await Promise.all([
    getDocs(query(collection(db, 'blocks'), where('byUid', '==', uid), limit(PROFILE_FALLBACK_READ_LIMIT))),
    getDocs(query(collection(db, 'blocks'), where('targetUid', '==', uid), limit(PROFILE_FALLBACK_READ_LIMIT))),
    getDocs(query(collection(db, 'likes'), where('fromUid', '==', uid), limit(PROFILE_FALLBACK_READ_LIMIT))),
  ]);

  const excludedUids = new Set([
    uid,
    ...blocksSnap.docs.map((d) => d.data().targetUid).filter(Boolean),
    ...blockedBySnap.docs.map((d) => d.data().byUid).filter(Boolean),
    ...likesSnap.docs.map((d) => d.data().toUid).filter(Boolean),
  ]);

  const snap = await getDocs(query(collection(db, 'publicProfiles'), limit(PROFILE_FALLBACK_READ_LIMIT)));
  const candidates = snap.docs
    .map((d) => ({ ...d.data(), id: d.id }))
    .filter((p) => candidateAllowed(p, excludedUids, targetGender, targetRank));

  return { profiles: shuffleInPlace(candidates).slice(0, PROFILE_RESULT_LIMIT) };
}

const PLANS_DATA = {
  plans: {
    FREE: { name: 'FREE', price: 0, dailyLikes: 10, dualLikes: 5, genderFilter: false, rankFilter: false, footprints: false, spotlight: false, features: ['LIKE 10回/day', '両LIKE 5回', 'マッチ後DM'] },
    PLUS: { name: 'PLUS', price: 980, dailyLikes: 40, dualLikes: 10, genderFilter: true, rankFilter: true, footprints: true, spotlight: false, features: ['LIKE 40回/day', '両LIKE 10回', '性別指定フィルター', '足あと詳細'] },
    VIP: { name: 'VIP', price: 1980, dailyLikes: -1, dualLikes: -1, genderFilter: true, rankFilter: true, footprints: true, spotlight: true, features: ['LIKE無制限', '両LIKE無制限', '性別指定フィルター', '全制限解除'] },
  },
  singleItems: [
    { name: '性別指定フィルター7日', price: 400, detail: 'FREEでも7日間だけ表示性別を指定できます。' },
    { name: 'ブースト24時間', price: 300, detail: 'プロフィールを表示候補に出やすくします。' },
    { name: 'プロフィール目立たせ7日', price: 700, detail: '検索・候補カードで視認性を上げます。' },
  ],
};

function buildEntitlements(plan) {
  const paid = plan === 'PLUS' || plan === 'VIP';
  return {
    genderFilter: paid,
    rankFilter: paid,
    boost: false,
    spotlight: plan === 'VIP',
  };
}

function buildMatchObject(matchId, otherProfile, createdAt = '') {
  if (!otherProfile) return null;
  return {
    id: matchId,
    profileId: otherProfile.id,
    profileName: otherProfile.name || '',
    profilePhoto: pickProfilePhoto(otherProfile),
    profileRank: otherProfile.rank || '未設定',
    profileRole: otherProfile.role || '未設定',
    profileGender: otherProfile.gender || '',
    profileAgeRange: otherProfile.ageRange || otherProfile.age || '',
    profileRegion: otherProfile.region || '',
    profileTags: otherProfile.tags || [],
    profileAgents: otherProfile.agents || [],
    profileXHandle: otherProfile.xHandle || '',
    profileVc: otherProfile.vc || '',
    profileMaps: otherProfile.maps || [],
    profileFavoriteWeapon: otherProfile.favoriteWeapon || '',
    profileVoiceIntro: pickVoiceIntro(otherProfile),
    profileBio: otherProfile.bio || '',
    profileRiotId: otherProfile.riotId || '',
    dmUnlocked: true,
    createdAt: createdAt || now(),
    opener: `${otherProfile.name || '相手'}さんとマッチしました！`,
  };
}

function messageFromDoc(docSnap, uid) {
  const msg = docSnap.data();
  return {
    id: docSnap.id,
    sender: msg.senderUid === uid ? 'user' : 'other',
    body: msg.body,
    createdAt: msg.createdAt,
    readAt: msg.readAt || null,
  };
}

function messageFromMatchSummary(match, uid, otherUid) {
  const last = match?.lastMessage;
  if (!last?.body) return [];
  return [{
    id: last.id || `${match.id}_last`,
    sender: last.senderUid === uid ? 'user' : 'other',
    body: last.body,
    createdAt: last.createdAt || match.lastMessageAt || match.updatedAt || match.createdAt,
    readAt: last.senderUid === uid ? (match.lastReadAtBy?.[otherUid] || null) : null,
    summary: true,
  }];
}

function matchSortTime(match) {
  return match?.lastMessageAt || match?.updatedAt || match?.createdAt || '';
}

async function currentUserOrThrow() {
  const uid = await getUid();
  if (!uid) throw apiError('未認証です', 401);
  return uid;
}

export const api = {
  plans: async () => PLANS_DATA,

  login: async () => {
    const uid = await currentUserOrThrow();
    const user = await fetchUserProfile(uid);
    if (!user) throw apiError('プロフィールが見つかりません', 404);
    return { user };
  },

  register: async (body) => {
    const uid = await currentUserOrThrow();
    const { password, emailConfirm, idToken, agreed, age, email, ...rest } = body || {};
    const { deleteField } = await getMods();
    const userData = {
      ...rest,
      id: uid,
      ageRange: age || rest.ageRange || '',
      email: deleteField(),
      plan: 'FREE',
      verified: true,
      agreedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    const user = await writeUserProfile(uid, userData);
    return { user, message: 'アカウントを作成しました' };
  },

  updateProfile: async (body) => {
    const uid = await currentUserOrThrow();
    const { password, emailConfirm, idToken, age, agreed, email, ...rest } = body || {};
    const { deleteField } = await getMods();
    const user = await writeUserProfile(uid, {
      ...rest,
      ageRange: age || rest.ageRange || '',
      email: deleteField(),
      updatedAt: now(),
    });
    return { user };
  },

  profiles: async ({ targetGender = 'all', targetRank = 'all' } = {}) => {
    const uid = await getUid();
    if (!uid) return { profiles: [] };
    try {
      const { httpsCallable, functions } = await getFunctionsMods();
      const result = await httpsCallable(functions, 'getCandidateProfiles')({
        targetGender,
        targetRank,
        limit: PROFILE_RESULT_LIMIT,
      });
      return { profiles: Array.isArray(result.data?.profiles) ? result.data.profiles : [] };
    } catch (e) {
      console.warn('[palry] getCandidateProfiles failed; using limited fallback:', e.code || e.message);
      return fallbackProfiles(uid, targetGender, targetRank);
    }
  },

  like: async ({ profileId, type = 'like' }) => {
    const uid = await currentUserOrThrow();
    if (!profileId) throw apiError('対象プロフィールが必要です', 400);
    const { httpsCallable, functions } = await getFunctionsMods();
    const sendLike = httpsCallable(functions, 'sendLike');
    try {
      const result = await sendLike({ profileId, type });
      const user = await fetchUserProfile(uid);
      return { ...result.data, entitlements: buildEntitlements(user?.plan || 'FREE') };
    } catch (e) {
      if (e.code === 'functions/resource-exhausted') throw apiError(e.message || '本日のLIKE上限に達しました', 429);
      if (e.code === 'functions/not-found') throw apiError('相手が見つかりません', 404);
      if (e.code === 'functions/permission-denied') throw apiError('このユーザーにLIKEできません', 403);
      if (e.code === 'functions/already-exists') throw apiError('すでにLIKE済みです', 409);
      throw e;
    }
  },

  matches: async () => {
    const uid = await getUid();
    if (!uid) return { matches: [] };
    const { collection, query, where, getDocs, limit, db } = await getMods();
    const snap = await getDocs(query(
      collection(db, 'matches'),
      where('participants', 'array-contains', uid),
      limit(MATCH_THREAD_LIMIT)
    ));
    const matches = (await Promise.all(snap.docs.map(async (d) => {
      const m = { ...d.data(), id: d.id };
      const otherUid = m.participants?.find((p) => p !== uid);
      const otherProfile = await fetchPublicProfile(otherUid);
      const extra = m.profileData?.[otherUid] || {};
      return buildMatchObject(m.id, { ...otherProfile, ...extra }, m.createdAt);
    }))).filter(Boolean);
    matches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { matches };
  },

  dmThreads: async () => {
    const uid = await getUid();
    if (!uid) return { threads: [] };
    const { collection, query, where, getDocs, limit, db } = await getMods();
    const matchesSnap = await getDocs(query(
      collection(db, 'matches'),
      where('participants', 'array-contains', uid),
      limit(MATCH_THREAD_LIMIT)
    ));
    const threads = await Promise.all(matchesSnap.docs.map(async (matchDoc) => {
      const match = { ...matchDoc.data(), id: matchDoc.id };
      const otherUid = match.participants?.find((p) => p !== uid);
      const otherProfile = await fetchPublicProfile(otherUid);
      const extra = match.profileData?.[otherUid] || {};
      return {
        match: buildMatchObject(match.id, { ...otherProfile, ...extra }, match.createdAt),
        messages: messageFromMatchSummary(match, uid, otherUid),
        unreadCount: Number(match.unreadCountBy?.[uid] || 0),
        updatedAt: matchSortTime(match),
      };
    }));
    threads.sort((a, b) => (b.updatedAt || b.match?.createdAt || '').localeCompare(a.updatedAt || a.match?.createdAt || ''));
    return { threads: threads.filter((t) => t.match) };
  },

  markDmRead: async ({ matchId }) => {
    if (!matchId) return {};
    const { httpsCallable, functions } = await getFunctionsMods();
    await httpsCallable(functions, 'markDmRead')({ matchId });
    return {};
  },

  sendDm: async ({ matchId, body }) => {
    const uid = await currentUserOrThrow();
    const text = String(body || '').trim();
    if (!matchId || !text) throw apiError('送信内容が不正です', 400);
    if (text.length > 500) throw apiError('DMは500文字以内です', 400);
    const { collection, addDoc, db } = await getMods();
    const createdAt = now();
    const ref = await addDoc(collection(db, 'messages'), {
      matchId,
      senderUid: uid,
      body: text,
      createdAt,
      readAt: null,
    });
    return { message: { id: ref.id, sender: 'user', body: text, createdAt, readAt: null } };
  },

  receivedLikes: async () => {
    const uid = await getUid();
    if (!uid) return { receivedLikes: [] };
    const { collection, query, where, orderBy, getDocs, limit, db } = await getMods();
    const snap = await getDocs(query(
      collection(db, 'receivedLikes'),
      where('forUid', '==', uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(RECEIVED_LIKES_LIMIT)
    ));
    const pending = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const receivedLikes = await Promise.all(pending.map(async (rl) => {
      const fromProfile = await fetchPublicProfile(rl.fromUid);
      return {
        id: rl.id,
        fromProfileId: rl.fromUid,
        fromProfileName: fromProfile?.name || rl.fromProfileName || '',
        fromPhoto: pickProfilePhoto(fromProfile) || rl.fromProfilePhoto || '',
        fromRank: fromProfile?.rank || rl.fromProfileRank || '',
        fromRole: fromProfile?.role || rl.fromProfileRole || '',
        type: rl.type || 'like',
        status: 'pending',
        createdAt: rl.createdAt,
      };
    }));
    return { receivedLikes };
  },

  acceptLike: async ({ receivedLikeId }) => {
    const uid = await currentUserOrThrow();
    if (!receivedLikeId) throw apiError('いいねが見つかりません', 404);
    const { doc, getDoc, db } = await getMods();
    const rlSnap = await getDoc(doc(db, 'receivedLikes', receivedLikeId));
    if (!rlSnap.exists()) throw apiError('いいねが見つかりません', 404);
    const fromUid = rlSnap.data().fromUid;
    const { httpsCallable, functions } = await getFunctionsMods();
    const sendLike = httpsCallable(functions, 'sendLike');
    try {
      const result = await sendLike({ profileId: fromUid, type: 'like', acceptingLikeId: receivedLikeId });
      return { match: result.data.match, matched: true };
    } catch (e) {
      if (e.code === 'functions/not-found') throw apiError('相手が見つかりません', 404);
      if (e.code === 'functions/permission-denied') throw apiError('このユーザーにLIKEできません', 403);
      throw e;
    }
  },

  footprints: async () => {
    const uid = await getUid();
    if (!uid) return { footprints: [] };
    const { collection, query, where, orderBy, getDocs, limit, db } = await getMods();
    const snap = await getDocs(query(
      collection(db, 'footprints'),
      where('profileId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(FOOTPRINT_LIMIT)
    ));
    const raw = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const footprints = await Promise.all(raw.map(async (f) => {
      const actor = await fetchPublicProfile(f.actorUid);
      return {
        id: f.id,
        actorUid: f.actorUid,
        name: typeof actor?.name === 'string' ? actor.name : '',
        rank: typeof actor?.rank === 'string' ? actor.rank : '',
        gender: typeof actor?.gender === 'string' ? actor.gender : '',
        action: f.action,
        createdAt: f.createdAt,
        time: f.createdAt,
      };
    }));
    return { footprints };
  },

  recordFootprint: async ({ profileId, action }) => {
    const uid = await getUid();
    if (!uid || !profileId || uid === profileId) return {};
    const allowedActions = ['見送り', 'LIKE', '両LIKE', 'プロフィール閲覧'];
    if (!allowedActions.includes(action)) return {};
    const { doc, setDoc, db } = await getMods();
    const day = dayKey();
    const footprintId = `${profileId}_from_${uid}_${day}`;
    await setDoc(doc(db, 'footprints', footprintId), {
      actorUid: uid,
      profileId,
      action,
      day,
      createdAt: now(),
    }).catch(() => null);
    return {};
  },

  report: async ({ profileId, reason = '' }) => {
    await currentUserOrThrow();
    if (!profileId) throw apiError('不正なリクエストです', 400);
    const { httpsCallable, functions } = await getFunctionsMods();
    try {
      await httpsCallable(functions, 'sendReport')({ profileId, reason });
    } catch (e) {
      if (e.code === 'functions/already-exists') throw apiError('すでにこのユーザーを通報済みです', 409);
      if (e.code === 'functions/not-found') throw apiError('対象ユーザーが見つかりません', 404);
      if (e.code === 'functions/resource-exhausted') throw apiError('本日の通報上限に達しました', 429);
      if (e.code === 'functions/invalid-argument') throw apiError(e.message, 400);
      throw e;
    }
    return {};
  },

  block: async ({ profileId }) => {
    const uid = await currentUserOrThrow();
    if (!profileId) throw apiError('不正なリクエストです', 400);
    const { doc, setDoc, db } = await getMods();
    await setDoc(doc(db, 'blocks', `${uid}_block_${profileId}`), { byUid: uid, targetUid: profileId, createdAt: now() });
    return {};
  },

  entitlements: async () => {
    const uid = await getUid();
    if (!uid) return { entitlements: buildEntitlements('FREE') };
    const user = await fetchUserProfile(uid);
    return { entitlements: buildEntitlements(user?.plan || 'FREE') };
  },

  purchase: async ({ plan }) => {
    const uid = await currentUserOrThrow();
    const requestedPlan = Object.prototype.hasOwnProperty.call(PLANS_DATA.plans, plan) ? plan : 'FREE';
    const user = await fetchUserProfile(uid);
    return {
      purchase: { plan: requestedPlan, demo: true },
      entitlements: buildEntitlements(user?.plan || 'FREE'),
    };
  },

  purchaseItem: async () => {
    const uid = await getUid();
    const user = uid ? await fetchUserProfile(uid) : null;
    return { entitlements: buildEntitlements(user?.plan || 'FREE') };
  },

  subscribeDmThread: (matchId, uid, onUpdate) => {
    let unsubscribeFirestore = null;
    let cancelled = false;
    getMods().then(({ collection, query, where, orderBy, limit, onSnapshot, db }) => {
      if (cancelled) return;
      unsubscribeFirestore = onSnapshot(
        query(
          collection(db, 'messages'),
          where('matchId', '==', matchId),
          orderBy('createdAt', 'desc'),
          limit(DM_MESSAGE_LIMIT)
        ),
        (snap) => {
          if (cancelled) return;
          const messages = snap.docs
            .map((d) => messageFromDoc(d, uid))
            .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
          onUpdate(messages);
        }
      );
    }).catch(() => null);
    return () => {
      cancelled = true;
      unsubscribeFirestore?.();
    };
  },

  reports: async () => {
    const uid = await getUid();
    if (!uid) return { reports: [], flaggedUsers: [] };
    const me = await fetchUserProfile(uid);
    if (!me?.isAdmin) return { reports: [], flaggedUsers: [] };
    const { collection, query, orderBy, getDocs, limit, db } = await getMods();
    const snap = await getDocs(query(
      collection(db, 'reports'),
      orderBy('createdAt', 'desc'),
      limit(ADMIN_REPORT_LIMIT)
    ));
    const reports = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    return { reports, flaggedUsers: [] };
  },

  adminUnhide: async ({ profileId }) => {
    await currentUserOrThrow();
    if (!profileId) throw apiError('対象ユーザーが必要です', 400);
    const { httpsCallable, functions } = await getFunctionsMods();
    try {
      await httpsCallable(functions, 'adminUnhide')({ profileId });
    } catch (e) {
      if (e.code === 'functions/permission-denied') throw apiError('権限がありません', 403);
      throw e;
    }
    return {};
  },

  adminAudit: async () => ({ audit: [] }),
};
