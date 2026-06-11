import { isDevSession, DEV_UID } from './dev-auth.js';

// Cloudflare Pages などの静的ホスティングでは Express /api が動かないため、
// フロントは Firebase Auth + Firestore を直接利用する。
// Node/Express API を別ホストで使う場合は、別途 API クライアントへ切り替える。
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
      query: fs.query,
      where: fs.where,
      onSnapshot: fs.onSnapshot,
      db: fb.firebaseDb,
      auth: fb.firebaseAuth,
    }));
  }
  return _modsPromise;
}

async function getUid() {
  if (isDevSession()) return DEV_UID;
  try {
    const { auth } = await getMods();
    return auth?.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function now() { return new Date().toISOString(); }

function apiError(message, httpStatus) {
  const e = new Error(message || 'リクエストに失敗しました');
  e.httpStatus = httpStatus;
  return e;
}

async function fetchUserProfile(uid) {
  if (!uid) return null;
  try {
    const { doc, getDoc, db } = await getMods();
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.warn('[pairly] Firestore read failed:', e.message);
    return null;
  }
}

async function writeUserProfile(uid, data) {
  const { doc, setDoc, db } = await getMods();
  try {
    await setDoc(doc(db, 'users', uid), data, { merge: true });
  } catch (e) {
    console.error('[pairly] Firestore write failed:', e.message);
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

const PLANS_DATA = {
  plans: {
    FREE: { name: 'FREE', price: 0, dailyLikes: 10, dailySuperLikes: 1, dualLikes: 5, genderFilter: false, rankFilter: false, footprints: false, spotlight: false, features: ['通常LIKE 10回/day', 'SUPER LIKE 1回/day', '両LIKE 5回', 'マッチ後DM'] },
    PLUS: { name: 'PLUS', price: 980, dailyLikes: 40, dailySuperLikes: 5, dualLikes: 10, genderFilter: true, rankFilter: true, footprints: true, spotlight: false, features: ['通常LIKE 40回/day', 'SUPER LIKE 5回/day', '性別指定フィルター', '足あと詳細'] },
    VIP: { name: 'VIP', price: 1980, dailyLikes: -1, dailySuperLikes: -1, dualLikes: -1, genderFilter: true, rankFilter: true, footprints: true, spotlight: true, features: ['LIKE無制限', 'SUPER LIKE無制限', '性別指定フィルター', '全制限解除'] },
  },
  singleItems: [
    { name: '性別指定フィルター7日', price: 400, detail: 'FREEでも7日間だけ表示性別を指定できます。' },
    { name: 'ブースト24時間', price: 300, detail: 'プロフィールを表示候補に出やすくします。' },
    { name: 'SUPER LIKE 3回', price: 500, detail: '相手に強めのLIKEを送れます。' },
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
    superCredits: plan === 'VIP' ? 999 : 0,
  };
}

function buildMatchObject(matchId, otherProfile, createdAt = '') {
  if (!otherProfile) return null;
  return {
    id: matchId,
    profileId: otherProfile.id,
    profileName: otherProfile.name || '',
    profilePhoto: otherProfile.profilePhoto || '',
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
    profileVoiceIntro: otherProfile.voiceIntro || '',
    profileBio: otherProfile.bio || '',
    profileRiotId: otherProfile.riotId || '',
    dmUnlocked: true,
    createdAt: createdAt || now(),
    opener: `${otherProfile.name || '相手'}さんとマッチしました！`,
  };
}

async function currentUserOrThrow() {
  const uid = await getUid();
  if (!uid) throw apiError('未認証です', 401);
  return uid;
}

export const api = {
  plans: async () => PLANS_DATA,
  config: async () => ({ devLogin: Boolean(import.meta.env.DEV) }),

  login: async () => {
    const uid = await currentUserOrThrow();
    const user = await fetchUserProfile(uid);
    if (!user) throw apiError('プロフィールが見つかりません', 404);
    return { user };
  },

  register: async (body) => {
    const uid = await currentUserOrThrow();
    const { password, emailConfirm, idToken, agreed, age, ...rest } = body || {};
    const userData = {
      ...rest,
      id: uid,
      ageRange: age || rest.ageRange || '',
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
    const { password, emailConfirm, idToken, age, agreed, ...rest } = body || {};
    const user = await writeUserProfile(uid, {
      ...rest,
      ageRange: age || rest.ageRange || '',
      updatedAt: now(),
    });
    return { user };
  },

  profiles: async ({ targetGender = 'all', targetRank = 'all' } = {}) => {
    const uid = await getUid();
    if (!uid) return { profiles: [] };
    const { collection, query, where, getDocs, db } = await getMods();

    const [blocksSnap, blockedBySnap, likesSnap] = await Promise.all([
      getDocs(query(collection(db, 'blocks'), where('byUid', '==', uid))),
      getDocs(query(collection(db, 'blocks'), where('targetUid', '==', uid))),
      getDocs(query(collection(db, 'likes'), where('fromUid', '==', uid))),
    ]);

    const excludedUids = new Set([
      uid,
      ...blocksSnap.docs.map((d) => d.data().targetUid),
      ...blockedBySnap.docs.map((d) => d.data().byUid),
      ...likesSnap.docs.map((d) => d.data().toUid),
    ]);

    const snap = await getDocs(query(collection(db, 'users')));
    const candidates = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => {
        if (excludedUids.has(p.id)) return false;
        if (p.autoHidden === true) return false;
        if (targetGender !== 'all') {
          const g = p.gender || '';
          if (targetGender === 'その他/未設定') {
            if (g !== '' && g !== 'その他/未設定') return false;
          } else if (g !== targetGender) return false;
        }
        if (targetRank !== 'all') {
          const tier = (p.rank || '').split(' ')[0];
          if (tier !== targetRank) return false;
        }
        return true;
      });

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    return { profiles: candidates.slice(0, 20) };
  },

  like: async ({ profileId, type = 'like' }) => {
    const uid = await currentUserOrThrow();
    if (!profileId) throw apiError('対象プロフィールが必要です', 400);
    const { doc, getDoc, setDoc, db } = await getMods();

    await setDoc(doc(db, 'likes', `${uid}_${profileId}`), {
      fromUid: uid,
      toUid: profileId,
      type,
      createdAt: now(),
    });

    const rlId = `${profileId}_from_${uid}`;
    const existingRl = await getDoc(doc(db, 'receivedLikes', rlId));
    if (!existingRl.exists()) {
      const myProfile = await fetchUserProfile(uid);
      await setDoc(doc(db, 'receivedLikes', rlId), {
        forUid: profileId,
        fromUid: uid,
        fromProfileName: myProfile?.name || '',
        fromProfilePhoto: myProfile?.profilePhoto || '',
        fromProfileRank: myProfile?.rank || '',
        fromProfileRole: myProfile?.role || '',
        type,
        status: 'pending',
        createdAt: now(),
      });
    }

    const mutualSnap = await getDoc(doc(db, 'likes', `${profileId}_${uid}`));
    if (mutualSnap.exists()) {
      const matchId = [uid, profileId].sort().join('_match_');
      const theirProfile = await fetchUserProfile(profileId);
      const existingMatch = await getDoc(doc(db, 'matches', matchId));
      if (!existingMatch.exists()) {
        await setDoc(doc(db, 'matches', matchId), {
          id: matchId,
          participants: [uid, profileId],
          createdAt: now(),
        });
      }
      await Promise.all([
        setDoc(doc(db, 'receivedLikes', rlId), { status: 'accepted' }, { merge: true }),
        setDoc(doc(db, 'receivedLikes', `${uid}_from_${profileId}`), { status: 'accepted' }, { merge: true }),
      ]);
      return { match: buildMatchObject(matchId, theirProfile), entitlements: buildEntitlements('FREE') };
    }

    return { pending_sent: true, entitlements: buildEntitlements('FREE') };
  },

  matches: async () => {
    const uid = await getUid();
    if (!uid) return { matches: [] };
    const { collection, query, where, getDocs, db } = await getMods();
    const snap = await getDocs(query(collection(db, 'matches'), where('participants', 'array-contains', uid)));
    const matches = (await Promise.all(snap.docs.map(async (d) => {
      const m = { id: d.id, ...d.data() };
      const otherUid = m.participants?.find((p) => p !== uid);
      const otherProfile = await fetchUserProfile(otherUid);
      return buildMatchObject(m.id, otherProfile, m.createdAt);
    }))).filter(Boolean);
    return { matches };
  },

  dmThreads: async () => {
    const uid = await getUid();
    if (!uid) return { threads: [] };
    const { collection, query, where, getDocs, db } = await getMods();
    const matchesSnap = await getDocs(query(collection(db, 'matches'), where('participants', 'array-contains', uid)));
    const threads = await Promise.all(matchesSnap.docs.map(async (matchDoc) => {
      const match = { id: matchDoc.id, ...matchDoc.data() };
      const otherUid = match.participants?.find((p) => p !== uid);
      const [otherProfile, msgsSnap] = await Promise.all([
        fetchUserProfile(otherUid),
        getDocs(query(collection(db, 'messages'), where('matchId', '==', match.id))),
      ]);
      const messages = msgsSnap.docs.map((d) => {
        const msg = d.data();
        return {
          id: d.id,
          sender: msg.senderUid === uid ? 'user' : 'other',
          body: msg.body,
          createdAt: msg.createdAt,
          readAt: msg.readAt || null,
        };
      }).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
      const unreadCount = messages.filter((m) => m.sender === 'other' && !m.readAt).length;
      return { match: buildMatchObject(match.id, otherProfile, match.createdAt), messages, unreadCount };
    }));
    threads.sort((a, b) => {
      const at = a.messages.at(-1)?.createdAt || a.match?.createdAt || '';
      const bt = b.messages.at(-1)?.createdAt || b.match?.createdAt || '';
      return bt.localeCompare(at);
    });
    return { threads: threads.filter((t) => t.match) };
  },

  markDmRead: async ({ matchId }) => {
    const uid = await getUid();
    if (!uid || !matchId) return {};
    const { collection, query, where, getDocs, updateDoc, db } = await getMods();
    const snap = await getDocs(query(collection(db, 'messages'), where('matchId', '==', matchId)));
    const readAt = now();
    await Promise.all(snap.docs
      .filter((d) => d.data().senderUid !== uid && !d.data().readAt)
      .map((d) => updateDoc(d.ref, { readAt })));
    return {};
  },

  sendDm: async ({ matchId, body }) => {
    const uid = await currentUserOrThrow();
    const text = String(body || '').trim();
    if (!matchId || !text) throw apiError('送信内容が不正です', 400);
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
    const { collection, query, where, getDocs, db } = await getMods();
    const snap = await getDocs(query(collection(db, 'receivedLikes'), where('forUid', '==', uid)));
    const receivedLikes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((rl) => rl.status === 'pending')
      .map((rl) => ({
        id: rl.id,
        fromProfileId: rl.fromUid,
        fromProfileName: rl.fromProfileName || '',
        fromPhoto: rl.fromProfilePhoto || '',
        fromRank: rl.fromProfileRank || '',
        fromRole: rl.fromProfileRole || '',
        type: rl.type || 'like',
        status: 'pending',
        createdAt: rl.createdAt,
      }));
    return { receivedLikes };
  },

  acceptLike: async ({ receivedLikeId }) => {
    const uid = await currentUserOrThrow();
    if (!receivedLikeId) throw apiError('いいねが見つかりません', 404);
    const { doc, getDoc, setDoc, updateDoc, db } = await getMods();
    const rlSnap = await getDoc(doc(db, 'receivedLikes', receivedLikeId));
    if (!rlSnap.exists()) throw apiError('いいねが見つかりません', 404);
    const fromUid = rlSnap.data().fromUid;

    await setDoc(doc(db, 'likes', `${uid}_${fromUid}`), { fromUid: uid, toUid: fromUid, type: 'like', createdAt: now() });
    const matchId = [uid, fromUid].sort().join('_match_');
    const theirProfile = await fetchUserProfile(fromUid);
    const existingMatch = await getDoc(doc(db, 'matches', matchId));
    if (!existingMatch.exists()) {
      await setDoc(doc(db, 'matches', matchId), { id: matchId, participants: [uid, fromUid], createdAt: now() });
    }
    await updateDoc(doc(db, 'receivedLikes', receivedLikeId), { status: 'accepted' });
    return { match: buildMatchObject(matchId, theirProfile), matched: true };
  },

  footprints: async () => {
    const uid = await getUid();
    if (!uid) return { footprints: [] };
    const { collection, query, where, getDocs, db } = await getMods();
    const snap = await getDocs(query(collection(db, 'footprints'), where('actorUid', '==', uid)));
    const footprints = snap.docs
      .map((d) => ({ id: d.id, ...d.data(), time: d.data().createdAt }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 50);
    return { footprints };
  },

  recordFootprint: async ({ profileId, action }) => {
    const uid = await getUid();
    if (!uid || !profileId) return {};
    const { collection, addDoc, db } = await getMods();
    const target = await fetchUserProfile(profileId);
    await addDoc(collection(db, 'footprints'), {
      actorUid: uid,
      profileId,
      name: target?.name || '',
      rank: target?.rank || '',
      gender: target?.gender || '',
      action,
      createdAt: now(),
    });
    return {};
  },

  report: async ({ profileId, reason = '' }) => {
    const uid = await currentUserOrThrow();
    if (!profileId) throw apiError('不正なリクエストです', 400);
    const { collection, addDoc, db } = await getMods();
    await addDoc(collection(db, 'reports'), { reporterUid: uid, profileId, reason, status: 'open', createdAt: now() });
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
    await currentUserOrThrow();
    // Cloudflare + Firestore直利用では、クライアントだけで本物のプラン変更を保存しない。
    // Firestore Rulesも通常プロフィール更新による plan 変更を拒否する。
    // ここはUI確認用のデモレスポンスだけ返す。
    return { purchase: { plan, demo: true }, entitlements: buildEntitlements(plan) };
  },

  purchaseItem: async () => ({ entitlements: buildEntitlements('FREE') }),

  subscribeDmThread: (matchId, uid, onUpdate) => {
    let unsubscribeFirestore = null;
    let cancelled = false;
    getMods().then(({ collection, query, where, onSnapshot, db }) => {
      if (cancelled) return;
      unsubscribeFirestore = onSnapshot(
        query(collection(db, 'messages'), where('matchId', '==', matchId)),
        (snap) => {
          if (cancelled) return;
          const messages = snap.docs.map((d) => {
            const msg = d.data();
            return {
              id: d.id,
              sender: msg.senderUid === uid ? 'user' : 'other',
              body: msg.body,
              createdAt: msg.createdAt,
              readAt: msg.readAt || null,
            };
          }).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
          onUpdate(messages);
        }
      );
    }).catch(() => null);
    return () => {
      cancelled = true;
      unsubscribeFirestore?.();
    };
  },

  reports: async () => ({ reports: [], flaggedUsers: [] }),
  adminUnhide: async () => ({}),
  adminAudit: async () => ({ audit: [] }),
};
