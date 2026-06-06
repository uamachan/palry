import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import { cx, planLabel, appTabs, defaultRole, roles } from './constants.jsx';
import SiteHeader from './SiteHeader.jsx';
import PublicPricing from './Pricing.jsx';
import Safety from './Safety.jsx';
import './styles.css';

// ── Google Fonts を非同期で読み込む ──────────────────────────────────
// <script type="module"> は defer 扱いでレンダリングをブロックしないため、
// FCP/LCP をブロックせずにフォントを適用できる（font-display:swap と組み合わせ）。
const _fontLink = document.createElement('link');
_fontLink.rel = 'stylesheet';
_fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Outfit:wght@500;700;900&display=swap';
document.head.appendChild(_fontLink);

// ── React.lazy で遅延読み込みするコンポーネント ──────────────────────
// ログイン後のアプリ画面 → 未ログインユーザーにはダウンロードされない
const LazyAppDashboard = lazy(() => import('./AppDashboard.jsx'));
// 認証モーダル群 → ユーザーがログインボタンを押すまでダウンロードされない
const LazyAuthForms = lazy(() => import('./AuthForms.jsx'));

// ── Firebase SDK を動的インポートでFCPをブロックしない ────────────────
// 静的インポートをすると vendor-firebase が同期ロードされて LCP が遅れる。
// 動的インポートにすることで、Firebase は初回レンダリング完了後に初めてロードされる。
let _fbMods = null;
function getFirebaseMods() {
  if (_fbMods) return Promise.resolve(_fbMods);
  return Promise.all([
    import('firebase/auth'),
    import('./firebase.js'),
  ]).then(([auth, fb]) => {
    _fbMods = {
      browserLocalPersistence: auth.browserLocalPersistence,
      createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword,
      GoogleAuthProvider: auth.GoogleAuthProvider,
      onAuthStateChanged: auth.onAuthStateChanged,
      sendEmailVerification: auth.sendEmailVerification,
      sendPasswordResetEmail: auth.sendPasswordResetEmail,
      setPersistence: auth.setPersistence,
      signInWithEmailAndPassword: auth.signInWithEmailAndPassword,
      signInWithPopup: auth.signInWithPopup,
      signOut: auth.signOut,
      firebaseAuth: fb.firebaseAuth,
      firebaseReady: fb.firebaseReady,
    };
    return _fbMods;
  });
}

// ── authErrorMessage ────────────────────────────────────────────────
function authErrorMessage(error) {
  const code = error?.code || '';
  const message = error?.message || '';
  if (code.includes('api-key-not-valid') || message.includes('api-key-not-valid')) {
    return 'FirebaseのAPIキーが無効です。Firebase ConsoleのWeb API Keyを.envに入れ直して、ローカルを再起動してください。';
  }
  if (code === 'auth/email-already-in-use') return 'このメールアドレスはすでに登録されています。ログインしてください。';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') return 'メールアドレスまたはパスワードが違います。';
  if (code === 'auth/user-not-found') return 'このメールアドレスのアカウントが見つかりません。先にアカウント作成してください。';
  if (code === 'auth/operation-not-allowed') return 'Firebaseでメール/パスワードログインが有効になっていません。Authenticationのログイン方法を確認してください。';
  if (code === 'auth/network-request-failed') return 'Firebaseに接続できません。ネットワークを確認してください。';
  if (code === 'auth/invalid-email') return 'メールアドレスの形式を確認してください。';
  if (code === 'auth/popup-closed-by-user') return 'Googleログインのポップアップが閉じられました。もう一度お試しください。';
  if (code === 'auth/popup-blocked') return 'Googleログインのポップアップがブロックされました。ブラウザ設定を確認してください。';
  if (code === 'auth/account-exists-with-different-credential') return '同じメールアドレスの別ログイン方法が存在します。メール/パスワードでログインしてください。';
  return message || 'ログイン処理に失敗しました。';
}

