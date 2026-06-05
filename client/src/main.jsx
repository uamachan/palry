import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { browserLocalPersistence, createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { api } from './api.js';
import { firebaseAuth, firebaseReady } from './firebase.js';
import './styles.css';

const ranks = [
  'Unranked',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant'
];
const roles = ['フレックス', 'デュエリスト', 'イニシエーター', 'センチネル', 'コントローラー'];
const agents = [
  'Astra', 'Breach', 'Brimstone', 'Chamber', 'Clove', 'Cypher',
  'Deadlock', 'Fade', 'Gekko', 'Harbor', 'Iso', 'Jett',
  'KAY/O', 'Killjoy', 'Miks', 'Neon', 'Omen', 'Phoenix',
  'Raze', 'Reyna', 'Sage', 'Skye', 'Sova', 'Tejo',
  'Veto', 'Viper', 'Vyse', 'Waylay', 'Yoru'
];
const regions = ['北海道', '東北', '関東', '中部', '関西', '中国・四国', '九州・沖縄', '海外'];
const intentTags = ['気軽に遊ぶ友達', 'ランクガチ', '恋人探し', 'まずはデュオ', '固定相方', 'VCで話したい', '聞き専OK', '初心者歓迎', '夜メイン', '休日メイン'];
const appTabs = [
  { id: 'match', label: 'マッチング', emoji: '🎯' },
  { id: 'dm', label: 'メッセージ', emoji: '💬' },
  { id: 'footprints', label: '足あと', emoji: '👣' },
];
const googleProvider = new GoogleAuthProvider();

function cx(...v) { return v.filter(Boolean).join(' '); }
function planLabel(name) {
  return name === 'FREE' ? '無料' : name === 'PLUS' ? 'プラス' : name === 'VIP' ? 'VIP' : name;
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
  const [footprints, setFootprints] = useState([]);
  const [reports, setReports] = useState([]);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const [form, setForm] = useState({ name: '', gender: '', riotId: '', email: '', emailConfirm: '', password: '', age: '', region: '', profilePhoto: '', rank: 'Gold 1', role: 'フレックス', tags: [], agents: [], xHandle: '', bio: '', agreed: false });
  const [editForm, setEditForm] = useState({ name: '', gender: '', riotId: '', age: '', region: '', profilePhoto: '', rank: 'Gold 1', role: 'フレックス', tags: [], agents: [], xHandle: '', bio: '', agreed: true });

  const isAuthed = Boolean(user);
  const current = profiles[index] || null;
  const activePlan = plansData.plans?.[plan] || null;
  const genderFilterLocked = !activePlan?.genderFilter;

  useEffect(() => { api.plans().then(setPlansData).catch(() => showToast('料金データの取得に失敗しました')); }, []);

  useEffect(() => {
    if (!firebaseReady || !firebaseAuth) {
      setAuthBooting(false);
      return;
    }

    let canceled = false;
    let unsubscribe = () => {};

    setPersistence(firebaseAuth, browserLocalPersistence).catch(() => null).finally(() => {
      if (canceled) return;
      unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setPendingFirebaseUser(null);
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
          const idToken = await currentFirebaseUser.getIdToken();
          const payload = await api.login({ idToken });
          setUser(payload.user);
          setPlan(payload.user.plan || 'FREE');
          setPendingFirebaseUser(null);
          setAuthMode(null);
          setView('app');
        } catch (error) {
          if (error?.message?.includes('Pairlyプロフィール')) {
            setPendingUser(currentFirebaseUser.uid, currentFirebaseUser.email);
            setAuthMode('profileSetup');
          } else {
            setUser(null);
          }
        } finally {
          setAuthBooting(false);
        }
      });
    });

    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthed) return;
    const appliedTarget = genderFilterLocked ? 'all' : targetGender;
    if (genderFilterLocked && targetGender !== 'all') setTargetGender('all');
    api.profiles({ plan, targetGender: appliedTarget }).then((payload) => {
      setProfiles(payload.profiles || []);
      setIndex(0);
    }).catch(() => showToast('候補の取得に失敗しました'));
  }, [isAuthed, plan, targetGender, genderFilterLocked]);

  useEffect(() => { api.reports().then((p) => setReports(p.reports || [])).catch(() => showToast('通報データの取得に失敗しました')); }, []);

  useEffect(() => {
    if (!user) return;
    refreshMatches();
    refreshDmThreads();
    refreshReceivedLikes();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'dm') refreshDmThreads();
  }, [activeTab]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', Boolean(authMode || profileEditorOpen));
    return () => document.body.classList.remove('modal-open');
  }, [authMode, profileEditorOpen]);

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
      role: user.role || 'フレックス',
      tags: Array.isArray(user.tags) ? user.tags : [],
      agents: Array.isArray(user.agents) ? user.agents : [],
      xHandle: user.xHandle || '',
      bio: user.bio || '',
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
      showToast('プロフィールを更新しました');
    } catch (e) {
      showToast(e.message || 'プロフィール更新に失敗しました');
    }
  }

  async function logout() {
    if (firebaseAuth) await signOut(firebaseAuth).catch(() => null);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setPendingUser(uid, email) {
    setPendingFirebaseUser({ uid, email });
  }

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
    if (!firebaseUser) {
      showAuth('login');
      showToast('Firebaseのメール認証が必要です。先にログインしてください');
      return;
    }
    await firebaseUser.reload().catch(() => null);
    const currentFirebaseUser = firebaseAuth.currentUser || firebaseUser;
    setPendingUser(currentFirebaseUser.uid, currentFirebaseUser.email);
    setAuthMode('emailVerification');
    setView('site');
    if (!currentFirebaseUser.emailVerified) {
      await sendEmailVerification(currentFirebaseUser).catch(() => null);
      showToast('認証コードではなく、Firebaseの確認メールを送信しました');
    } else {
      showToast('認証コードは不要です。ページを更新してもう一度ログインしてください');
    }
  }

  async function resendVerificationEmail() {
    const firebaseUser = firebaseAuth?.currentUser;
    if (!firebaseUser) return showToast('先にメールアドレスを登録してください');
    try {
      await sendEmailVerification(firebaseUser);
      showToast('確認メールを再送信しました');
    } catch (e) {
      showToast(authErrorMessage(e));
    }
  }

  async function confirmEmailVerified() {
    const firebaseUser = firebaseAuth?.currentUser;
    if (!firebaseUser) return showToast('先にメールアドレスを登録してください');
    try {
      await firebaseUser.reload();
      if (!firebaseAuth.currentUser?.emailVerified) {
        showToast('メール確認がまだ完了していません。メール内のリンクを開いてからもう一度押してください');
        return;
      }
      await advanceToProfileSetup(firebaseAuth.currentUser.uid, firebaseAuth.currentUser.email, 'メール認証が完了しました。プロフィールを設定してください');
    } catch (e) {
      showToast(authErrorMessage(e));
    }
  }

  async function createAccount(event) {
    event.preventDefault();
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email || form.password.length < 6) return showToast('メールアドレスと6文字以上のパスワードを入力してください');
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) return showToast('確認用メールアドレスが一致していません');
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, form.email, form.password);
      await sendEmailVerification(credential.user);
      await advanceToEmailVerification(credential.user, '確認メールを送信しました。メール認証後に次へ進めます');
    } catch (e) {
      if (e?.code === 'auth/email-already-in-use') {
        try {
          const credential = await signInWithEmailAndPassword(firebaseAuth, form.email, form.password);
          if (!credential.user.emailVerified) {
            await sendEmailVerification(credential.user);
            await advanceToEmailVerification(credential.user, '確認メールを送信しました。メール認証後に次へ進めます');
          } else {
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
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!pendingFirebaseUser) return showToast('先にメールアドレスを登録してください');
    const firebaseUser = firebaseAuth.currentUser;
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
    setAuthMode(null);
    setActiveTab('match');
    setView('app');
    showToast(message);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loginWithFirebase() {
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email || !form.password) return showToast('メールアドレスとパスワードを入力してください');
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, form.email, form.password);
      if (!credential.user.emailVerified) {
        await advanceToEmailVerification(credential.user, 'メール認証が必要です。メール内のリンクを確認してください');
        return;
      }
      try {
        const idToken = await credential.user.getIdToken(true);
        const payload = await api.login({ idToken });
        completeAuth(payload.user, 'ログインしました');
      } catch (profileError) {
        if (profileError?.message?.includes('Pairlyプロフィール')) {
          if (!credential.user.emailVerified) {
            await sendEmailVerification(credential.user);
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
        await openEmailVerificationFromLegacyCodeError(firebaseAuth?.currentUser);
        return;
      }
      showToast(authErrorMessage(e));
    }
  }

  async function continueWithGoogle() {
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    try {
      const credential = await signInWithPopup(firebaseAuth, googleProvider);
      if (!credential.user.emailVerified) {
        await advanceToEmailVerification(credential.user, 'Googleアカウントのメール確認が必要です。メール内のリンクを確認してください');
        return;
      }
      try {
        const idToken = await credential.user.getIdToken(true);
        const payload = await api.login({ idToken });
        completeAuth(payload.user, 'Googleでログインしました');
      } catch (profileError) {
        if (profileError?.message?.includes('Pairlyプロフィール')) {
          setPendingUser(credential.user.uid, credential.user.email);
          setForm((current) => ({ ...current, email: credential.user.email || current.email }));
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
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email) return showToast('再設定メールを送るメールアドレスを入力してください');
    try {
      await sendPasswordResetEmail(firebaseAuth, form.email);
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
      showToast('🎉 マッチしました！メッセージを送れます');
      await refreshMatches();
      await refreshDmThreads(payload.match?.id);
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
    markDmRead(matchId);
  }

  function track(profile, action) {
    const time = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    setFootprints((list) => [{ name: profile.name, action, time, rank: profile.rank, gender: profile.gender }, ...list].slice(0, 20));
  }

  function nextCard() { setIndex((i) => Math.min(i + 1, profiles.length)); }

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
      const label = type === 'super' ? 'スーパーいいね ⭐' : type === 'dual' ? '両いいね ⚡' : 'いいね 💖';
      setStats((s) => ({
        ...s,
        likes: type === 'like' ? s.likes + 1 : s.likes,
        super: type === 'super' ? s.super + 1 : s.super,
        dual: type === 'dual' && plan !== 'VIP' ? Math.max(0, s.dual - 1) : s.dual,
      }));
      track(current, label);
      if (payload.liked_back) {
        showToast(`💌 ${current.name}さんからいいねが届きました！承認するとマッチします`);
        await refreshReceivedLikes();
      } else {
        showToast(`${label}を送りました`);
      }
      nextCard();
    } catch (e) { showToast(e.message); }
  }

  async function sendDm(event) {
    event.preventDefault();
    const body = dmDraft.trim();
    if (!body) return;
    if (!activeThreadId) return showToast('先にメッセージ相手を選択してください');
    try {
      await api.sendDm({ userId: user.id, matchId: activeThreadId, body });
      setDmDraft('');
      await refreshDmThreads(activeThreadId);
      showToast('メッセージを送信しました');
    } catch (e) { showToast(e.message); }
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

  async function buyPlan(nextPlan) {
    if (!isAuthed) {
      showToast('ログインしてください');
      showAuth('login');
      return;
    }
    setPlan(nextPlan);
    setUser((u) => ({ ...u, plan: nextPlan }));
    await api.purchase({ userId: user.id, plan: nextPlan }).catch(() => null);
      showToast(`${planLabel(nextPlan)} に切り替えました（デモ）`);
  }

  const shared = { user, isAuthed, activeTab, setActiveTab, tabs: appTabs, current, plan, setPlan, activePlan, plansData, pricingTab, setPricingTab, buyPlan, targetGender, setTargetGender, genderFilterLocked, swipe, reportCurrent, blockCurrent, stats, matches, receivedLikes, acceptLike, dmThreads, activeThreadId, setActiveThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, footprints, reports, profiles, index, form, setForm, openApp, openProfileEditor, logout };

  return <>
    {toast && <div className="toast">{toast}</div>}
    {isAuthed && profileEditorOpen && <AuthModal onClose={() => setProfileEditorOpen(false)}>
      <ProfileEditSection form={editForm} setForm={setEditForm} user={user} onSubmit={saveProfileEdit} onCancel={() => setProfileEditorOpen(false)} />
    </AuthModal>}
    {!isAuthed && authMode && <AuthModal onClose={() => setAuthMode(null)} size={['register', 'login', 'emailVerification'].includes(authMode) ? 'narrow' : undefined}>
      {authMode === 'register' && <AccountSignupSection form={form} setForm={setForm} onSubmit={createAccount} onGoogle={continueWithGoogle} onShowLogin={() => showAuth('login')} />}
      {authMode === 'emailVerification' && <EmailVerificationSection pendingEmail={pendingFirebaseUser?.email} onCheck={confirmEmailVerified} onResend={resendVerificationEmail} onShowLogin={() => showAuth('login')} />}
      {authMode === 'profileSetup' && <SignupSection form={form} setForm={setForm} pendingEmail={pendingFirebaseUser?.email} onSubmit={register} onShowLogin={() => showAuth('login')} />}
      {authMode === 'login' && <LoginSection form={form} setForm={setForm} onLogin={loginWithFirebase} onGoogle={continueWithGoogle} onResetPassword={resetPassword} onShowRegister={() => showAuth('register')} />}
    </AuthModal>}
    {view === 'app' && user ? <AppDashboard {...shared} onBackSite={() => setView('site')} /> : <>
      <SiteHeader isAuthed={isAuthed} plan={plan} onSignup={() => showAuth('register')} onLogin={() => showAuth('login')} onOpenApp={() => openApp('match')} />
      <main>
        <Hero onSignup={() => showAuth('register')} onOpenApp={() => openApp('match')} />
        {isAuthed && <ReturnToAppCard user={user} openApp={openApp} />}
        <PublicPricing plansData={plansData} pricingTab={pricingTab} setPricingTab={setPricingTab} onSignup={() => showAuth('register')} buyPlan={buyPlan} />
        <Safety />
      </main>
      <Footer />
    </>}
  </>;
}

function SiteHeader({ isAuthed, plan, onSignup, onLogin, onOpenApp }) {
  return <header className="site-header">
    <a className="brand" href="#top"><img src="/assets/pairly-logo-wide.png" alt="Pairly" /></a>
    <nav className="site-nav">
      <button className="nav-button" onClick={onOpenApp}>マッチング</button><a href="#pricing">料金</a><a href="#safety">安全・規約</a>
    </nav>
    <div className="header-actions">
      {isAuthed ? <span className="plan-pill">{planLabel(plan)}</span> : <button className="plain" onClick={onLogin}>ログイン</button>}
      <button className="primary small" onClick={isAuthed ? onOpenApp : onSignup}>{isAuthed ? 'アプリを開く' : '無料登録'}</button>
    </div>
  </header>;
}

function AuthModal({ children, onClose, size }) {
  return <div className="auth-modal" role="dialog" aria-modal="true">
    <button className="auth-scrim" type="button" aria-label="閉じる" onClick={onClose}></button>
    <div className={cx('auth-modal-panel', size === 'narrow' && 'auth-modal-panel--narrow')}>
      <button className="auth-close" type="button" onClick={onClose}>×</button>
      {children}
    </div>
  </div>;
}

function Hero({ onSignup, onOpenApp }) {
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
      <div className="mock-row"><span>登録</span><span>アプリを開く</span><span>マッチ</span></div>
    </div>
  </section>;
}

function LoginSection({ form, setForm, onLogin, onGoogle, onResetPassword, onShowRegister }) {
  return <section className="email-signup-panel">
    <div className="email-signup-header">
      <span className="eyebrow">ログイン</span>
      <h2>ログイン</h2>
      <p>メールアドレスとパスワードでログインします。メール未確認の場合はFirebaseの確認メールが必要です。</p>
    </div>
    <form className="email-signup-form signup-card" autoComplete="on" onSubmit={(event) => { event.preventDefault(); onLogin(); }}>
      <label className="email-field-label">
        <span>メールアドレス</span>
        <input required id="login-email" name="email" type="email" autoComplete="username email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
      </label>
      <label className="email-field-label">
        <span>パスワード</span>
        <input required id="login-password" name="password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="6文字以上" />
      </label>
      <div className="email-signup-actions">
        <button type="submit" className="primary">ログイン</button>
        <button type="button" className="secondary google-button" onClick={onGoogle}>Googleでログイン</button>
        <button type="button" className="secondary" onClick={onShowRegister}>アカウント作成はこちら</button>
        <button type="button" className="plain reset-password-link" onClick={onResetPassword}>パスワードを忘れた方</button>
      </div>
    </form>
  </section>;
}

function AccountSignupSection({ form, setForm, onSubmit, onGoogle, onShowLogin }) {
  return <section className="email-signup-panel">
    <div className="email-signup-header">
      <span className="eyebrow">アカウント作成</span>
      <h2>メール登録</h2>
      <p>まずメールアドレスとパスワードを登録します。<br />登録後にプロフィール設定へ進みます。</p>
    </div>
    <form className="email-signup-form signup-card" autoComplete="on" onSubmit={onSubmit}>
      <label className="email-field-label">
        <span>メールアドレス</span>
        <input required id="signup-email" name="email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
      </label>
      <label className="email-field-label">
        <span>メールアドレス（確認）</span>
        <input required id="signup-email-confirm" name="emailConfirm" type="email" autoComplete="email" value={form.emailConfirm} onChange={(e) => setForm({ ...form, emailConfirm: e.target.value })} placeholder="もう一度入力してください" />
      </label>
      <label className="email-field-label">
        <span>パスワード</span>
        <input required id="signup-password" name="new-password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="6文字以上" />
      </label>
      <div className="email-signup-actions">
        <button type="submit" className="primary">次のステップへ</button>
        <button type="button" className="secondary google-button" onClick={onGoogle}>Googleで続ける</button>
        <button type="button" className="plain reset-password-link" onClick={onShowLogin}>すでにアカウントがある方はこちら</button>
      </div>
    </form>
  </section>;
}

function EmailVerificationSection({ pendingEmail, onCheck, onResend, onShowLogin }) {
  return <section className="email-signup-panel verification-panel">
    <div className="email-signup-header">
      <span className="eyebrow">メール認証</span>
      <h2>メールを確認してください</h2>
      <p>{pendingEmail || '登録メールアドレス'} にFirebaseの確認メールを送信しました。メール内のリンクを開くと、次のステップへ進めます。</p>
    </div>
    <div className="signup-card email-confirm-card">
      <div className="mail-check-icon">@</div>
      <div className="email-confirm-steps">
        <span>1. 受信メールの確認リンクを開く</span>
        <span>2. この画面に戻る</span>
        <span>3. 確認完了ボタンを押す</span>
      </div>
      <div className="email-signup-actions">
        <button type="button" className="primary" onClick={onCheck}>メール確認を完了した</button>
        <button type="button" className="secondary" onClick={onResend}>確認メールを再送信</button>
        <button type="button" className="plain reset-password-link" onClick={onShowLogin}>ログインに戻る</button>
      </div>
    </div>
  </section>;
}

function SignupSection({ form, setForm, pendingEmail, onSubmit, onShowLogin }) {
  return <section className="setup-profile-section"><div className="setup-title"><span>プロフィール設定</span><h2>プロフィール設定</h2>{pendingEmail && <p className="registered-email">登録メール: {pendingEmail}</p>}</div><SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onShowLogin} /></section>;
}

function ProfileEditSection({ form, setForm, user, onSubmit, onCancel }) {
  return <section className="setup-profile-section profile-edit-section">
    <div className="setup-title">
      <span>アカウント</span>
      <h2>プロフィール編集</h2>
      <p className="registered-email">ログイン中: {user.email || user.name}</p>
    </div>
    <SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onCancel} submitLabel="変更を保存" cancelLabel="キャンセル" showAgreement={false} />
  </section>;
}

function SignupForm({ form, setForm, onSubmit, onShowLogin, submitLabel = '無料でアカウント作成', cancelLabel = 'ログインに戻る', showAgreement = true }) {
  const toggleAgent = (agent) => setForm((f) => ({ ...f, agents: f.agents.includes(agent) ? f.agents.filter((a) => a !== agent) : [...f.agents, agent].slice(0, 5) }));
  const toggleTag = (tag) => setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((item) => item !== tag) : [...f.tags, tag].slice(0, 4) }));
  function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, profilePhoto: String(reader.result || '') }));
    reader.readAsDataURL(file);
  }
  return <form className="signup-card profile-setup-card" onSubmit={onSubmit}>
    <div className="setup-tabs"><span className="active">基本情報</span><span>ランク</span><span>プレイスタイル</span><span>自己紹介</span><span>規約</span></div>
    <div className="profile-setup-grid">
      <label className="photo-uploader">
        <span>プロフィール写真</span>
        <input type="file" accept="image/*" onChange={selectPhoto} />
        <div className="photo-preview">{form.profilePhoto ? <img src={form.profilePhoto} alt="" /> : <b>写真を追加</b>}</div>
      </label>
      <div className="setup-fields">
        <label>表示名<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="yamada" /></label>
        <label>性別<select required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">選択してください</option><option>女性</option><option>男性</option><option>その他/未設定</option></select></label>
        <label>RIOT ID<input required value={form.riotId} onChange={(e) => setForm({ ...form, riotId: e.target.value })} placeholder="name#JP1" /></label>
        <label>年齢<input required inputMode="numeric" maxLength="2" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="20" /></label>
        <label>地域<select required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="">選択してください</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
        <label>ランク<select value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })}>{ranks.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>メインロール<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>X<input value={form.xHandle} onChange={(e) => setForm({ ...form, xHandle: e.target.value })} placeholder="@pairly_user" /></label>
      </div>
      <fieldset className="span-all intent-fieldset"><legend>目的タグ（4つまで）</legend><div className="chip-list intent-chip-list">{intentTags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset>
      <fieldset className="span-all agent-fieldset"><legend>よく使うキャラクター（5体まで）</legend><div className="chip-list">{agents.map((agent) => <button type="button" key={agent} className={form.agents.includes(agent) ? 'selected' : ''} onClick={() => toggleAgent(agent)}>{agent}</button>)}</div></fieldset>
      <label className="span-all setup-bio">自己紹介<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="プレイ時間、VC、雰囲気、NGなことなど" /></label>
      {showAgreement && <label className="check span-all"><input type="checkbox" checked={form.agreed} onChange={(e) => setForm({ ...form, agreed: e.target.checked })} />本サービスを閲覧・登録・ログイン・いいね・マッチング・メッセージ・通報・課金・外部SNS連携などで使用した時点で利用規約に同意したものとみなします。登録時にも規約へ同意します。</label>}
    </div>
    <div className="form-actions"><button className="primary" type="submit">{submitLabel}</button><button type="button" className="secondary" onClick={onShowLogin}>{cancelLabel}</button></div>
  </form>;
}

function ReturnToAppCard({ user, openApp }) {
  return <section className="section"><div className="return-card"><div><span className="eyebrow">ログイン中</span><h2>{user.name}さん、マッチング画面を開けます</h2><p>公開サイトとは分けた専用アプリ画面で、いいね・メッセージ・足あと・プロフィール管理を使えます。</p></div><button className="primary" onClick={() => openApp('match')}>マッチング画面を開く</button></div></section>;
}

function AppDashboard(props) {
  const { activeTab, setActiveTab, tabs, onBackSite, user, plan, stats, openProfileEditor, logout } = props;
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <div className="appv2">
      <header className="appv2-topbar">
        <button className="appv2-back" onClick={onBackSite}>←</button>
        <img src="/assets/pairly-logo-wide.png" alt="Pairly" className="appv2-logo" />
        <div className="appv2-topbar-right">
          <span className="appv2-stat">🔥 {stats.matches}</span>
          <span className="appv2-plan">{planLabel(plan)}</span>
          <div className="account-menu">
            <button className={cx('appv2-avatar', accountOpen && 'active')} type="button" onClick={() => setAccountOpen((open) => !open)} aria-haspopup="menu" aria-expanded={accountOpen}>
              {user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0,1) || 'P')}
            </button>
            {accountOpen && <div className="account-dropdown" role="menu">
              <div className="account-dropdown-head">
                <div className="account-dropdown-avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0,1) || 'P')}</div>
                <div><b>{user.name}</b><span>{user.email || user.riotId}</span></div>
              </div>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); openProfileEditor(); }}>プロフィール編集</button>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); setActiveTab('match'); }}>マッチングへ</button>
              <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); onBackSite(); }}>サイトへ戻る</button>
              <button type="button" role="menuitem" className="danger" onClick={() => { setAccountOpen(false); logout(); }}>ログアウト</button>
            </div>}
          </div>
        </div>
      </header>
      <main className="appv2-content" key={activeTab}>
        <TabPanel {...props} />
      </main>
      <nav className="appv2-bottom-nav">
        {tabs.map((tab) => (
          <button key={tab.id} className={cx('appv2-nav-btn', activeTab === tab.id && 'active')} onClick={() => setActiveTab(tab.id)}>
            <span className="appv2-nav-icon">{tab.emoji}</span>
            <span className="appv2-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function ProfileSummary({ user, plan, stats }) {
  return <div className="side-card"><h3>自分の状態</h3><div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0,1) || 'P'}</div><b>{user.name}</b><p>{user.riotId}</p><div className="mini-list"><span>{user.gender}</span><span>{user.age ? `${user.age}歳` : '年齢未設定'}</span><span>{user.region || '地域未設定'}</span><span>{user.rank}</span><span>{user.role}</span>{user.tags?.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="statline"><span>いいね {stats.likes}</span><span>マッチ {stats.matches}</span></div><span className="plan-pill">{planLabel(plan)}</span></div>;
}

function GenderFilter({ targetGender, setTargetGender, genderFilterLocked }) {
  return <div className="side-card"><h3>表示フィルター</h3><label>表示する性別<select disabled={genderFilterLocked} value={targetGender} onChange={(e) => setTargetGender(e.target.value)}><option value="all">すべて</option><option value="女性">女性だけ</option><option value="男性">男性だけ</option><option value="その他/未設定">その他/未設定</option></select></label>{genderFilterLocked ? <p className="hint">性別指定はPLUS/VIPで解放。FREEはすべて表示です。</p> : <p className="hint">性別指定フィルター使用中。</p>}<p className="hint">男女の特典差はありません。女性プロフィールは人気集中ガードで少しマッチしにくい調整です。</p></div>;
}

function TabPanel(props) {
  switch (props.activeTab) {
    case 'match': return <MatchPanel {...props} />;
    case 'dm': return <DmPanel {...props} />;
    case 'footprints': return <FootprintsPanel {...props} />;
    default: return <MatchPanel {...props} />;
  }
}

function MatchPanel({ current, swipe, reportCurrent, blockCurrent, stats, plan, profiles, index, targetGender, setTargetGender, genderFilterLocked, receivedLikes, acceptLike }) {
  const [swipeDir, setSwipeDir] = React.useState(null);

  async function handleSwipe(type) {
    const dir = type === 'pass' ? 'left' : type === 'super' ? 'up' : 'right';
    setSwipeDir(dir);
    await new Promise((r) => setTimeout(r, 300));
    setSwipeDir(null);
    swipe(type);
  }

  return (
    <div className="mp-wrap">
      {/* 受け取ったいいね */}
      {receivedLikes?.length > 0 && (
        <div className="mp-received-section">
          <div className="mp-received-header">💌 いいねが届いています <span>{receivedLikes.length}</span></div>
          <div className="mp-received-list">
            {receivedLikes.map((rl) => (
              <div key={rl.id} className="mp-received-card">
                <div className="mp-received-avatar">
                  {rl.fromPhoto ? <img src={rl.fromPhoto} alt={rl.fromProfileName} /> : rl.fromProfileName?.slice(0,1) || '?'}
                </div>
                <div className="mp-received-info">
                  <b>{rl.fromProfileName}</b>
                  <span>{rl.fromRank} · {rl.fromRole}</span>
                </div>
                <button className="mp-accept-btn" onClick={() => acceptLike(rl.id)}>承認 💕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フィルター行 */}
      <div className="mp-filter-row">
        <span className="mp-filter-label">🔍</span>
        <select className="mp-filter-select" disabled={genderFilterLocked} value={targetGender} onChange={(e) => setTargetGender(e.target.value)}>
          <option value="all">すべて</option>
          <option value="女性">女性</option>
          <option value="男性">男性</option>
          <option value="その他/未設定">その他</option>
        </select>
        {genderFilterLocked && <span className="mp-lock-hint">🔒 PLUS/VIPで解放</span>}
        <span className="mp-remain">👥 {Math.max(0, profiles.length - index)}</span>
      </div>

      {/* プロフィールカード */}
      <div className="mp-card-wrap">
        {current ? (
          <TinderProfileCard key={current.id} profile={current} onReport={reportCurrent} onBlock={blockCurrent} swipeDir={swipeDir} />
        ) : (
          <div className="mp-empty">
            <div className="mp-empty-icon">🤖</div>
            <h3>候補がなくなりました</h3>
            <p>AIが新しい候補を探しています…</p>
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className="mp-actions">
        <button className="mp-btn mp-btn-undo" title="元に戻す" onClick={() => {}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button className="mp-btn mp-btn-pass mp-btn-lg" onClick={() => handleSwipe('pass')} title="見送る">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button className="mp-btn mp-btn-like mp-btn-lg" onClick={() => handleSwipe('like')} title="いいね 💖">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
    </div>
  );
}

function TinderProfileCard({ profile, onReport, onBlock, swipeDir }) {
  const tags = profile.tags?.length ? profile.tags : profile.modes || [];
  const hue = (profile.name.charCodeAt(0) * 47) % 360;
  return (
    <article className={cx('mp-card', swipeDir && `mp-swipe-${swipeDir}`)}>
      {profile.profilePhoto
        ? <img className="mp-photo" src={profile.profilePhoto} alt={profile.name} />
        : <div className="mp-photo-placeholder" style={{ background: `linear-gradient(145deg,hsl(${hue},50%,20%),hsl(${(hue+50)%360},65%,42%))` }}><span>{profile.name.slice(0,1).toUpperCase()}</span></div>
      }
      <div className="mp-gradient" />

      {swipeDir === 'right' && <div className="mp-stamp mp-stamp-like">LIKE 💖</div>}
      {swipeDir === 'left'  && <div className="mp-stamp mp-stamp-nope">NOPE 👋</div>}
      {swipeDir === 'up'    && <div className="mp-stamp mp-stamp-super">SUPER ⭐</div>}

      <div className="mp-badges-top">
        {profile.guarded && <span className="mp-badge mp-badge-guard">🛡 人気集中</span>}
        <span className="mp-badge mp-badge-score">✨ {profile.matchScore}%</span>
      </div>

      <div className="mp-card-info">
        <div className="mp-active-row"><span className="mp-active-dot"/><span>Recently Active</span></div>
        <div className="mp-name-row">
          <h3 className="mp-name">{profile.name}</h3>
          <span className="mp-age">{profile.ageRange}</span>
        </div>
        <p className="mp-meta">🎮 {profile.rank} · {profile.role}</p>
        <p className="mp-meta">📍 {profile.gender}{profile.region ? ` · ${profile.region}` : ''}</p>
        {tags.length > 0 && <div className="mp-tags">{tags.slice(0,4).map((t) => <span className="mp-tag" key={t}>{t}</span>)}</div>}
        {profile.bio && <p className="mp-bio">{profile.bio}</p>}
      </div>

      <div className="mp-card-tools">
        <button className="mp-tool-btn" onClick={onReport}>🚨 通報</button>
        <button className="mp-tool-btn" onClick={onBlock}>🚫 ブロック</button>
      </div>
    </article>
  );
}

function ProfileCard({ profile, onReport, onBlock }) {
  return <TinderProfileCard profile={profile} onReport={onReport} onBlock={onBlock} />;
}

function DmPanel({ dmThreads, activeThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm }) {
  const activeThread = dmThreads.find((thread) => thread.match.id === activeThreadId) || dmThreads[0];
  useEffect(() => {
    if (activeThread?.match.id) markDmRead(activeThread.match.id);
  }, [activeThread?.match.id]);
  return <div className="dm-panel">
    <aside className="dm-thread-list">
      <div className="dm-head"><h3>マッチ後メッセージ</h3><span>{dmThreads.length}件</span></div>
      {dmThreads.length ? dmThreads.map((thread) => {
        const lastMessage = thread.messages.at(-1);
        return <button className={cx('dm-thread', activeThread?.match.id === thread.match.id && 'active', thread.unreadCount > 0 && 'unread')} key={thread.match.id} onClick={() => selectDmThread(thread.match.id)}>
          <b>{thread.match.profileName}{thread.unreadCount > 0 && <em>{thread.unreadCount}</em>}</b>
          <span>{lastMessage?.body || thread.match.opener}</span>
        </button>;
      }) : <p className="empty-text">まだマッチしていません。マッチ後だけメッセージが使えます。</p>}
    </aside>
    <section className="dm-conversation">
      {activeThread ? <>
        <div className="dm-conversation-head">
          <div className="avatar small">{activeThread.match.profileName?.slice(0, 1) || 'P'}</div>
          <div><h3>{activeThread.match.profileName}</h3><span>メッセージ解放済み</span></div>
        </div>
        <div className="dm-messages">
          {activeThread.messages.map((message) => <div className={cx('dm-bubble', message.sender === 'user' && 'mine')} key={message.id}>
            <p>{message.body}</p>
            <div className="dm-message-meta">
              {message.sender === 'user' && <span className={cx('dm-read-state', message.readAt && 'read')}>{message.readAt ? '既読' : '未読'}</span>}
              <time>{new Date(message.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          </div>)}
        </div>
        <form className="dm-form" onSubmit={sendDm}>
          <input value={dmDraft} maxLength="500" onChange={(e) => setDmDraft(e.target.value)} placeholder="メッセージを入力" />
          <button className="primary" type="submit">送信</button>
        </form>
      </> : <div className="locked-panel"><h3>メッセージはマッチ後に解放</h3><p>いいねや両いいねでマッチすると、ここに会話が表示されます。</p></div>}
    </section>
  </div>;
}
function FootprintsPanel({ footprints, plan }) { return <div className="list-panel"><h3>足あと</h3>{plan === 'FREE' && <p className="hint">足あと詳細はPLUS/VIP向け機能です。デモでは直近ログのみ表示します。</p>}{footprints.length ? footprints.map((f, i) => <div className="list-row" key={i}><b>{f.name}</b><p>{f.rank} / {f.gender}</p><span>{f.action}・{f.time}</span></div>) : <p className="empty-text">まだ操作履歴がありません。</p>}</div>; }
function PricingPanel(props) { return <PublicPricing {...props} appMode />; }

function PublicPricing({ plansData, pricingTab, setPricingTab, onSignup, appMode, buyPlan }) {
  const plans = plansData.plans || {};
  const monthly = Object.values(plans);
  return <section id="pricing" className={cx('section pricing-section', appMode && 'inside')}><div className="section-head"><span>料金</span><h2>料金</h2><p>男女で特典差はありません。VIPは全制限解除です。</p></div><div className="price-tabs"><button className={pricingTab === 'monthly' ? 'active' : ''} onClick={() => setPricingTab('monthly')}>月額プラン</button><button className={pricingTab === 'single' ? 'active' : ''} onClick={() => setPricingTab('single')}>単発課金</button><button className={pricingTab === 'compare' ? 'active' : ''} onClick={() => setPricingTab('compare')}>比較表</button></div>{pricingTab === 'monthly' && <div className="price-grid">{monthly.map((p) => <article className={cx('price-card', p.name === 'VIP' && 'featured')} key={p.name}><h3>{planLabel(p.name)}</h3><div className="price">¥{p.price.toLocaleString()}<span>/月</span></div><ul>{p.features?.map((f) => <li key={f}>{f}</li>)}</ul><button className="primary" onClick={buyPlan ? () => buyPlan(p.name) : onSignup}>{p.name === 'FREE' ? '無料で始める' : `${planLabel(p.name)}にする`}</button></article>)}</div>}{pricingTab === 'single' && <div className="single-grid">{(plansData.singleItems || []).map((item) => <article key={item.name} className="single-card"><h3>{item.name}</h3><b>¥{item.price}</b><p>{item.detail}</p></article>)}</div>}{pricingTab === 'compare' && <div className="compare"><table><thead><tr><th>機能</th><th>無料</th><th>プラス</th><th>VIP</th></tr></thead><tbody><tr><td>いいね</td><td>10回/日</td><td>40回/日</td><td>無制限</td></tr><tr><td>スーパーいいね</td><td>1回/日</td><td>5回/日</td><td>無制限</td></tr><tr><td>両いいね</td><td>5回</td><td>10回</td><td>無制限</td></tr><tr><td>性別指定</td><td>×</td><td>○</td><td>○</td></tr><tr><td>制限解除</td><td>×</td><td>一部</td><td>全解除</td></tr></tbody></table></div>}</section>;
}

function ProfilePanel({ user }) { return <div className="list-panel"><h3>プロフィール</h3><div className="profile-preview expanded"><div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0,1) || 'P'}</div><b>{user.name}</b><span>{user.gender} / {user.age ? `${user.age}歳` : '年齢未設定'} / {user.region || '地域未設定'}</span><span>{user.riotId} / {user.rank} / {user.role}</span>{Boolean(user.tags?.length) && <div className="tag-row">{user.tags.map((tag) => <span className="intent-tag" key={tag}>{tag}</span>)}</div>}<p>{user.bio || '自己紹介は未入力です。'}</p></div></div>; }
function SafetyCompact() { return <div className="list-panel"><h3>安全・規約</h3><TermsList /></div>; }
function Safety() { return <section id="safety" className="section narrow"><div className="section-head"><span>安全</span><h2>安全・規約</h2></div><TermsList /></section>; }
function TermsList() { return <div className="terms-list"><article><h3>利用開始による同意</h3><p>本サービスを閲覧、登録、ログイン、いいね、マッチング、メッセージ、通報、課金、外部SNS連携などで使用した時点で、利用規約に同意したものとみなします。</p></article><article><h3>免責</h3><p>ユーザー間のメッセージ、ボイスチャット、ゲームプレイ、外部SNS、金銭・人間関係トラブルは原則ユーザー同士で解決するものとします。ただし法令上免責できない場合、運営の故意または重大な過失は除きます。</p></article><article><h3>禁止事項</h3><p>暴言、脅迫、差別、セクハラ、恋愛/性的関係やオフライン接触の強要、年齢詐称、なりすまし、チート、アカウント売買、晒し、詐欺、外部決済誘導を禁止します。</p></article><article><h3>非公式表記</h3><p>PairlyはRiot Games公式サービスではありません。VALORANTおよび関連商標はRiot Games, Inc.に帰属します。</p></article></div>; }
function AdminPanel({ reports }) { return <div className="list-panel"><h3>通報管理</h3>{reports.length ? reports.map((r) => <div className="list-row" key={r.id}><b>{r.reason}</b><p>プロフィール: {r.profileId || '-'}</p><span>{r.status}</span></div>) : <p className="empty-text">通報はありません。</p>}</div>; }
function Footer() { return <footer className="footer"><img src="/assets/pairly-logo-wide.png" alt="Pairly" /><p>使用した時点で利用規約に同意したものとみなします。PairlyはRiot Games公式サービスではありません。</p></footer>; }

createRoot(document.getElementById('root')).render(<App />);
