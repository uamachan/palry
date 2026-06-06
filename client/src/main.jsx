import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import AppDashboard from './AppDashboard.jsx';
import AuthFormsContainer from './AuthForms.jsx';
import PublicPricing from './Pricing.jsx';
import Safety from './Safety.jsx';
import SiteHeader from './SiteHeader.jsx';
import { appTabs, defaultRole, planLabel, roles } from './constants.jsx';
import './styles.css';

let firebaseModsPromise = null;
function getFirebaseMods() {
  if (!firebaseModsPromise) {
    firebaseModsPromise = Promise.all([
      import('firebase/auth'),
      import('./firebase.js'),
    ]).then(([auth, firebase]) => ({
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
      firebaseAuth: firebase.firebaseAuth,
      firebaseReady: firebase.firebaseReady,
    }));
  }
  return firebaseModsPromise;
}

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

function App() {
  const [user, setUser] = useState(null);
  const [authBooting, setAuthBooting] = useState(true);
  const [view, setView] = useState('site');
  const [authMode, setAuthMode] = useState(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState(null);
  const [profileSetupPrompt, setProfileSetupPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState('match');
  const [pricingTab, setPricingTab] = useState('monthly');
  const [plansData, setPlansData] = useState({ plans: {}, singleItems: [] });
  const [entitlements, setEntitlements] = useState({ genderFilter: false, boost: false, spotlight: false, superCredits: 0 });
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
  // プラン特典 or 単発購入（性別フィルター7日）でフィルター解放。
  const genderFilterLocked = !activePlan?.genderFilter && !entitlements.genderFilter;
  const unreadDmCount = useMemo(() => dmThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0), [dmThreads]);
  const notificationCount = receivedLikes.length + unreadDmCount;

  useEffect(() => { api.plans().then(setPlansData).catch(() => showToast('料金データの取得に失敗しました')); }, []);

  useEffect(() => {
    let canceled = false;
    let unsubscribe = () => {};

    getFirebaseMods()
      .then(({ firebaseReady, firebaseAuth, setPersistence, browserLocalPersistence, onAuthStateChanged }) => {
        if (canceled) return;
        if (!firebaseReady || !firebaseAuth) {
          setAuthBooting(false);
          return;
        }

        setPersistence(firebaseAuth, browserLocalPersistence).catch(() => null).finally(() => {
          if (canceled) return;
          unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
            if (!firebaseUser) {
              setUser(null);
              setPendingFirebaseUser(null);
              setProfileSetupPrompt(false);
              setAuthBooting(false);
              return;
            }

            setForm((currentForm) => ({ ...currentForm, email: firebaseUser.email || currentForm.email }));
            await firebaseUser.reload().catch(() => null);
            const currentFirebaseUser = firebaseAuth.currentUser || firebaseUser;

            if (!currentFirebaseUser.emailVerified) {
              setPendingUser(currentFirebaseUser.uid, currentFirebaseUser.email);
              setAuthMode('emailVerification');
              setView('site');
              setAuthBooting(false);
              return;
            }

            try {
              const restored = await loadSavedProfile(currentFirebaseUser);
              if (!restored) {
                setPendingUser(currentFirebaseUser.uid, currentFirebaseUser.email);
                setAuthMode(null);
                setProfileSetupPrompt(true);
                setView('site');
              }
            } catch (error) {
              if (error?.message?.includes('Pairlyプロフィール')) {
                setPendingUser(currentFirebaseUser.uid, currentFirebaseUser.email);
                setAuthMode(null);
                setProfileSetupPrompt(true);
                setView('site');
              } else {
                setUser(null);
                setProfileSetupPrompt(false);
              }
            } finally {
              setAuthBooting(false);
            }
          });
        });
      })
      .catch(() => setAuthBooting(false));

    return () => {
      canceled = true;
      unsubscribe();
    };
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
    refreshEntitlements();
  }, [user]);

  useEffect(() => {
    if (!user) {
      notificationBooted.current = false;
      lastNotificationCount.current = 0;
      return;
    }
    // ログイン直後は初回ロードが落ち着くまでトースト判定を抑制する。
    // （既存の未読DM/受信いいねを「新着」と誤検知して
    //  「新しい通知があります」が毎回出るのを防ぐ）
    notificationBooted.current = false;
    const settle = setTimeout(() => { notificationBooted.current = true; }, 3000);
    const timer = setInterval(() => {
      refreshReceivedLikes();
      refreshDmThreads();
      refreshMatches();
    }, 15000);
    return () => { clearTimeout(settle); clearInterval(timer); };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (!notificationBooted.current) {
      // 初回ロード中は基準値だけ更新し、トーストは出さない。
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
    if (mode !== 'profileSetup') setProfileSetupPrompt(false);
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
      agreed: true
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
      setProfileSetupPrompt(false);
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
    setProfileSetupPrompt(false);
    setMatches([]);
    setDmThreads([]);
    setActiveThreadId('');
    setView('site');
    showToast('ログアウトしました');
  }

  function openApp(tab = 'match') {
    if (authBooting) {
      showToast('ログイン状態を確認中です');
      return;
    }
    if (!user) {
      showToast('ログインしてください');
      showAuth('login');
      return;
    }
    setActiveTab(tab);
    setView('app');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function setPendingUser(uid, email) {
    setPendingFirebaseUser({ uid, email });
  }

  async function advanceToProfileSetup(uid, email, message) {
    setPendingUser(uid, email);
    setProfileSetupPrompt(false);
    setAuthMode('profileSetup');
    showToast(message);
  }

  async function advanceToEmailVerification(firebaseUser, message) {
    setPendingUser(firebaseUser.uid, firebaseUser.email);
    setProfileSetupPrompt(false);
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
    const currentFirebaseUser = mods?.firebaseAuth?.currentUser || firebaseUser;
    setPendingUser(currentFirebaseUser.uid, currentFirebaseUser.email);
    setAuthMode('emailVerification');
    setView('site');
    if (!currentFirebaseUser.emailVerified) {
      await mods?.sendEmailVerification?.(currentFirebaseUser).catch(() => null);
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
    } catch (e) {
      showToast(authErrorMessage(e));
    }
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
    } catch (e) {
      showToast(authErrorMessage(e));
    }
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
      setProfileSetupPrompt(false);
      completeAuth(payload.user, 'アカウント作成とログインが完了しました');
    } catch (e) { showToast(e.message || 'プロフィール作成に失敗しました'); }
  }

  function completeAuth(nextUser, message) {
    setUser(nextUser);
    setPlan(nextUser.plan || 'FREE');
    setPendingFirebaseUser(null);
    setProfileSetupPrompt(false);
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
        await openEmailVerificationFromLegacyCodeError(mods.firebaseAuth?.currentUser);
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
          setForm((current) => ({ ...current, email: credential.user.email || current.email }));
          setProfileSetupPrompt(false);
          setAuthMode('profileSetup');
          showToast('Googleアカウントで認証しました。プロフィールを設定してください');
        }
      } catch (profileError) {
        if (profileError?.message?.includes('Pairlyプロフィール')) {
          setPendingUser(credential.user.uid, credential.user.email);
          setForm((current) => ({ ...current, email: credential.user.email || current.email }));
          setProfileSetupPrompt(false);
          setAuthMode('profileSetup');
          showToast('Googleアカウントで認証しました。プロフィールを設定してください');
          return;
        }
        showToast(profileError.message || 'Googleログインに失敗しました');
      }
    } catch (e) {
      showToast(authErrorMessage(e));
    }
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

  async function refreshEntitlements() {
    if (!user) return;
    const payload = await api.entitlements(user.id).catch(() => null);
    if (payload?.entitlements) setEntitlements(payload.entitlements);
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
    setActiveThreadId((currentId) => {
      if (selectMatchId && threads.some((thread) => thread.match.id === selectMatchId)) return selectMatchId;
      if (currentId && threads.some((thread) => thread.match.id === currentId)) return currentId;
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
          messages: thread.messages.map((message) => message.sender !== 'user' && !message.readAt ? { ...message, readAt } : message)
        }
        : thread
    )));
    await api.markDmRead({ userId: user.id, matchId }).catch(() => null);
  }

  function selectDmThread(matchId) {
    setActiveThreadId(matchId);
  }

  function track(profile, action) {
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    setFootprints((list) => [{ name: profile.name, action, time, rank: profile.rank, gender: profile.gender }, ...list].slice(0, 20));
  }

  function nextCard() {
    setIndex((i) => (profiles.length ? (i + 1) % profiles.length : 0));
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
        readAt: null
      };
      setDmDraft('');
      setDmThreads((threads) => threads
        .map((thread) => thread.match.id === matchId
          ? {
            ...thread,
            messages: [...thread.messages, { ...sentMessage, sender: 'user' }],
            updatedAt: sentMessage.createdAt
          }
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
    setDmThreads((threads) => threads.filter((thread) => thread.match.profileId !== profileId));
    await refreshDmThreads();
    showToast(`${profileName}さんをブロックしました`);
  }

  async function buyPlan(nextPlan) {
    if (!isAuthed) {
      showToast('ログインしてください');
      showAuth('login');
      return;
    }
    const prevPlan = plan;
    // 楽観的に切替。失敗時は元のプランへ戻す。
    setPlan(nextPlan);
    setUser((u) => ({ ...u, plan: nextPlan }));
    try {
      const payload = await api.purchase({ userId: user.id, plan: nextPlan });
      const confirmedPlan = payload?.purchase?.plan || payload?.plan || nextPlan;
      setPlan(confirmedPlan);
      setUser((u) => ({ ...u, plan: confirmedPlan }));
      showToast(`${planLabel(confirmedPlan)} に切り替えました（デモ）`);
    } catch (e) {
      setPlan(prevPlan);
      setUser((u) => ({ ...u, plan: prevPlan }));
      showToast(e.message || 'プラン変更に失敗しました');
    }
  }

  async function buyItem(itemName) {
    if (!isAuthed) {
      showToast('ログインしてください');
      showAuth('login');
      return;
    }
    try {
      const payload = await api.purchaseItem({ item: itemName });
      if (payload?.entitlements) setEntitlements(payload.entitlements);
      showToast(`「${itemName}」を購入しました（デモ）`);
    } catch (e) {
      showToast(e.message || '購入に失敗しました');
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shared = useMemo(() => ({ user, isAuthed, activeTab, setActiveTab, tabs: appTabs, current, plan, setPlan, activePlan, plansData, entitlements, pricingTab, setPricingTab, buyPlan, buyItem, targetGender, setTargetGender, genderFilterLocked, swipe, reportCurrent, blockCurrent, reportProfile, blockProfile, stats, matches, receivedLikes, acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, setActiveThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, footprints, reports, profiles, index, form, setForm, openApp, openProfileEditor, logout }), [user, isAuthed, activeTab, current, plan, activePlan, plansData, entitlements, pricingTab, buyPlan, buyItem, targetGender, genderFilterLocked, swipe, stats, matches, receivedLikes, acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, dmDraft, dmSending, footprints, reports, profiles, index, form, openApp, openProfileEditor, logout]);

  return <>
    <div className="toast" role="status" aria-live="polite" aria-atomic="true" aria-relevant="text" hidden={!toast}>{toast}</div>
    <AuthFormsContainer
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
    {view === 'app' && user ? <AppDashboard {...shared} onBackSite={() => setView('site')} /> : <>
      <SiteHeader isAuthed={isAuthed} user={user} plan={plan} notificationCount={notificationCount} onAuth={() => showAuth('entry')} onOpenApp={() => openApp('match')} openProfileEditor={openProfileEditor} logout={logout} onGoApp={() => { openApp('match'); }} onGoNotifications={() => { openApp('notifications'); }} />
      <main className="site-page">
        <Hero onSignup={() => showAuth('register')} onOpenApp={() => openApp('match')} />
        {profileSetupPrompt && pendingFirebaseUser && <PendingProfileSetupCard email={pendingFirebaseUser.email} onOpen={() => advanceToProfileSetup(pendingFirebaseUser.uid, pendingFirebaseUser.email, 'プロフィールを設定してください')} />}
        {isAuthed && <ReturnToAppCard user={user} openApp={openApp} />}
        <PublicPricing plansData={plansData} pricingTab={pricingTab} setPricingTab={setPricingTab} onSignup={() => showAuth('register')} buyPlan={buyPlan} buyItem={buyItem} />
        <Safety />
      </main>
      <Footer />
    </>}
  </>;
}

function Hero({ onSignup, onOpenApp }) {
  const actions = [
    { label: '登録', icon: 'user', onClick: onSignup },
    { label: 'アプリを開く', icon: 'open', onClick: onOpenApp },
    { label: 'マッチ', icon: 'heart', onClick: onOpenApp }
  ];
  return <section id="top" className="hero section">
    <div className="hero-copy">
      <span className="eyebrow">VALORANT 相方・パーティー募集</span>
      <h1><span>ゲームから始まる、</span><span>ふたりのマッチング。</span></h1>
      <p>Pairlyは、プロフィール登録とマッチング画面を分けたゲーム恋人マッチングです。登録後は同じサイト内の専用画面で、いいね・メッセージ・足あとが使えます。</p>
      <div className="hero-actions"><button className="primary" onClick={onSignup}>アカウント作成して始める</button><button className="secondary" onClick={onOpenApp}>マッチング画面を開く</button></div>
      <p className="notice-line">※ マッチング画面はアカウント作成後に表示。別ブラウザタブではなく、同じサイト内で切り替わります。</p>
    </div>
    <div className="hero-card">
      <div className="browser-bar"><i></i><i></i><i></i><span>pairly.gg/app</span></div>
      <div className="mock-card"><div className="mock-photo">P</div><div><b>専用マッチング画面</b><span>登録後にいいね / 見送り / メッセージを解放</span></div></div>
      <div className="mock-row">
        {actions.map((action) => <button key={action.label} type="button" onClick={action.onClick} aria-label={action.label}>
          <MockIcon name={action.icon} />
          <span>{action.label}</span>
        </button>)}
      </div>
    </div>
  </section>;
}

function MockIcon({ name }) {
  if (name === 'user') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.2a4.3 4.3 0 1 0-4.3-4.3 4.3 4.3 0 0 0 4.3 4.3Zm0 2c-4 0-7.2 2.2-7.2 5v.6h14.4v-.6c0-2.8-3.2-5-7.2-5Z" /></svg>;
  if (name === 'open') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5.5h7v2h-5v9h9v-5h2v7h-13v-13Zm9.1-.2h4.1v4.1h-2V8.7l-5.4 5.4-1.4-1.4 5.4-5.4h-.7v-2Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.7 4.8 14C2.8 12.1 2.6 9 4.3 7a4.7 4.7 0 0 1 6.8-.2l.9.9.9-.9a4.7 4.7 0 0 1 6.8.2c1.7 2 1.5 5.1-.5 7L12 20.7Z" /></svg>;
}

function ReturnToAppCard({ user, openApp }) {
  return <section className="section"><div className="return-card"><div><span className="eyebrow">ログイン中</span><h2>{user.name}さん、マッチング画面を開けます</h2><p>公開サイトとは分けた専用アプリ画面で、いいね・メッセージ・足あと・プロフィール管理を使えます。</p></div><button className="primary" onClick={() => openApp('match')}>マッチング画面を開く</button></div></section>;
}

function PendingProfileSetupCard({ email, onOpen }) {
  return <section className="section pending-profile-section">
    <div className="return-card pending-profile-card">
      <div>
        <span className="eyebrow">PROFILE</span>
        <h2>プロフィール設定を完了してください</h2>
        <p>{email} の認証は完了しています。プロフィールを作成すると、このFirebaseアカウントに保存され、次回ログイン時も引き継がれます。</p>
      </div>
      <button className="primary" type="button" onClick={onOpen}>プロフィール設定を開く</button>
    </div>
  </section>;
}

function Footer() { return <footer className="footer"><img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" width="110" height="37" loading="lazy" decoding="async" /><p>使用した時点で利用規約に同意したものとみなします。PairlyはRiot Games公式サービスではありません。</p></footer>; }

createRoot(document.getElementById('root')).render(<App />);
