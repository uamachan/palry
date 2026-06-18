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

// 新規アップロード対象（data URL）かどうか。既存のhttps URLは再アップロードしない。
function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
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
    const profile = { ...snap.data(), id: snap.id };
    // 表示側は profilePhoto / voiceIntro を参照するため、保存済みURLから正規化する。
    profile.profilePhoto = pickProfilePhoto(profile);
    profile.voiceIntro = pickVoiceIntro(profile);
    return profile;
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

let _storagePromise = null;
async function getStorageMods() {
  if (!_storagePromise) {
    _storagePromise = Promise.all([
      import('firebase/storage'),
      import('./firebase.js'),
    ]).then(([st, fb]) => {
      // バケット未設定だと getStorage が不可解なエラーを投げるので、先に明示的に弾く。
      if (!fb.firebaseApp?.options?.storageBucket) {
        throw new Error('Storageバケットが未設定です。VITE_FIREBASE_STORAGE_BUCKET を設定してください。');
      }
      return {
        ref: st.ref,
        uploadString: st.uploadString,
        getDownloadURL: st.getDownloadURL,
        deleteObject: st.deleteObject,
        storage: st.getStorage(fb.firebaseApp),
      };
    }).catch((e) => {
      // 失敗したPromiseをキャッシュし続けると以降のアップロードが永久に失敗するため破棄。
      _storagePromise = null;
      throw e;
    });
  }
  return _storagePromise;
}