// ── App（コア状態管理・認証ロジック）──────────────────────────────────
function App() {
  const [user, setUser] = useState(null);
  const [authBooting, setAuthBooting] = useState(true);
  const [view, setView] = useState('site');
  const [authMode, setAuthMode] = useState(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState(null);
  const [activeTab, setActiveTab] = useState('match');
  const [pricingTab, setPricingTab] = useState('monthly');
  const [plansData, setPlansData] = useState({ plans: {}, singleItems: [] });
  const [plan, setPlan] = useState('FREE');
  const [targetGender, setTargetGender] = useState('all');
  const [profiles, setProfiles] = useState([]);
  const [index, setIndex] = useState(0);
  const [stats, setStats] = useState({ likes: 0, passes: 0, super: 0, dual: 5, matches: 0 });
  const [matches, setMatches] = useState([]);
  const [receivedLikes, setReceivedLikes] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [dmDraft, setDmDraft] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [footprints, setFootprints] = useState([]);
  const [reports, setReports] = useState([]);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const notificationBooted = useRef(false);
  const lastNotificationCount = useRef(0);
  const [form, setForm] = useState({ name: '', gender: '', riotId: '', email: '', emailConfirm: '', password: '', age: '', region: '', profilePhoto: '', rank: 'Gold 1', role: defaultRole, tags: [], agents: [], xHandle: '', bio: '', voiceIntro: '', agreed: false });
  const [editForm, setEditForm] = useState({ name: '', gender: '', riotId: '', age: '', region: '', profilePhoto: '', rank: 'Gold 1', role: defaultRole, tags: [], agents: [], xHandle: '', bio: '', voiceIntro: '', agreed: true });

  const isAuthed = Boolean(user);
  const current = profiles[index] || null;
  const activePlan = plansData.plans?.[plan] || null;
  const genderFilterLocked = !activePlan?.genderFilter;
  const unreadDmCount = useMemo(() => dmThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0), [dmThreads]);
  const notificationCount = receivedLikes.length + unreadDmCount;

  // 料金データを取得（公開エンドポイント）
  useEffect(() => { api.plans().then(setPlansData).catch(() => showToast('料金データの取得に失敗しました')); }, []);

  // Firebase 認証状態を監視（動的インポートで FCP をブロックしない）
  // getFirebaseMods() は初回レンダリング後に実行されるため、FCPに影響しない。
  useEffect(() => {
    let canceled = false;
    let unsubAuth = () => {};

    getFirebaseMods()
      .then(({ firebaseAuth, firebaseReady, onAuthStateChanged, setPersistence, browserLocalPersistence }) => {
        if (canceled) return;
        if (!firebaseReady || !firebaseAuth) { setAuthBooting(false); return; }

        setPersistence(firebaseAuth, browserLocalPersistence).catch(() => null).finally(() => {
          if (canceled) return;
          unsubAuth = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
            if (!firebaseUser) {
              setUser(null);
              setPendingFirebaseUser(null);
              setAuthBooting(false);
              return;
            }

            setForm((cur) => ({ ...cur, email: firebaseUser.email || cur.email }));
            await firebaseUser.reload().catch(() => null);
            const curFbUser = firebaseAuth.currentUser || firebaseUser;

            if (!curFbUser.emailVerified) {
              setPendingUser(curFbUser.uid, curFbUser.email);
              setAuthMode('emailVerification');
              setView('site');
              setAuthBooting(false);
              return;
            }

            try {
              const restored = await loadSavedProfile(curFbUser);
              if (!restored) {
                setPendingUser(curFbUser.uid, curFbUser.email);
                setAuthMode('profileSetup');
                setView('site');
              }
            } catch (error) {
              if (error?.message?.includes('Pairlyプロフィール')) {
                setPendingUser(curFbUser.uid, curFbUser.email);
                setAuthMode('profileSetup');
              } else {
                setUser(null);
              }
            } finally {
              setAuthBooting(false);
            }
          });
        });
      })
      .catch(() => setAuthBooting(false));

    return () => { canceled = true; unsubAuth(); };
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    const appliedTarget = genderFilterLocked ? 'all' : targetGender;
    if (genderFilterLocked && targetGender !== 'all') setTargetGender('all');
    api.profiles({ plan, targetGender: appliedTarget, userId: user.id }).then((payload) => {
      setProfiles(payload.profiles || []);
      setIndex(0);
    }).catch(() => showToast('候補の取得に失敗しました'));
  }, [isAuthed, plan, targetGender, genderFilterLocked]);

  useEffect(() => { if (!user) return; api.reports().then((p) => setReports(p.reports || [])).catch(() => null); }, [user]);

  useEffect(() => {
    if (!user) return;
    refreshMatches();
    refreshDmThreads();
    refreshReceivedLikes();
  }, [user]);

  useEffect(() => {
    if (!user) {
      notificationBooted.current = false;
      lastNotificationCount.current = 0;
      return;
    }
    const timer = setInterval(() => {
      refreshReceivedLikes();
      refreshDmThreads();
      refreshMatches();
    }, 15000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!notificationBooted.current) {
      notificationBooted.current = true;
      lastNotificationCount.current = notificationCount;
      return;
    }
    if (notificationCount > lastNotificationCount.current) showToast('新しい通知があります');
    lastNotificationCount.current = notificationCount;
  }, [notificationCount, user]);

  useEffect(() => {
    if (activeTab === 'dm') refreshDmThreads();
  }, [activeTab]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', Boolean(authMode || profileEditorOpen));
    return () => document.body.classList.remove('modal-open');
  }, [authMode, profileEditorOpen]);

  useEffect(() => {
    function isInputTarget(el) {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    }
    function blockClipboard(e) {
      // コピーは全面許可（Riot ID や DM 本文を相手とやり取りできるようにするため）。
      // 入力欄・[data-copyable] 配下以外でのカット/ペーストのみ抑止する。
      if (isInputTarget(e.target)) return;
      if (e.target?.closest?.('[data-copyable]')) return;
      e.preventDefault();
    }
    document.addEventListener('cut', blockClipboard);
    document.addEventListener('paste', blockClipboard);
    return () => {
      document.removeEventListener('cut', blockClipboard);
      document.removeEventListener('paste', blockClipboard);
    };
  }, []);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }

  function showAuth(mode = 'login') {
    if (mode === 'register') setPendingFirebaseUser(null);
    setAuthMode(mode);
    setView('site');
  }

  function openProfileEditor() {
    if (!user) return;
    setEditForm({
      name: user.name || '',
      gender: user.gender || '',
      riotId: user.riotId || '',
      age: user.age || '',
      region: user.region || '',
      profilePhoto: user.profilePhoto || '',
      rank: user.rank || 'Gold 1',
      role: roles.includes(user.role) ? user.role : defaultRole,
      tags: Array.isArray(user.tags) ? user.tags : [],
      agents: Array.isArray(user.agents) ? user.agents : [],
      xHandle: user.xHandle || '',
      bio: user.bio || '',
      voiceIntro: user.voiceIntro || '',
      agreed: true,
    });
    setProfileEditorOpen(true);
  }

  async function saveProfileEdit(event) {
    event.preventDefault();
    if (!user) return;
    if (!editForm.gender) return showToast('性別選択は必須です');
    if (!editForm.name || !editForm.riotId) return showToast('表示名とRiot IDを入力してください');
    if (!editForm.age || !editForm.region) return showToast('年齢と地域を入力してください');
    try {
      const payload = await api.updateProfile({ ...editForm, userId: user.id });
      setUser(payload.user);
      setProfileEditorOpen(false);
      showToast('プロフィールを更新しました');
    } catch (e) {
      showToast(e.message || 'プロフィール更新に失敗しました');
    }
  }

  async function logout() {
    const mods = await getFirebaseMods().catch(() => null);
    if (mods?.firebaseAuth) await mods.signOut(mods.firebaseAuth).catch(() => null);
    setUser(null);
    setAuthMode(null);
    setProfileEditorOpen(false);
    setPendingFirebaseUser(null);
    setMatches([]);
    setDmThreads([]);
    setActiveThreadId('');
    setView('site');
    showToast('ログアウトしました');
  }

  function openApp(tab = 'match') {
    if (authBooting) { showToast('ログイン状態を確認中です'); return; }
    if (!user) { showToast('ログインしてください'); showAuth('login'); return; }
    setActiveTab(tab);
    setView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setPendingUser(uid, email) { setPendingFirebaseUser({ uid, email }); }

  async function advanceToProfileSetup(uid, email, message) {
    setPendingUser(uid, email);
    setAuthMode('profileSetup');
    showToast(message);
  }

  async function advanceToEmailVerification(firebaseUser, message) {
    setPendingUser(firebaseUser.uid, firebaseUser.email);
    setAuthMode('emailVerification');
    setView('site');
    showToast(message);
  }

  async function openEmailVerificationFromLegacyCodeError(firebaseUser) {
    const mods = await getFirebaseMods().catch(() => null);
    if (!firebaseUser) {
      showAuth('login');
      showToast('Firebaseのメール認証が必要です。先にログインしてください');
      return;
    }
    await firebaseUser.reload().catch(() => null);
    const curFbUser = mods?.firebaseAuth?.currentUser || firebaseUser;
    setPendingUser(curFbUser.uid, curFbUser.email);
    setAuthMode('emailVerification');
    setView('site');
    if (!curFbUser.emailVerified) {
      await mods?.sendEmailVerification(curFbUser).catch(() => null);
      showToast('認証コードではなく、Firebaseの確認メールを送信しました');
    } else {
      showToast('認証コードは不要です。ページを更新してもう一度ログインしてください');
    }
  }

  async function resendVerificationEmail() {
    const mods = await getFirebaseMods().catch(() => null);
    const firebaseUser = mods?.firebaseAuth?.currentUser;
    if (!firebaseUser) return showToast('先にメールアドレスを登録してください');
    try {
      await mods.sendEmailVerification(firebaseUser);
      showToast('確認メールを再送信しました');
    } catch (e) { showToast(authErrorMessage(e)); }
  }

  async function confirmEmailVerified() {
    const mods = await getFirebaseMods().catch(() => null);
    const firebaseUser = mods?.firebaseAuth?.currentUser;
    if (!firebaseUser) return showToast('先にメールアドレスを登録してください');
    try {
      await firebaseUser.reload();
      if (!mods.firebaseAuth.currentUser?.emailVerified) {
        showToast('メール確認がまだ完了していません。メール内のリンクを開いてからもう一度押してください');
        return;
      }
      if (await loadSavedProfile(mods.firebaseAuth.currentUser, '保存済みプロフィールでログインしました')) return;
      await advanceToProfileSetup(mods.firebaseAuth.currentUser.uid, mods.firebaseAuth.currentUser.email, 'メール認証が完了しました。プロフィールを設定してください');
    } catch (e) { showToast(authErrorMessage(e)); }
  }

  async function createAccount(event) {
    event.preventDefault();
    const mods = await getFirebaseMods().catch(() => null);
    if (!mods?.firebaseReady || !mods?.firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email || form.password.length < 6) return showToast('メールアドレスと6文字以上のパスワードを入力してください');
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) return showToast('確認用メールアドレスが一致していません');
    try {
      const credential = await mods.createUserWithEmailAndPassword(mods.firebaseAuth, form.email, form.password);
      await mods.sendEmailVerification(credential.user);
      await advanceToEmailVerification(credential.user, '確認メールを送信しました。メール認証後に次へ進めます');
    } catch (e) {
      if (e?.code === 'auth/email-already-in-use') {
        try {
          const credential = await mods.signInWithEmailAndPassword(mods.firebaseAuth, form.email, form.password);
          if (!credential.user.emailVerified) {
            await mods.sendEmailVerification(credential.user);
            await advanceToEmailVerification(credential.user, '確認メールを送信しました。メール認証後に次へ進めます');
          } else {
            if (await loadSavedProfile(credential.user, '保存済みプロフィールでログインしました')) return;
            await advanceToProfileSetup(credential.user.uid, credential.user.email, 'メール確認済みです。プロフィールを設定してください');
          }
          return;
        } catch (retryError) {
          showToast(retryError?.code === 'auth/invalid-credential'
            ? 'このメールはFirebaseにあります。パスワードを忘れたから再設定してください。'
            : authErrorMessage(retryError));
          return;
        }
      }
      showToast(authErrorMessage(e));
    }
  }

  async function register(event) {
    event.preventDefault();
    const mods = await getFirebaseMods().catch(() => null);
    if (!mods?.firebaseReady || !mods?.firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!pendingFirebaseUser) return showToast('先にメールアドレスを登録してください');
    const firebaseUser = mods.firebaseAuth.currentUser;
    if (!firebaseUser?.emailVerified) return showToast('プロフィール作成前にメール認証を完了してください');
    if (!form.gender) return showToast('性別選択は必須です');
    if (!form.name || !form.riotId) return showToast('表示名とRiot IDを入力してください');
    if (!form.age || !form.region) return showToast('年齢と地域を入力してください');
    if (!form.agreed) return showToast('利用規約への同意が必要です');
    try {
      const idToken = await firebaseUser.getIdToken(true);
      const payload = await api.register({ ...form, idToken });
      setPendingFirebaseUser(null);
      completeAuth(payload.user, 'アカウント作成とログインが完了しました');
    } catch (e) { showToast(e.message || 'プロフィール作成に失敗しました'); }
  }

  function completeAuth(nextUser, message) {
    setUser(nextUser);
    setPlan(nextUser.plan || 'FREE');
    setPendingFirebaseUser(null);
    setAuthMode(null);
    setActiveTab('match');
    setView('app');
    if (message) showToast(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadSavedProfile(firebaseUser, message = '') {
    try {
      const idToken = await firebaseUser.getIdToken(true);
      const payload = await api.login({ idToken });
      completeAuth(payload.user, message);
      return true;
    } catch (error) {
      if (error?.message?.includes('Pairlyプロフィール')) return false;
      throw error;
    }
  }

  async function loginWithFirebase() {
    const mods = await getFirebaseMods().catch(() => null);
    if (!mods?.firebaseReady || !mods?.firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email || !form.password) return showToast('メールアドレスとパスワードを入力してください');
    try {
      const credential = await mods.signInWithEmailAndPassword(mods.firebaseAuth, form.email, form.password);
      if (!credential.user.emailVerified) {
        await advanceToEmailVerification(credential.user, 'メール認証が必要です。メール内のリンクを確認してください');
        return;
      }
      try {
        const restored = await loadSavedProfile(credential.user, 'ログインしました');
        if (!restored) await advanceToProfileSetup(credential.user.uid, credential.user.email, 'プロフィールを設定してください');
      } catch (profileError) {
        if (profileError?.message?.includes('Pairlyプロフィール')) {
          if (!credential.user.emailVerified) {
            await mods.sendEmailVerification(credential.user);
            await advanceToEmailVerification(credential.user, '確認メールを送信しました。メール認証後にプロフィール設定へ進めます');
          } else {
            await advanceToProfileSetup(credential.user.uid, credential.user.email, 'プロフィールを設定してください');
          }
          return;
        }
        if (profileError?.message?.includes('認証コード')) {
          await openEmailVerificationFromLegacyCodeError(credential.user);
          return;
        }
        showToast(profileError.message || 'ログインに失敗しました');
      }
    } catch (e) {
      if (authErrorMessage(e).includes('認証コード')) {
        const mods2 = await getFirebaseMods().catch(() => null);
        await openEmailVerificationFromLegacyCodeError(mods2?.firebaseAuth?.currentUser);
        return;
      }
      showToast(authErrorMessage(e));
    }
  }

  async function continueWithGoogle() {
    const mods = await getFirebaseMods().catch(() => null);
    if (!mods?.firebaseReady || !mods?.firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    const googleProvider = new mods.GoogleAuthProvider();
    try {
      const credential = await mods.signInWithPopup(mods.firebaseAuth, googleProvider);
      if (!credential.user.emailVerified) {
        await advanceToEmailVerification(credential.user, 'Googleアカウントのメール確認が必要です。メール内のリンクを確認してください');
        return;
      }
      try {
        const restored = await loadSavedProfile(credential.user, 'Googleでログインしました');
        if (!restored) {
          setPendingUser(credential.user.uid, credential.user.email);
          setForm((cur) => ({ ...cur, email: credential.user.email || cur.email }));
          setAuthMode('profileSetup');
          showToast('Googleアカウントで認証しました。プロフィールを設定してください');
        }
      } catch (profileError) {
        if (profileError?.message?.includes('Pairlyプロフィール')) {
          setPendingUser(credential.user.uid, credential.user.email);
          setForm((cur) => ({ ...cur, email: credential.user.email || cur.email }));
          setAuthMode('profileSetup');
          showToast('Googleアカウントで認証しました。プロフィールを設定してください');
          return;
        }
        showToast(profileError.message || 'Googleログインに失敗しました');
      }
    } catch (e) { showToast(authErrorMessage(e)); }
  }

  async function resetPassword() {
    const mods = await getFirebaseMods().catch(() => null);
    if (!mods?.firebaseReady || !mods?.firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email) return showToast('再設定メールを送るメールアドレスを入力してください');
    try {
      await mods.sendPasswordResetEmail(mods.firebaseAuth, form.email);
      showToast('パスワード再設定メールを送信しました');
    } catch (e) { showToast(authErrorMessage(e)); }
  }

  async function refreshMatches() {
    if (!user) return;
    const payload = await api.matches(user.id).catch(() => ({ matches: [] }));
    setMatches(payload.matches || []);
  }

  async function refreshReceivedLikes() {
    if (!user) return;
    const payload = await api.receivedLikes(user.id).catch(() => ({ receivedLikes: [] }));
    setReceivedLikes(payload.receivedLikes || []);
  }

  async function acceptLike(receivedLikeId) {
    if (!user) return;
    try {
      const payload = await api.acceptLike({ userId: user.id, receivedLikeId });
      setReceivedLikes((list) => list.filter((r) => r.id !== receivedLikeId));
      setStats((s) => ({ ...s, matches: s.matches + 1 }));
      showToast('いいねを返しました。マッチ成立、DMできます');
      await refreshMatches();
      await refreshDmThreads(payload.match?.id);
      setActiveTab('dm');
    } catch (e) { showToast(e.message); }
  }

  async function refreshDmThreads(selectMatchId) {
    if (!user) return;
    const payload = await api.dmThreads(user.id).catch(() => ({ threads: [] }));
    const threads = payload.threads || [];
    setDmThreads(threads);
    setActiveThreadId((curId) => {
      if (selectMatchId && threads.some((t) => t.match.id === selectMatchId)) return selectMatchId;
      if (curId && threads.some((t) => t.match.id === curId)) return curId;
      return threads[0]?.match.id || '';
    });
  }

  async function markDmRead(matchId) {
    if (!user || !matchId) return;
    const readAt = new Date().toISOString();
    setDmThreads((threads) => threads.map((thread) => (
      thread.match.id === matchId
        ? {
          ...thread,
          unreadCount: 0,
          messages: thread.messages.map((m) => m.sender !== 'user' && !m.readAt ? { ...m, readAt } : m),
        }
        : thread
    )));
    await api.markDmRead({ userId: user.id, matchId }).catch(() => null);
  }

  function selectDmThread(matchId) { setActiveThreadId(matchId); }

  function track(profile, action) {
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    setFootprints((list) => [{ name: profile.name, action, time, rank: profile.rank, gender: profile.gender }, ...list].slice(0, 20));
  }

  function nextCard() {
    // 末尾を超えたら index が profiles.length に達し、current が undefined になって
    // 「候補がなくなりました」が表示される。剰余で巻き戻すと既にいいね/見送り済みの
    // 相手が無限ループで再表示されてしまうため使わない。
    setIndex((i) => i + 1);
  }

  async function swipe(type) {
    if (!isAuthed) return openApp('match');
    if (!current) return;
    if (type === 'pass') {
      setStats((s) => ({ ...s, passes: s.passes + 1 }));
      track(current, '見送り');
      nextCard();
      return;
    }
    try {
      const payload = await api.like({ userId: user.id, profileId: current.id, type, plan });
      const label = type === 'super' ? 'スーパーいいね' : type === 'dual' ? '両いいね' : 'いいね';
      if (payload.already_matched) {
        showToast(`${current.name}さんとはすでにマッチ済みです`);
        await refreshMatches();
        await refreshDmThreads(payload.match?.id);
        nextCard();
        return;
      }
      if (payload.already_liked && !payload.matched) {
        showToast(`${current.name}さんにはすでにいいね済みです`);
        nextCard();
        return;
      }
      if (!payload.already_liked) {
        setStats((s) => ({
          ...s,
          super: type === 'super' ? s.super + 1 : s.super,
          dual: type === 'dual' && plan !== 'VIP' ? Math.max(0, s.dual - 1) : s.dual,
        }));
        track(current, label);
      }
      if (payload.matched) {
        // 相互いいね成立 → その場でマッチ。両者の会話が同期される。
        showToast(`${current.name}さんとマッチしました！メッセージを送れます`);
        setStats((s) => ({ ...s, matches: s.matches + 1 }));
        await refreshMatches();
        await refreshDmThreads(payload.match?.id);
        nextCard();
        return;
      }
      if (payload.pending_sent) {
        showToast(`${current.name}さんにいいねを送りました。相手からも返るとマッチします`);
      } else {
        showToast(`${label}しました`);
      }
      nextCard();
    } catch (e) { showToast(e.message); }
  }

  async function sendDm(event) {
    event.preventDefault();
    if (dmSending) return;
    const body = dmDraft.trim();
    if (!body) return;
    const matchId = activeThreadId;
    if (!matchId) return showToast('先にメッセージ相手を選択してください');
    try {
      setDmSending(true);
      const payload = await api.sendDm({ userId: user.id, matchId, body });
      const sentMessage = payload.message || {
        id: `local_${Date.now()}`,
        matchId,
        sender: 'user',
        body,
        createdAt: new Date().toISOString(),
        readAt: null,
      };
      setDmDraft('');
      setDmThreads((threads) => threads
        .map((thread) => thread.match.id === matchId
          ? { ...thread, messages: [...thread.messages, { ...sentMessage, sender: 'user' }], updatedAt: sentMessage.createdAt }
          : thread)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)));
      refreshDmThreads(matchId);
    } catch (e) {
      showToast(e.message);
    } finally {
      setDmSending(false);
    }
  }

  async function reportCurrent() {
    if (!isAuthed) return openApp('match');
    if (!current) return;
    await api.report({ userId: user.id, profileId: current.id, reason: '迷惑行為/不適切なプロフィール' }).catch(() => null);
    const payload = await api.reports().catch(() => ({ reports: [] }));
    setReports(payload.reports || []);
    showToast('通報を受け付けました');
  }

  async function blockCurrent() {
    if (!isAuthed) return openApp('match');
    if (!current) return;
    await api.block({ userId: user.id, profileId: current.id }).catch(() => null);
    showToast(`${current.name}をブロックしました`);
    nextCard();
  }

  async function reportProfile(profileId, profileName = '相手') {
    if (!isAuthed || !profileId) return;
    await api.report({ userId: user.id, profileId, reason: 'DMでの迷惑行為/不適切な内容' }).catch(() => null);
    const payload = await api.reports().catch(() => ({ reports: [] }));
    setReports(payload.reports || []);
    showToast(`${profileName}さんを通報しました`);
  }

  async function blockProfile(profileId, profileName = '相手') {
    if (!isAuthed || !profileId) return;
    await api.block({ userId: user.id, profileId }).catch(() => null);
    // 楽観的に該当スレッドを除去。activeThreadId の再選択は refreshDmThreads に任せる
    // （内部で現在の選択が消えていれば先頭スレッドへ寄せる）。
    setDmThreads((threads) => threads.filter((t) => t.match.profileId !== profileId));
    await refreshDmThreads();
    showToast(`${profileName}さんをブロックしました`);
  }

  async function buyPlan(nextPlan) {
    if (!isAuthed) { showToast('ログインしてください'); showAuth('login'); return; }
    setPlan(nextPlan);
    setUser((u) => ({ ...u, plan: nextPlan }));
    await api.purchase({ userId: user.id, plan: nextPlan }).catch(() => null);
    showToast(`${planLabel(nextPlan)} に切り替えました（デモ）`);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shared = useMemo(() => ({
    user, isAuthed, activeTab, setActiveTab, tabs: appTabs, current, plan, setPlan, activePlan,
    plansData, pricingTab, setPricingTab, buyPlan, targetGender, setTargetGender, genderFilterLocked,
    swipe, reportCurrent, blockCurrent, reportProfile, blockProfile, stats, matches, receivedLikes,
    acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, setActiveThreadId,
    selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, footprints, reports,
    profiles, index, form, setForm, openApp, openProfileEditor, logout,
  }), [user, isAuthed, activeTab, current, plan, activePlan, plansData, pricingTab, buyPlan,
    targetGender, genderFilterLocked, swipe, stats, matches, receivedLikes, acceptLike, dmThreads,
    unreadDmCount, notificationCount, activeThreadId, dmDraft, dmSending, footprints, reports,
    profiles, index, form, openApp, openProfileEditor, logout]);

  // 認証フォームの表示条件
  const showAuthForms = (isAuthed && profileEditorOpen) || (!isAuthed && Boolean(authMode));

  return (
    <>
      <div className="toast" role="status" aria-live="polite" aria-atomic="true" aria-relevant="text" hidden={!toast}>{toast}</div>

      {/* 認証モーダル群（遅延読み込み） */}
      {showAuthForms && (
        <Suspense fallback={null}>
          <LazyAuthForms
            isAuthed={isAuthed}
            profileEditorOpen={profileEditorOpen}
            setProfileEditorOpen={setProfileEditorOpen}
            user={user}
            editForm={editForm}
            setEditForm={setEditForm}
            saveProfileEdit={saveProfileEdit}
            showToast={showToast}
            authMode={authMode}
            setAuthMode={setAuthMode}
            showAuth={showAuth}
            form={form}
            setForm={setForm}
            pendingFirebaseUser={pendingFirebaseUser}
            createAccount={createAccount}
            register={register}
            continueWithGoogle={continueWithGoogle}
            loginWithFirebase={loginWithFirebase}
            resendVerificationEmail={resendVerificationEmail}
            confirmEmailVerified={confirmEmailVerified}
            resetPassword={resetPassword}
          />
        </Suspense>
      )}

      {/* メインビュー切り替え */}
      {view === 'app' && user ? (
        // ─ アプリ画面（遅延読み込み） ─────────────────────────────────
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: 'var(--bg-primary, #f7f5f2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: 48, height: 48, border: '3px solid #e0d8cf', borderTopColor: '#b8a99a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ color: '#b8a99a', fontSize: '0.875rem' }}>読み込み中...</span>
            </div>
          </div>
        }>
          <LazyAppDashboard {...shared} onBackSite={() => setView('site')} />
        </Suspense>
      ) : (
        // ─ ランディングページ ──────────────────────────────────────────
        <>
          <SiteHeader
            isAuthed={isAuthed}
            user={user}
            plan={plan}
            notificationCount={notificationCount}
            onAuth={() => showAuth('entry')}
            onOpenApp={() => openApp('match')}
            openProfileEditor={openProfileEditor}
            logout={logout}
            onGoApp={() => { openApp('match'); }}
            onGoNotifications={() => { openApp('notifications'); }}
          />
          <main>
            <Hero onSignup={() => showAuth('register')} onOpenApp={() => openApp('match')} />
            {isAuthed && <ReturnToAppCard user={user} openApp={openApp} />}
            <PublicPricing plansData={plansData} pricingTab={pricingTab} setPricingTab={setPricingTab} onSignup={() => showAuth('register')} buyPlan={buyPlan} />
            <Safety />
          </main>
          <Footer />
        </>
      )}
    </>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────
function MockIcon({ role }) {
  const colors = { duelist: '#ff4655', initiator: '#6aaeaa', controller: '#6d7fd6', sentinel: '#e8b66b' };
  const abbr = { duelist: 'D', initiator: 'I', controller: 'C', sentinel: 'S' };
  const color = colors[role] || '#b8a99a';
  return (
    <div style={{ width: 52, height: 52, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>
      {abbr[role] || 'P'}
    </div>
  );
}

function Hero({ onSignup, onOpenApp }) {
  const mockProfiles = [
    { name: 'Akari', role: 'duelist', rank: 'Diamond 2', tag: '恋人探し', gender: '女性', age: '21' },
    { name: 'Ryota', role: 'controller', rank: 'Platinum 1', tag: 'ランクガチ', gender: '男性', age: '24' },
    { name: 'Sora', role: 'initiator', rank: 'Gold 3', tag: 'まずはデュオ', gender: 'その他/未設定', age: '20' },
  ];
  return (
    <section className="hero" id="top">
      <div className="hero-content">
        <div className="eyebrow">VALORANT専用のマッチングサービス</div>
        <h1>VALORANTで<br />本当に合う相方を<br />見つけよう</h1>
        <p className="hero-sub">ランク・ロール・プレイスタイルで<br />相性の高い相方・フレンドが見つかる</p>
        <div className="hero-cta">
          <button id="hero-signup-btn" className="primary large" onClick={onSignup}>無料で始める</button>
          <button id="hero-app-btn" className="secondary large" onClick={onOpenApp}>マッチングを見る</button>
        </div>
      </div>
      <div className="hero-cards" aria-hidden="true">
        {mockProfiles.map((p, i) => (
          <div key={p.name} className={cx('mock-card', i === 1 && 'featured')}>
            <MockIcon role={p.role} />
            <div>
              <b>{p.name}</b>
              <span>{p.rank} · {p.gender} {p.age}歳</span>
              <em>{p.tag}</em>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── ReturnToAppCard ───────────────────────────────────────────────────
function ReturnToAppCard({ user, openApp }) {
  return (
    <section className="return-to-app">
      <p>{user.name}さん、おかえりなさい！</p>
      <button className="primary" onClick={() => openApp('match')}>マッチングへ戻る</button>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="footer">
      <img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" />
      <p>使用した時点で利用規約に同意したものとみなします。PairlyはRiot Games公式サービスではありません。</p>
    </footer>
  );
}

// ── アプリ起動 ─────────────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(<App />);
