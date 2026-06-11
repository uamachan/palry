import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './api.js';
import PublicPricing from './Pricing.jsx';

const LazyAppDashboard = lazy(() => import('./AppDashboard.jsx'));
const LazyAuthForms = lazy(() => import('./AuthForms.jsx'));
import Safety from './Safety.jsx';
import SiteHeader from './SiteHeader.jsx';
import { appTabs, defaultRole, planLabel } from './constants.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { initAnalytics, track, shouldAskConsent, setConsent } from './analytics.js';
import { DEV_TOKEN, DEV_EMAIL, DEV_UID, isDevSession, startDevSession, endDevSession } from './dev-auth.js';
import { initMonitoring } from './monitoring.js';
import { NotFound } from './ui/primitives.jsx';
import './dm-submit-guard.js';
import './ui/tokens.css';
import './styles.css';
import './profile-setup.css';
import './profile-validation.css';
import './design-polish.css';
import './matching-icons.css';
import './profile-visual.css';
import './golden-ratio.css';
import './mobile-fixes.css';

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

function initialForm() {
  return { email: '', emailConfirm: '', password: '', name: '', riotId: '', age: '', gender: '', region: '', profilePhoto: '', rank: 'Gold 1', role: defaultRole, tags: [], agents: [], xHandle: '', bio: '', voiceIntro: '', agreed: false, vc: '', maps: [], favoriteWeapon: '' };
}

function publicUserToForm(user) {
  return {
    ...initialForm(),
    ...user,
    tags: user?.tags || [],
    agents: user?.agents || [],
    maps: user?.maps || [],
    vc: user?.vc || '',
    favoriteWeapon: user?.favoriteWeapon || '',
    agreed: true,
  };
}

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  if (code.includes('email-already-in-use')) return 'このメールアドレスは登録済みです';
  if (code.includes('invalid-email')) return 'メールアドレスの形式が正しくありません';
  if (code.includes('weak-password')) return 'パスワードは6文字以上にしてください';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) return 'メールアドレスまたはパスワードが違います';
  if (code.includes('popup-closed-by-user')) return 'Googleログインがキャンセルされました';
  if (code.includes('popup-blocked')) return 'ポップアップがブロックされています';
  if (code.includes('too-many-requests')) return '試行回数が多すぎます。しばらくしてからお試しください';
  if (code.includes('network-request-failed')) return 'ネットワークエラーです。接続を確認してください';
  return error?.message || '認証に失敗しました';
}