async function uploadDataUrl(uid, type, dataUrl) {
  const { ref, uploadString, getDownloadURL, storage } = await getStorageMods();
  const { auth } = await getMods();
  // トークンをアップロード前にリフレッシュ。Storage の write ルールも verifiedUser()
  // を要求するため、古いトークン（email_verified=false）のままだと uploadString 自体が
  // permission-denied で弾かれる。
  await auth.currentUser?.getIdToken(true);
  // ファイル名を一意にして固定パスの上書きを避ける。書き込みが失敗しても
  // 既存（参照中）のオブジェクトを壊さず、成功時に旧ファイルを削除する。
  const path = `profileMedia/${uid}/${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileRef = ref(storage, path);
  await uploadString(fileRef, dataUrl, 'data_url');
  try {
    const url = await getDownloadURL(fileRef);
    return { url, path };
  } catch (e) {
    // FirebaseError を直接書き換えず、新しい Error に必要なフィールドをコピーして投げる。
    // storagePath を付けることで呼び出し元が孤立オブジェクトを掃除できる。
    throw Object.assign(new Error(e.message), { code: e.code, storagePath: path });
  }
}

// 写真と音声を並列アップロードする。任意項目なので、失敗しても登録自体は止めず、
// 成功した分だけ URL を返し、失敗した項目名を warnings に積む。
// uploadedPaths には成功した分の Storage パスを記録し、後続の書き込み失敗時に掃除できるようにする。
async function uploadProfileMedia(uid, profilePhoto, voiceIntro) {
  const fields = {};
  const failedLabels = [];
  const uploadedPaths = [];
  const jobs = [];
  if (isDataUrl(profilePhoto)) {
    jobs.push(uploadDataUrl(uid, 'profilePhoto', profilePhoto)
      .then(({ url, path }) => { fields.profilePhotoUrl = url; fields.profilePhotoPath = path; uploadedPaths.push(path); })
      .catch((e) => { if (e.storagePath) uploadedPaths.push(e.storagePath); console.error('[palry] profilePhoto upload failed:', e.message); failedLabels.push('写真'); }));
  }
  if (isDataUrl(voiceIntro)) {
    jobs.push(uploadDataUrl(uid, 'voiceIntro', voiceIntro)
      .then(({ url, path }) => { fields.voiceIntroUrl = url; fields.voiceIntroPath = path; uploadedPaths.push(path); })
      .catch((e) => { if (e.storagePath) uploadedPaths.push(e.storagePath); console.error('[palry] voiceIntro upload failed:', e.message); failedLabels.push('音声自己紹介'); }));
  }
  await Promise.all(jobs);
  const mediaWarning = failedLabels.length
    ? `${failedLabels.join('・')}の保存に失敗しました。後でプロフィール編集から再設定してください`
    : null;
  return { fields, mediaWarning, uploadedPaths };
}

// アップロード済みオブジェクトをベストエフォートで削除する（孤立防止）。失敗は握りつぶす。
async function deleteProfileMedia(paths) {
  if (!paths?.length) return;
  try {
    const { ref, deleteObject, storage } = await getStorageMods();
    await Promise.all(paths.map((path) =>
      deleteObject(ref(storage, path)).catch((e) =>
        console.error('[palry] orphan cleanup failed:', path, e.message))));
  } catch (e) {
    console.error('[palry] orphan cleanup skipped:', e.message);
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
  const { profilePhoto, voiceIntro, ...safeData } = data || {};
  let mediaWarning = null;
  let uploadedPaths = [];
  const replacedPaths = [];
  if (isDataUrl(profilePhoto) || isDataUrl(voiceIntro)) {
    // 差し替え前の旧パス（編集時は既存ドキュメント由来で safeData に入っている）を控える。
    const prevPhotoPath = safeData.profilePhotoPath;
    const prevVoicePath = safeData.voiceIntroPath;
    const result = await uploadProfileMedia(uid, profilePhoto, voiceIntro);
    Object.assign(safeData, result.fields);
    mediaWarning = result.mediaWarning;
    uploadedPaths = result.uploadedPaths;
    if (result.fields.profilePhotoPath && prevPhotoPath && prevPhotoPath !== result.fields.profilePhotoPath) replacedPaths.push(prevPhotoPath);
    if (result.fields.voiceIntroPath && prevVoicePath && prevVoicePath !== result.fields.voiceIntroPath) replacedPaths.push(prevVoicePath);
  }
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
    // 今回アップロードしたメディアは一意名でまだどこからも参照されていないため、
    // 書き込み失敗時は常に掃除して孤立を防ぐ（既存メディアには影響しない）。
    await deleteProfileMedia(uploadedPaths);
    if (e.message?.includes('Database') || e.message?.includes('not-found') || e.code === 'not-found') {
      throw new Error('Firestoreデータベースが見つかりません。Firebase ConsoleでFirestoreを有効化してください。');
    }
    if (e.code === 'permission-denied') {
      throw new Error('Firestoreの書き込みが拒否されました。セキュリティルールを確認してください。');
    }
    throw e;
  }
  // 書き込み成功後に、差し替えられた旧メディアをベストエフォートで掃除する。
  await deleteProfileMedia(replacedPaths);
  const user = await fetchUserProfile(uid);
  return { user, mediaWarning };
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
    const { user, mediaWarning } = await writeUserProfile(uid, userData);
    return { user, message: mediaWarning ? `アカウントを作成しました（${mediaWarning}）` : 'アカウントを作成しました' };
  },

  updateProfile: async (body) => {
    const uid = await currentUserOrThrow();
    const { password, emailConfirm, idToken, age, agreed, email, ...rest } = body || {};
    const { deleteField } = await getMods();
    const { user, mediaWarning } = await writeUserProfile(uid, {
      ...rest,
      ageRange: age || rest.ageRange || '',
      email: deleteField(),
      updatedAt: now(),
    });
    return { user, message: mediaWarning };
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
      if (import.meta.env.PROD) throw e;
      console.warn('[palry] getCandidateProfiles failed; using limited fallback (dev only):', e.code || e.message);
      return fallbackProfiles(uid);
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
    const { httpsCallable, functions } = await getFunctionsMods();
    await httpsCallable(functions, 'markDmRead')({ matchId });
    return {};
  },

  sendDm: async ({ matchId, body }) => {
    await currentUserOrThrow();
    const text = String(body || '').trim();
    if (!matchId || !text) throw apiError('送信内容が不正です', 400);
    if (text.length > 500) throw apiError('DMは500文字以内です', 400);
    const { httpsCallable, functions } = await getFunctionsMods();
    const result = await httpsCallable(functions, 'sendDm')({ matchId, body: text });
    return { message: result.data?.message };
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
      const { httpsCallable, functions } = await getFunctionsMods();
      await httpsCallable(functions, 'recordFootprint')({ profileId, action });
    } catch (e) {
      console.warn('[palry] recordFootprint failed:', e.code || e.message);
    }
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

  purchase: async ({ sessionId }) => {
    if (!sessionId) throw apiError('sessionId が必要です', 400);
    const { httpsCallable, functions } = await getFunctionsMods();
    const result = await httpsCallable(functions, 'purchase')({ sessionId });
    const plan = result.data?.plan || 'FREE';
    return {
      purchase: { plan },
      entitlements: buildEntitlements(plan),
    };
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

  getNotificationCounts: async () => {
    const uid = await getUid();
    if (!uid) return { unreadDmCount: 0, receivedLikeCount: 0, footprintCount: 0 };
    try {
      const { httpsCallable, functions } = await getFunctionsMods();
      const result = await httpsCallable(functions, 'getNotificationCounts')({});
      return result.data || { unreadDmCount: 0, receivedLikeCount: 0, footprintCount: 0 };
    } catch (e) {
      console.warn('[palry] getNotificationCounts failed:', e.code || e.message);
      return { unreadDmCount: 0, receivedLikeCount: 0, footprintCount: 0 };
    }
  },
};
