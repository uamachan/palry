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
      increment: fs.increment,
      getCountFromServer: fs.getCountFromServer,
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
  'id', 'name', 'ageRange', 'age', 'gender', 'region',
  'profilePhotoUrl', 'profilePhotoPath', 'rank', 'role', 'tags', 'agents',
  'bio', 'voiceIntroUrl', 'voiceIntroPath', 'vc', 'maps',
  'favoriteWeapon', 'verified', 'createdAt', 'updatedAt',
];

const PROFILE_RESULT_LIMIT = 20;
const PROFILE_FALLBACK_READ_LIMIT = 50;
const MATCH_THREAD_LIMIT = 100;
const DM_MESSAGE_LIMIT = 50;
const RECEIVED_LIKES_LIMIT = 50;
const FOOTPRINT_LIMIT = 50;
const ADMIN_REPORT_LIMIT = 100;


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

async function writeUserProfile(uid, data) {
  const { profilePhoto: _ph, voiceIntro: _vi, ...safeData } = data || {};
  const { doc, writeBatch, db } = await getMods();
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid), safeData, { merge: true });
    const publicData = {};
    for (const key of PUBLIC_PROFILE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(safeData, key)) publicData[key] = safeData[key];
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

async function fallbackProfiles(uid) {
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
    .filter((p) => candidateAllowed(p, excludedUids, 'all', 'all'));

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

function buildMatchObject(matchId, otherProfile, createdAt = '', sortAt = '') {
  if (!otherProfile) return null;
  const resolvedCreatedAt = createdAt || now();
  return {
    id: matchId,
    profileId: otherProfile.id,
    profileName: otherProfile.name || '相手',
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
    createdAt: resolvedCreatedAt,
    sortAt: sortAt || resolvedCreatedAt,
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
  return match?.matchSortAt || match?.lastMessageAt || match?.updatedAt || match?.createdAt || '';
}

function profileFromMatchData(match, uid) {
  const otherUid = Array.isArray(match.participants) ? match.participants.find((p) => p !== uid) : null;
  const profile = match.profileData?.[otherUid] || {};
  return { id: otherUid, ...profile };
}

async function fetchMatchDocs(uid) {
  const { collection, query, where, orderBy, getDocs, limit, db } = await getMods();
  const byId = new Map();
  let orderedFailed = false;

  try {
    const ordered = await getDocs(query(
      collection(db, 'matches'),
      where('participants', 'array-contains', uid),
      orderBy('matchSortAt', 'desc'),
      limit(MATCH_THREAD_LIMIT)
    ));
    ordered.docs.forEach((d) => byId.set(d.id, d));
  } catch (error) {
    orderedFailed = true;
    console.warn('[palry] ordered matches query failed; using fallback:', error.code || error.message);
  }

  if (orderedFailed || byId.size === 0) {
    const fallback = await getDocs(query(
      collection(db, 'matches'),
      where('participants', 'array-contains', uid),
      limit(MATCH_THREAD_LIMIT)
    ));
    fallback.docs.forEach((d) => byId.set(d.id, d));
  }

  return Array.from(byId.values());
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
    return fallbackProfiles(uid);
  },

  like: async ({ profileId, type = 'like' }) => {
    const uid = await currentUserOrThrow();
    if (!profileId || typeof profileId !== 'string') throw apiError('対象プロフィールが必要です', 400);
    if (profileId === uid) throw apiError('自分自身にLIKEできません', 400);
    if (!['like', 'dual'].includes(type)) throw apiError('type が不正です', 400);

    const { doc, getDoc, setDoc, writeBatch, db } = await getMods();
    const likeId = `${uid}_${profileId}`;

    const [existingLike, blockByMe, blockByThem, theirSnap] = await Promise.all([
      getDoc(doc(db, 'likes', likeId)),
      getDoc(doc(db, 'blocks', `${uid}_block_${profileId}`)),
      getDoc(doc(db, 'blocks', `${profileId}_block_${uid}`)),
      getDoc(doc(db, 'users', profileId)),
    ]);

    if (existingLike.exists()) throw apiError('すでにLIKE済みです', 409);
    if (blockByMe.exists() || blockByThem.exists()) throw apiError('このユーザーにLIKEできません', 403);
    if (!theirSnap.exists() || theirSnap.data().autoHidden) throw apiError('相手が見つかりません', 404);

    const receivedLikeId = `${profileId}_from_${uid}`;
    const reverseLikeId = `${profileId}_${uid}`;
    const reverseRlId = `${uid}_from_${profileId}`;
    const createdAt = now();

    const [reverseSnap, reverseRlSnap, mySnap] = await Promise.all([
      getDoc(doc(db, 'likes', reverseLikeId)),
      getDoc(doc(db, 'receivedLikes', reverseRlId)),
      getDoc(doc(db, 'users', uid)),
    ]);

    const isMatch = reverseSnap.exists();
    const batch = writeBatch(db);

    batch.set(doc(db, 'likes', likeId), {
      fromUid: uid,
      toUid: profileId,
      type,
      createdAt,
    });

    batch.set(doc(db, 'receivedLikes', receivedLikeId), {
      forUid: profileId,
      fromUid: uid,
      type,
      status: isMatch ? 'accepted' : 'pending',
      createdAt,
    });

    if (isMatch) {
      if (reverseRlSnap.exists()) {
        batch.update(doc(db, 'receivedLikes', reverseRlId), { status: 'accepted' });
      }

      const matchId = [uid, profileId].sort().join('_');
      const myProfile = mySnap.data() || {};
      const theirProfile = theirSnap.data() || {};

      batch.set(doc(db, 'matches', matchId), {
        participants: [uid, profileId],
        createdAt,
        matchSortAt: createdAt,
        updatedAt: createdAt,
        unreadCountBy: { [uid]: 0, [profileId]: 0 },
        profileData: {
          [uid]: {
            name: myProfile.name || '',
            profilePhotoUrl: myProfile.profilePhotoUrl || '',
            rank: myProfile.rank || '',
            role: myProfile.role || '',
            gender: myProfile.gender || '',
            ageRange: myProfile.ageRange || myProfile.age || '',
            region: myProfile.region || '',
            tags: myProfile.tags || [],
            agents: myProfile.agents || [],
            xHandle: myProfile.xHandle || '',
            vc: myProfile.vc || '',
            maps: myProfile.maps || [],
            favoriteWeapon: myProfile.favoriteWeapon || '',
            voiceIntroUrl: myProfile.voiceIntroUrl || '',
            bio: myProfile.bio || '',
            riotId: myProfile.riotId || '',
          },
          [profileId]: {
            name: theirProfile.name || '',
            profilePhotoUrl: theirProfile.profilePhotoUrl || '',
            rank: theirProfile.rank || '',
            role: theirProfile.role || '',
            gender: theirProfile.gender || '',
            ageRange: theirProfile.ageRange || theirProfile.age || '',
            region: theirProfile.region || '',
            tags: theirProfile.tags || [],
            agents: theirProfile.agents || [],
            xHandle: theirProfile.xHandle || '',
            vc: theirProfile.vc || '',
            maps: theirProfile.maps || [],
            favoriteWeapon: theirProfile.favoriteWeapon || '',
            voiceIntroUrl: theirProfile.voiceIntroUrl || '',
            bio: theirProfile.bio || '',
            riotId: theirProfile.riotId || '',
          },
        },
      });

      await batch.commit();

      const matchObj = buildMatchObject(matchId, { id: profileId, ...theirProfile }, createdAt);
      const user = await fetchUserProfile(uid);
      return { matched: true, match: matchObj, entitlements: buildEntitlements(user?.plan || 'FREE') };
    }

    await batch.commit();
    const user = await fetchUserProfile(uid);
    return { matched: false, entitlements: buildEntitlements(user?.plan || 'FREE') };
  },

  matches: async () => {
    const uid = await getUid();
    if (!uid) return { matches: [] };
    const docs = await fetchMatchDocs(uid);
    const matches = docs.map((d) => {
      const m = { ...d.data(), id: d.id };
      const otherProfile = profileFromMatchData(m, uid);
      return buildMatchObject(m.id, otherProfile, m.createdAt, matchSortTime(m));
    }).filter(Boolean);
    matches.sort((a, b) => (b.sortAt || '').localeCompare(a.sortAt || ''));
    return { matches };
  },

  dmThreads: async () => {
    const uid = await getUid();
    if (!uid) return { threads: [] };
    const docs = await fetchMatchDocs(uid);
    const threads = docs.map((matchDoc) => {
      const match = { ...matchDoc.data(), id: matchDoc.id };
      const otherUid = Array.isArray(match.participants) ? match.participants.find((p) => p !== uid) : null;
      const otherProfile = profileFromMatchData(match, uid);
      return {
        match: buildMatchObject(match.id, otherProfile, match.createdAt, matchSortTime(match)),
        messages: messageFromMatchSummary(match, uid, otherUid),
        unreadCount: Number(match.unreadCountBy?.[uid] || 0),
      };
    });
    threads.sort((a, b) => (b.match?.sortAt || '').localeCompare(a.match?.sortAt || ''));
    return { threads: threads.filter((t) => t.match) };
  },

  markDmRead: async ({ matchId }) => {
    if (!matchId) return {};
    const uid = await getUid();
    if (!uid) return {};
    const { doc, getDoc, writeBatch, updateDoc, increment, db } = await getMods();
    const matchSnap = await getDoc(doc(db, 'matches', matchId));
    if (!matchSnap.exists()) return {};
    const matchData = matchSnap.data();
    if (!Array.isArray(matchData.participants) || !matchData.participants.includes(uid)) return {};

    const unread = Number(matchData.unreadCountBy?.[uid] || 0);
    if (unread === 0) return {};

    await updateDoc(doc(db, 'matches', matchId), {
      [`unreadCountBy.${uid}`]: 0,
      [`lastReadAtBy.${uid}`]: now(),
    });
    return {};
  },

  sendDm: async ({ matchId, body }) => {
    const uid = await currentUserOrThrow();
    const text = String(body || '').trim();
    if (!matchId || !text) throw apiError('送信内容が不正です', 400);
    if (text.length > 500) throw apiError('DMは500文字以内です', 400);

    const { doc, getDoc, addDoc, updateDoc, increment, collection, db } = await getMods();
    const matchSnap = await getDoc(doc(db, 'matches', matchId));
    if (!matchSnap.exists()) throw apiError('スレッドが見つかりません', 404);
    const matchData = matchSnap.data();
    if (!Array.isArray(matchData.participants) || !matchData.participants.includes(uid)) {
      throw apiError('参加していないスレッドです', 403);
    }
    const otherUid = matchData.participants.find((p) => p !== uid);

    const createdAt = now();
    const msgRef = await addDoc(collection(db, 'messages'), {
      matchId,
      senderUid: uid,
      body: text,
      createdAt,
      readAt: null,
    });

    await updateDoc(doc(db, 'matches', matchId), {
      lastMessageAt: createdAt,
      matchSortAt: createdAt,
      updatedAt: createdAt,
      [`unreadCountBy.${otherUid}`]: increment(1),
      lastMessage: { id: msgRef.id, senderUid: uid, body: text, createdAt },
    });

    return { message: { id: msgRef.id, sender: 'user', body: text, createdAt, readAt: null } };
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
      const fromProfile = rl.fromProfileSnapshot || await fetchPublicProfile(rl.fromUid);
      return {
        id: rl.id,
        fromProfileId: rl.fromUid,
        fromProfileName: fromProfile?.name || '',
        fromPhoto: pickProfilePhoto(fromProfile) || '',
        fromRank: fromProfile?.rank || '',
        fromRole: fromProfile?.role || '',
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
    const rl = rlSnap.data();
    if (rl.forUid !== uid) throw apiError('権限がありません', 403);
    const fromUid = rl.fromUid;

    const result = await api.like({ profileId: fromUid, type: 'like', _acceptingLikeId: receivedLikeId });
    return { match: result.match, matched: result.matched };
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
      const actor = f.actorProfileSnapshot || await fetchPublicProfile(f.actorUid);
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
    try {
      const { doc, setDoc, db } = await getMods();
      const footprintId = `${uid}_${profileId}_${dayKey()}`;
      await setDoc(doc(db, 'footprints', footprintId), {
        actorUid: uid,
        profileId,
        action,
        createdAt: now(),
        day: dayKey(),
      }, { merge: true });
    } catch (e) {
      console.warn('[palry] recordFootprint failed:', e.code || e.message);
    }
    return {};
  },

  report: async ({ profileId, reason = '' }) => {
    const uid = await currentUserOrThrow();
    if (!profileId) throw apiError('不正なリクエストです', 400);
    if (profileId === uid) throw apiError('自分自身を通報できません', 400);
    const { doc, getDoc, setDoc, db } = await getMods();
    const reportId = `${uid}_${profileId}`;
    const existing = await getDoc(doc(db, 'reports', reportId));
    if (existing.exists()) throw apiError('すでにこのユーザーを通報済みです', 409);
    const targetSnap = await getDoc(doc(db, 'users', profileId));
    if (!targetSnap.exists()) throw apiError('対象ユーザーが見つかりません', 404);
    await setDoc(doc(db, 'reports', reportId), {
      reporterUid: uid,
      profileId,
      reason: String(reason || '').slice(0, 500),
      createdAt: now(),
    });
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

  purchase: async () => {
    throw apiError('プラン購入はサポートされていません。管理者にお問い合わせください。', 503);
  },

  purchaseItem: async () => {
    throw apiError('単発課金は現在ご利用いただけません', 503);
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
    const uid = await currentUserOrThrow();
    if (!profileId) throw apiError('対象ユーザーが必要です', 400);
    const me = await fetchUserProfile(uid);
    if (!me?.isAdmin) throw apiError('権限がありません', 403);
    const { doc, writeBatch, db } = await getMods();
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', profileId), { autoHidden: false, visible: true, updatedAt: now() });
    batch.update(doc(db, 'publicProfiles', profileId), { autoHidden: false, visible: true, updatedAt: now() });
    await batch.commit();
    return {};
  },

  adminAudit: async () => ({ audit: [] }),

  getNotificationCounts: async () => {
    const uid = await getUid();
    if (!uid) return { unreadDmCount: 0, receivedLikeCount: 0, footprintCount: 0 };
    try {
      const { collection, query, where, getCountFromServer, db } = await getMods();
      const [rlCount, fpCount] = await Promise.all([
        getCountFromServer(query(
          collection(db, 'receivedLikes'),
          where('forUid', '==', uid),
          where('status', '==', 'pending')
        )),
        getCountFromServer(query(
          collection(db, 'footprints'),
          where('profileId', '==', uid)
        )),
      ]);
      const matchDocs = await fetchMatchDocs(uid);
      let unreadDmCount = 0;
      matchDocs.forEach((d) => { unreadDmCount += Number(d.data()?.unreadCountBy?.[uid] || 0); });
      return {
        unreadDmCount,
        receivedLikeCount: rlCount.data().count,
        footprintCount: fpCount.data().count,
      };
    } catch (e) {
      console.warn('[palry] getNotificationCounts failed:', e.code || e.message);
      return { unreadDmCount: 0, receivedLikeCount: 0, footprintCount: 0 };
    }
  },
};