function App() {
  const [authMode, setAuthMode] = useState(null);
  const [view, setView] = useState('site');
  const [form, setForm] = useState(initialForm());
  const [user, setUser] = useState(null);
  const [plan, setPlan] = useState('FREE');
  const [toast, setToast] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [index, setIndex] = useState(0);
  const [matches, setMatches] = useState([]);
  const [receivedLikes, setReceivedLikes] = useState([]);
  const [dmThreads, setDmThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [dmDraft, setDmDraft] = useState('');
  const [dmSending, setDmSending] = useState(false);
  const [footprints, setFootprints] = useState([]);
  const [reports, setReports] = useState([]);
  const [flaggedUsers, setFlaggedUsers] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [profilesLoading] = useState(false);
  const [dmLoading, setDmLoading] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('match');
  const [plansData, setPlansData] = useState(null);
  const [pricingTab, setPricingTab] = useState('plans');
  const [activePlan, setActivePlan] = useState('FREE');
  const [entitlements, setEntitlements] = useState({ genderFilter: false, rankFilter: false, boost: false, spotlight: false, superCredits: 0 });
  const [targetGender, setTargetGender] = useState('all');
  const [targetRank, setTargetRank] = useState('all');
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [editForm, setEditForm] = useState(initialForm());
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState(null);
  const [profileSetupPrompt, setProfileSetupPrompt] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [pendingScrollId, setPendingScrollId] = useState(null);
  const [askConsent, setAskConsent] = useState(false);
  // 開発者モードの可否。ローカル(npm run dev)は既定ON、デプロイ環境はサーバの /api/config に追従。
  const [devLoginAllowed, setDevLoginAllowed] = useState(Boolean(import.meta.env.DEV));
  // ルーティング未導入のため、ルート('/')以外の URL は存在しないページとして 404 を出す。
  const [isUnknownRoute] = useState(() => typeof window !== 'undefined' && window.location.pathname !== '/');

  const toastTimerRef = useRef(null);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  }

  useEffect(() => {
    api.plans().then(setPlansData).catch(() => null);
    // サーバの開発者モード可否を取得。無効なら残存セッションを掃除する。
    api.config().then((cfg) => {
      const allowed = Boolean(cfg?.devLogin) || Boolean(import.meta.env.DEV);
      setDevLoginAllowed(allowed);
      if (!allowed) endDevSession();
    }).catch(() => null);
    getFirebaseMods().then(({ onAuthStateChanged, firebaseAuth, firebaseReady }) => {
      firebaseReady.catch(() => null).finally(() => {
        onAuthStateChanged(firebaseAuth, async (fbUser) => {
          setAuthReady(true);
          if (!fbUser) return;
          if (!fbUser.emailVerified) {
            setPendingFirebaseUser({ uid: fbUser.uid, email: fbUser.email, emailVerified: false });
            return;
          }
          try {
            const idToken = await fbUser.getIdToken();
            const payload = await api.login({ idToken });
            completeAuth(payload.user, '保存済みプロフィールでログインしました');
          } catch (error) {
            if (error?.httpStatus === 404) {
              setPendingFirebaseUser({ uid: fbUser.uid, email: fbUser.email, emailVerified: true });
              setProfileSetupPrompt(true);
            }
          }
        });
      });
    }).catch(() => setAuthReady(true));
  }, []);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  useEffect(() => {
    initMonitoring();
    initAnalytics();
    setAskConsent(shouldAskConsent());
  }, []);

  function decideConsent(value) {
    setConsent(value);
    setAskConsent(false);
  }

  useLayoutEffect(() => {
    if (view === 'site' && pendingScrollId) {
      const el = document.getElementById(pendingScrollId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollId(null);
    }
  }, [view, pendingScrollId]);

  function completeAuth(nextUser, message) {
    setUser(nextUser);
    const nextPlan = nextUser.plan || 'FREE';
    setPlan(nextPlan);
    setActivePlan(nextPlan);
    setEntitlements({
      genderFilter: nextPlan === 'PLUS' || nextPlan === 'VIP',
      rankFilter: nextPlan === 'PLUS' || nextPlan === 'VIP',
      boost: false,
      spotlight: nextPlan === 'VIP',
      superCredits: nextPlan === 'VIP' ? 999 : 0,
    });
    setAuthMode(null);
    setProfileSetupPrompt(false);
    setPendingFirebaseUser(null);
    setView('app');
    if (message) showToast(message);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function showAuth(mode = 'entry') {
    setForm(initialForm());
    setAuthMode(mode);
  }

  async function createAccount(e) {
    e.preventDefault();
    if (!form.email || !form.emailConfirm || !form.password) return showToast('メールアドレスとパスワードを入力してください');
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) return showToast('メールアドレスが一致しません');
    if (form.password.length < 6) return showToast('パスワードは6文字以上です');
    try {
      const { createUserWithEmailAndPassword, sendEmailVerification, firebaseAuth } = await getFirebaseMods();
      const credential = await createUserWithEmailAndPassword(firebaseAuth, form.email.trim(), form.password);
      await sendEmailVerification(credential.user);
      setPendingFirebaseUser({ uid: credential.user.uid, email: credential.user.email, emailVerified: false });
      setAuthMode('emailVerification');
      showToast('確認メールを送信しました');
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  }

  async function resendVerificationEmail() {
    try {
      const { sendEmailVerification, firebaseAuth } = await getFirebaseMods();
      if (!firebaseAuth.currentUser) return showToast('もう一度登録またはログインしてください');
      await sendEmailVerification(firebaseAuth.currentUser);
      showToast('確認メールを再送信しました');
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  }

  async function confirmEmailVerified() {
    try {
      const { firebaseAuth } = await getFirebaseMods();
      if (!firebaseAuth.currentUser) return showToast('もう一度ログインしてください');
      await firebaseAuth.currentUser.reload();
      const current = firebaseAuth.currentUser;
      if (!current.emailVerified) return showToast('まだメール認証が完了していません');
      advanceToProfileSetup(current.uid, current.email, 'メール認証が完了しました。プロフィールを設定してください');
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  }

  function advanceToProfileSetup(uid, email, message) {
    setPendingFirebaseUser({ uid, email, emailVerified: true });
    setForm((f) => ({ ...initialForm(), email: email || f.email, emailConfirm: email || f.emailConfirm, agreed: false }));
    setProfileSetupPrompt(false);
    setAuthMode('profileSetup');
    if (message) showToast(message);
  }

  // 開発者モード: Firebaseログイン/メール認証を飛ばして直接プロフィール作成画面へ。
  function startDevMode() {
    if (!devLoginAllowed) return;
    startDevSession();
    setPendingFirebaseUser({ uid: DEV_UID, email: DEV_EMAIL, emailVerified: true });
    setForm((f) => ({ ...initialForm(), email: DEV_EMAIL, emailConfirm: DEV_EMAIL, agreed: false }));
    setProfileSetupPrompt(false);
    setAuthMode('profileSetup');
    showToast('開発者モード: ログインをスキップしました');
  }

  async function loginWithFirebase(e) {
    e.preventDefault();
    try {
      const { signInWithEmailAndPassword, firebaseAuth } = await getFirebaseMods();
      const credential = await signInWithEmailAndPassword(firebaseAuth, form.email.trim(), form.password);
      if (!credential.user.emailVerified) {
        setPendingFirebaseUser({ uid: credential.user.uid, email: credential.user.email, emailVerified: false });
        setAuthMode('emailVerification');
        return showToast('メール認証を完了してください');
      }
      const idToken = await credential.user.getIdToken();
      const payload = await api.login({ idToken });
      completeAuth(payload.user, 'ログインしました');
    } catch (error) {
      if (error?.httpStatus === 404) {
        const { firebaseAuth } = await getFirebaseMods();
        const current = firebaseAuth.currentUser;
        setPendingFirebaseUser({ uid: current.uid, email: current.email, emailVerified: true });
        setForm((f) => ({ ...initialForm(), email: current.email || f.email, emailConfirm: current.email || f.emailConfirm }));
        setProfileSetupPrompt(false);
        setAuthMode('profileSetup');
        return showToast('プロフィールを作成してください');
      }
      showToast(firebaseErrorMessage(error));
    }
  }

  async function continueWithGoogle() {
    try {
      const { signInWithPopup, GoogleAuthProvider, firebaseAuth } = await getFirebaseMods();
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(firebaseAuth, provider);
      const idToken = await credential.user.getIdToken();
      try {
        const payload = await api.login({ idToken });
        completeAuth(payload.user, 'Googleでログインしました');
      } catch (error) {
        // 404（Pairlyプロフィール未作成）の時だけプロフィール設定へ進む。
        // それ以外（サーバーエラー等）は誤って新規作成フローに入れずエラー表示する。
        if (error?.httpStatus === 404) {
          setPendingFirebaseUser({ uid: credential.user.uid, email: credential.user.email, emailVerified: true });
          setForm((f) => ({ ...initialForm(), email: credential.user.email || f.email, emailConfirm: credential.user.email || f.emailConfirm }));
          setAuthMode('profileSetup');
        } else {
          showToast(error.message || 'ログインに失敗しました。しばらくしてからお試しください');
        }
      }
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  }

  async function resetPassword() {
    const email = form.email.trim();
    if (!email) return showToast('メールアドレスを入力してください');
    try {
      const { sendPasswordResetEmail, firebaseAuth } = await getFirebaseMods();
      await sendPasswordResetEmail(firebaseAuth, email);
    } catch (error) {
      // user-not-found を区別して表示するとアカウントの存在有無が漏れる（enumeration）。
      // 形式不正など利用者が直せるエラーだけ通知し、それ以外は成功と同じ中立メッセージにする。
      const code = error?.code || '';
      if (code.includes('invalid-email')) return showToast('メールアドレスの形式が正しくありません');
      if (code.includes('too-many-requests')) return showToast('試行回数が多すぎます。しばらくしてからお試しください');
    }
    showToast('登録済みのメールアドレスであれば、再設定メールを送信しました');
  }

  async function register(e) {
    e.preventDefault();
    try {
      // 開発者モードは Firebase を介さず、固定の開発トークンでプロフィールを作成する。
      if (isDevSession()) {
        const { password, emailConfirm, ...profileData } = form;
        const payload = await api.register({ ...profileData, idToken: DEV_TOKEN, email: DEV_EMAIL });
        track('sign_up', { method: 'dev' });
        completeAuth(payload.user, payload.message || '開発者モードでプロフィールを作成しました');
        return;
      }
      const { firebaseAuth } = await getFirebaseMods();
      const current = firebaseAuth.currentUser;
      if (!current) return showToast('Firebaseログインが必要です');
      if (!current.emailVerified) return showToast('メール認証を完了してください');
      const idToken = await current.getIdToken();
      // パスワードは Firebase が保持しており、バックエンドは使用しない。
      // 不要な秘密情報を送らないようプロフィール項目だけ送信する。
      const { password, emailConfirm, ...profileData } = form;
      const payload = await api.register({ ...profileData, idToken, email: current.email });
      track('sign_up', { method: 'email' });
      completeAuth(payload.user, payload.message || 'アカウントを作成しました');
    } catch (error) {
      showToast(error.message || '登録に失敗しました');
    }
  }

  async function saveProfileEdit(e) {
    e.preventDefault();
    try {
      const payload = await api.updateProfile(editForm);
      setUser(payload.user);
      setPlan(payload.user.plan || plan);
      setProfileEditorOpen(false);
      showToast('プロフィールを保存しました');
    } catch (error) {
      showToast(error.message || 'プロフィール保存に失敗しました');
    }
  }

  function openProfileEditor() {
    if (!user) return;
    setEditForm(publicUserToForm(user));
    setProfileEditorOpen(true);
  }

  async function logout() {
    endDevSession();
    const { signOut, firebaseAuth } = await getFirebaseMods();
    await signOut(firebaseAuth).catch(() => null);
    setUser(null);
    setPlan('FREE');
    setActivePlan('FREE');
    setView('site');
    setActiveTab('match');
    setMatches([]);
    setReceivedLikes([]);
    setDmThreads([]);
    setActiveThreadId(null);
    setProfiles([]);
    setIndex(0);
    setFootprints([]);
    setReports([]);
    setFlaggedUsers([]);
    setAuditLog([]);
    setProfileEditorOpen(false);
    setPendingFirebaseUser(null);
    setEntitlements({ genderFilter: false, rankFilter: false, boost: false, spotlight: false, superCredits: 0 });
    showToast('ログアウトしました');
  }

  function openApp(tab = 'match') {
    if (!user) {
      showToast(authReady ? 'アカウント作成またはログインが必要です' : 'ログイン状態を確認中です');
      showAuth('entry');
      return;
    }
    setActiveTab(tab);
    setView('app');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  const filterLocked = !plansData?.plans?.[plan]?.rankFilter && !entitlements.rankFilter;

  async function refreshProfiles() {
    if (!user) return;
    try {
      const payload = await api.profiles({ plan, targetGender, targetRank, userId: user.id });
      setProfiles(payload.profiles || []);
      setIndex(0);
    } catch (error) {
      showToast(error.message || 'プロフィール取得に失敗しました');
    }
  }

  async function refreshMatches() {
    if (!user) return;
    const payload = await api.matches(user.id).catch(() => ({ matches: [] }));
    setMatches(payload.matches || []);
  }

  async function refreshReceivedLikes() {
    if (!user) return;
    setLikesLoading(true);
    const payload = await api.receivedLikes().catch(() => ({ receivedLikes: [] }));
    setReceivedLikes(payload.receivedLikes || []);
    setLikesLoading(false);
  }

  async function refreshFootprints() {
    if (!user) return;
    const payload = await api.footprints().catch(() => ({ footprints: [] }));
    setFootprints(payload.footprints || []);
  }

  async function refreshDmThreads(preferredThreadId = activeThreadId) {
    if (!user) return;
    setDmLoading(true);
    const payload = await api.dmThreads(user.id).catch(() => ({ threads: [] }));
    setDmLoading(false);
    const nextThreads = payload.threads || [];
    setDmThreads(nextThreads);
    setActiveThreadId((currentId) => {
      const desired = preferredThreadId || currentId;
      if (desired && nextThreads.some((thread) => thread.match.id === desired)) return desired;
      return nextThreads[0]?.match.id || null;
    });
  }

  useEffect(() => { if (user) refreshProfiles(); }, [user?.id, plan, targetGender, targetRank, entitlements.rankFilter]);

  // 候補カードが尽きたら自動で再取得（新規登録ユーザーをリアルタイムに反映）。
  const deckEmpty = Boolean(user) && index >= profiles.length;
  useEffect(() => {
    if (!deckEmpty) return;
    const id = setTimeout(() => refreshProfiles(), 4000);
    return () => clearTimeout(id);
  }, [deckEmpty]);
  useEffect(() => { if (user) { refreshMatches(); refreshReceivedLikes(); refreshDmThreads(); refreshFootprints(); } }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const refreshNotifications = () => {
      if (cancelled || document.hidden) return;
      refreshReceivedLikes();
      refreshDmThreads();
    };
    const intervalId = window.setInterval(refreshNotifications, 15000);
    const handleFocus = () => refreshNotifications();
    const handleVisibility = () => { if (!document.hidden) refreshNotifications(); };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    api.entitlements(user.id).then((payload) => setEntitlements(payload.entitlements || entitlements)).catch(() => null);
  }, [user?.id]);
  useEffect(() => {
    if (!activeThreadId || !user) return;
    return api.subscribeDmThread(activeThreadId, user.id, (messages) => {
      setDmThreads((threads) => threads.map((t) =>
        t.match.id === activeThreadId ? { ...t, messages } : t
      ));
    });
  }, [activeThreadId, user?.id]);
  useEffect(() => {
    if (activeTab === 'admin' && user?.isAdmin) {
      api.reports().then((p) => {
        setReports(p.reports || []);
        setFlaggedUsers(p.flaggedUsers || []);
      }).catch(() => null);
      api.adminAudit().then((p) => setAuditLog(p.audit || [])).catch(() => null);
    }
  }, [activeTab, user?.id, user?.isAdmin]);

  async function unhideUser(profileId) {
    if (!user?.isAdmin || !profileId) return;
    try {
      await api.adminUnhide({ profileId });
      const p = await api.reports();
      setReports(p.reports || []);
      setFlaggedUsers(p.flaggedUsers || []);
      showToast('自動非表示を解除しました');
    } catch (error) {
      showToast(error.message || '解除に失敗しました');
    }
  }

  const current = profiles[index] || null;
  const stats = useMemo(() => ({ likes: receivedLikes.length, matches: matches.length, footprints: footprints.length }), [receivedLikes.length, matches.length, footprints.length]);
  const unreadDmCount = useMemo(() => dmThreads.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0), [dmThreads]);
  const notificationCount = receivedLikes.length + unreadDmCount;
  const isAuthed = Boolean(user);

  function nextCard() { setIndex((i) => Math.min(i + 1, profiles.length)); }

  async function swipe(type) {
    if (!current || !user) return;
    const directionLabel = type === 'pass' ? '見送り' : type === 'super' ? 'SUPER LIKE' : type === 'dual' ? '両LIKE' : 'LIKE';
    if (type === 'pass') {
      setFootprints((f) => [{ id: `local_${Date.now()}`, name: current.name, rank: current.rank, gender: current.gender, action: '見送り', time: '今' }, ...f].slice(0, 50));
      api.recordFootprint({ profileId: current.id, action: '見送り' }).catch(() => null);
      nextCard();
      return;
    }
    try {
      const payload = await api.like({ userId: user.id, profileId: current.id, type, plan, targetGender });
      if (payload.entitlements) setEntitlements(payload.entitlements);
      if (payload.match) {
        setMatches((m) => [payload.match, ...m]);
        track('match', { source: 'swipe' });
        showToast(`${current.name}さんとマッチしました！`);
        await refreshMatches();
        await refreshDmThreads(payload.match.id);
      } else if (payload.receivedLike || payload.pending_sent) {
        showToast(`${directionLabel} を送りました。相手の通知に表示されます。`);
      } else {
        showToast(`${directionLabel} しました`);
      }
      setFootprints((f) => [{ id: `local_${Date.now()}`, name: current.name, rank: current.rank, gender: current.gender, action: directionLabel, time: '今' }, ...f].slice(0, 50));
      api.recordFootprint({ profileId: current.id, action: directionLabel }).catch(() => null);
      nextCard();
    } catch (error) {
      showToast(error.message || '操作に失敗しました');
    }
  }

  async function acceptLike(receivedLikeId) {
    if (!user) return;
    try {
      const payload = await api.acceptLike({ userId: user.id, receivedLikeId });
      if (payload.match) {
        setMatches((m) => [payload.match, ...m]);
        track('match', { source: 'accept_like' });
        await refreshMatches();
        await refreshDmThreads(payload.match.id);
        setActiveTab('dm');
        showToast('マッチしました！DMを開始できます');
      }
      await refreshReceivedLikes();
    } catch (error) {
      showToast(error.message || 'いいね返しに失敗しました');
    }
  }

  async function markDmRead(matchId) {
    if (!matchId) return;
    try {
      await api.markDmRead({ matchId });
      setDmThreads((threads) => threads.map((thread) => thread.match.id === matchId ? {
        ...thread,
        unreadCount: 0,
        messages: thread.messages.map((message) => message.sender !== 'user' ? { ...message, readAt: message.readAt || new Date().toISOString() } : message)
      } : thread));
    } catch { /* ignore */ }
  }

  function selectDmThread(matchId) {
    setActiveThreadId(matchId);
    setActiveTab('dm');
  }

  async function sendDm(e) {
    e.preventDefault();
    if (dmSending) return;
    const body = dmDraft.trim();
    if (!activeThreadId || !body) return;
    setDmSending(true);
    try {
      const payload = await api.sendDm({ matchId: activeThreadId, body });
      // payload.message が不正な場合は早期にエラーを投げ、undefinedをmessagesに追加しない
      if (!payload?.message?.id) {
        throw new Error('送信結果が不正です。もう一度お試しください。');
      }
      setDmDraft('');
      setDmThreads((threads) => threads.map((thread) => {
        if (thread.match.id !== activeThreadId) return thread;
        const alreadyExists = thread.messages.some((message) => message.id === payload.message.id);
        return {
          ...thread,
          messages: alreadyExists ? thread.messages : [...thread.messages, payload.message],
          updatedAt: payload.message.createdAt || thread.updatedAt,
        };
      }));
      track('dm_send');
      showToast('メッセージを送信しました');
    } catch (error) {
      showToast(error.message || '送信に失敗しました');
    } finally {
      setDmSending(false);
    }
  }

  async function blockCurrent() {
    if (!current) return;
    const blocked = current;
    nextCard();
    try {
      await api.block({ profileId: blocked.id });
      showToast(`${blocked.name}を非表示にしました`);
    } catch (error) {
      showToast(error.message || 'ブロックに失敗しました');
    }
  }

  function reportCurrent() {
    if (!current) return;
    const reported = current;
    nextCard();
    api.report({ profileId: reported.id, reason: 'プロフィールでの迷惑行為/不適切な内容' }).catch(() => null);
    showToast(`${reported.name}を通報しました`);
  }

  async function reportProfile(profileId, profileName = '相手') {
    if (!isAuthed || !profileId) return;
    try {
      await api.report({ profileId, reason: 'DMでの迷惑行為/不適切な内容' });
      showToast(`${profileName}さんを通報しました`);
    } catch (error) {
      showToast(error.message || '通報に失敗しました');
    }
  }

  async function blockProfile(profileId, profileName = '相手') {
    if (!isAuthed || !profileId) return;
    try {
      await api.block({ profileId });
      setDmThreads((threads) => threads.filter((thread) => thread.match.profileId !== profileId));
      await refreshDmThreads();
      showToast(`${profileName}さんをブロックしました`);
    } catch (error) {
      showToast(error.message || 'ブロックに失敗しました');
    }
  }

  async function buyPlan(nextPlan) {
    if (!isAuthed) {
      showToast('ログインしてください');
      showAuth('login');
      return;
    }
    const prevPlan = plan;
    setPlan(nextPlan);
    setUser((u) => ({ ...u, plan: nextPlan }));
    try {
      const payload = await api.purchase({ userId: user.id, plan: nextPlan });
      const confirmedPlan = payload?.purchase?.plan || payload?.plan || nextPlan;
      setPlan(confirmedPlan);
      setUser((u) => ({ ...u, plan: confirmedPlan }));
      setEntitlements({
        genderFilter: confirmedPlan === 'PLUS' || confirmedPlan === 'VIP',
        rankFilter: confirmedPlan === 'PLUS' || confirmedPlan === 'VIP',
        boost: false,
        spotlight: confirmedPlan === 'VIP',
        superCredits: confirmedPlan === 'VIP' ? 999 : 0,
      });
      track('purchase', { kind: 'plan', item: confirmedPlan });
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
      track('purchase', { kind: 'item', item: itemName });
      showToast(`「${itemName}」を購入しました（デモ）`);
    } catch (e) {
      showToast(e.message || '購入に失敗しました');
    }
  }

  const adminTab = { id: 'admin', label: '管理' };
  const visibleTabs = user?.isAdmin ? [...appTabs, adminTab] : appTabs;

  // 認証フォームの表示条件
  const showAuthForms = (isAuthed && profileEditorOpen) || (!isAuthed && Boolean(authMode));

  const shared = useMemo(() => ({ user, isAuthed, activeTab, setActiveTab, tabs: visibleTabs, current, plan, setPlan, activePlan, plansData, entitlements, pricingTab, setPricingTab, buyPlan, buyItem, targetGender, setTargetGender, targetRank, setTargetRank, filterLocked, swipe, reportCurrent, blockCurrent, reportProfile, blockProfile, stats, matches, receivedLikes, acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, setActiveThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, footprints, reports, flaggedUsers, unhideUser, auditLog, profilesLoading, dmLoading, likesLoading, profiles, index, form, setForm, openApp, openProfileEditor, logout, refreshProfiles }), [user, isAuthed, activeTab, visibleTabs, current, plan, activePlan, plansData, entitlements, pricingTab, targetGender, targetRank, filterLocked, stats, matches, receivedLikes, dmThreads, unreadDmCount, notificationCount, activeThreadId, dmDraft, dmSending, footprints, reports, flaggedUsers, auditLog, profilesLoading, dmLoading, likesLoading, profiles, index, form]);

  if (isUnknownRoute) return <NotFound />;

  return (
    <>
      <div className="toast" role="status" aria-live="polite" aria-atomic="true" aria-relevant="text" hidden={!toast}>{toast}</div>
      {askConsent && (
        <div className="ui-consent" role="dialog" aria-label="計測の同意">
          <p>サイト改善のため匿名のアクセス解析を利用します。同意いただける場合のみ計測します。</p>
          <div className="ui-consent-actions">
            <button type="button" className="secondary" onClick={() => decideConsent('denied')}>拒否</button>
            <button type="button" className="primary" onClick={() => decideConsent('granted')}>同意する</button>
          </div>
        </div>
      )}

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
            startDevMode={startDevMode}
            devEnabled={devLoginAllowed}
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
          <LazyAppDashboard {...shared} onBackSite={(sectionId) => { setView('site'); if (sectionId) setPendingScrollId(sectionId); }} />
        </Suspense>
      ) : (
        // ─ ランディングページ ──────────────────────────────────────────
        <>
          <SiteHeader isAuthed={isAuthed} user={user} plan={plan} notificationCount={notificationCount} onAuth={() => showAuth('entry')} onOpenApp={() => openApp('match')} openProfileEditor={openProfileEditor} logout={logout} onGoApp={() => { openApp('match'); }} onGoNotifications={() => { openApp('notifications'); }} />
          <main className="site-page">
            <Hero onSignup={() => showAuth('register')} onOpenApp={() => openApp('match')} />
            {profileSetupPrompt && pendingFirebaseUser && <PendingProfileSetupCard email={pendingFirebaseUser.email} onOpen={() => advanceToProfileSetup(pendingFirebaseUser.uid, pendingFirebaseUser.email, 'プロフィールを設定してください')} />}
            {isAuthed && <ReturnToAppCard user={user} openApp={openApp} />}
            <PublicPricing plansData={plansData} pricingTab={pricingTab} setPricingTab={setPricingTab} onSignup={() => showAuth('register')} buyPlan={buyPlan} buyItem={buyItem} />
            <Safety />
          </main>
          <Footer />
        </>
      )}
    </>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────
function MockIconRole({ role }) {
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

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
