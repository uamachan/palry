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
import './profile-setup.css';
import './profile-validation.css';
import './design-polish.css';

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
  return { email: '', emailConfirm: '', password: '', name: '', riotId: '', age: '', gender: '', region: '', profilePhoto: '', rank: 'Gold 1', role: defaultRole, tags: [], agents: [], xHandle: '', bio: '', voiceIntro: '', agreed: false };
}

function publicUserToForm(user) {
  return { ...initialForm(), ...user, tags: user?.tags || [], agents: user?.agents || [], agreed: true };
}

function firebaseErrorMessage(error) {
  const code = error?.code || '';
  if (code.includes('email-already-in-use')) return 'このメールアドレスは登録済みです';
  if (code.includes('invalid-email')) return 'メールアドレスの形式が正しくありません';
  if (code.includes('weak-password')) return 'パスワードは6文字以上にしてください';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) return 'メールアドレスまたはパスワードが違います';
  if (code.includes('popup-closed-by-user')) return 'Googleログインがキャンセルされました';
  if (code.includes('popup-blocked')) return 'ポップアップがブロックされています';
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
  const [activeTab, setActiveTab] = useState('match');
  const [plansData, setPlansData] = useState(null);
  const [pricingTab, setPricingTab] = useState('plans');
  const [activePlan, setActivePlan] = useState('FREE');
  const [entitlements, setEntitlements] = useState({ genderFilter: false, boost: false, spotlight: false, superCredits: 0 });
  const [targetGender, setTargetGender] = useState('all');
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [editForm, setEditForm] = useState(initialForm());
  const [pendingFirebaseUser, setPendingFirebaseUser] = useState(null);
  const [profileSetupPrompt, setProfileSetupPrompt] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const toastTimerRef = useRef(null);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 2600);
  }

  useEffect(() => {
    api.plans().then(setPlansData).catch(() => null);
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
          } catch {
            setPendingFirebaseUser({ uid: fbUser.uid, email: fbUser.email, emailVerified: true });
            setProfileSetupPrompt(true);
          }
        });
      });
    }).catch(() => setAuthReady(true));
  }, []);

  useEffect(() => () => clearTimeout(toastTimerRef.current), []);

  function completeAuth(nextUser, message) {
    setUser(nextUser);
    setPlan(nextUser.plan || 'FREE');
    setActivePlan(nextUser.plan || 'FREE');
    setEntitlements({ genderFilter: false, boost: false, spotlight: false, superCredits: 0 });
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
      showToast(error.message || firebaseErrorMessage(error));
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
      } catch {
        setPendingFirebaseUser({ uid: credential.user.uid, email: credential.user.email, emailVerified: true });
        setForm((f) => ({ ...initialForm(), email: credential.user.email || f.email, emailConfirm: credential.user.email || f.emailConfirm }));
        setAuthMode('profileSetup');
      }
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  }

  async function resetPassword() {
    if (!form.email) return showToast('メールアドレスを入力してください');
    try {
      const { sendPasswordResetEmail, firebaseAuth } = await getFirebaseMods();
      await sendPasswordResetEmail(firebaseAuth, form.email.trim());
      showToast('パスワード再設定メールを送信しました');
    } catch (error) {
      showToast(firebaseErrorMessage(error));
    }
  }

  async function register(e) {
    e.preventDefault();
    try {
      const { firebaseAuth } = await getFirebaseMods();
      const current = firebaseAuth.currentUser;
      if (!current) return showToast('Firebaseログインが必要です');
      if (!current.emailVerified) return showToast('メール認証を完了してください');
      const idToken = await current.getIdToken();
      const payload = await api.register({ ...form, idToken, email: current.email });
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
    const { signOut, firebaseAuth } = await getFirebaseMods();
    await signOut(firebaseAuth).catch(() => null);
    setUser(null);
    setPlan('FREE');
    setActivePlan('FREE');
    setView('site');
    setMatches([]);
    setReceivedLikes([]);
    setDmThreads([]);
    setActiveThreadId(null);
    setEntitlements({ genderFilter: false, boost: false, spotlight: false, superCredits: 0 });
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

  const genderFilterLocked = targetGender !== 'all' && !plansData?.plans?.[plan]?.genderFilter && !entitlements.genderFilter;

  async function refreshProfiles() {
    if (!user) return;
    try {
      const payload = await api.profiles({ plan, targetGender, userId: user.id });
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
    const payload = await api.receivedLikes(user.id).catch(() => ({ receivedLikes: [] }));
    setReceivedLikes(payload.receivedLikes || []);
  }

  async function refreshDmThreads(preferredThreadId = activeThreadId) {
    if (!user) return;
    const payload = await api.dmThreads(user.id).catch(() => ({ threads: [] }));
    const nextThreads = payload.threads || [];
    setDmThreads(nextThreads);
    setActiveThreadId((currentId) => {
      const desired = preferredThreadId || currentId;
      if (desired && nextThreads.some((thread) => thread.match.id === desired)) return desired;
      return nextThreads[0]?.match.id || null;
    });
  }

  useEffect(() => { if (user) refreshProfiles(); }, [user?.id, plan, targetGender, entitlements.genderFilter]);
  useEffect(() => { if (user) { refreshMatches(); refreshReceivedLikes(); refreshDmThreads(); } }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    api.entitlements(user.id).then((payload) => setEntitlements(payload.entitlements || entitlements)).catch(() => null);
  }, [user?.id]);

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
      setFootprints((f) => [{ name: current.name, rank: current.rank, gender: current.gender, action: '見送り', time: '今' }, ...f].slice(0, 20));
      nextCard();
      return;
    }
    try {
      const payload = await api.like({ userId: user.id, profileId: current.id, type, plan, targetGender });
      if (payload.entitlements) setEntitlements(payload.entitlements);
      if (payload.match) {
        setMatches((m) => [payload.match, ...m]);
        showToast(`${current.name}さんとマッチしました！`);
        await refreshMatches();
        await refreshDmThreads(payload.match.id);
      } else if (payload.receivedLike) {
        showToast(`${directionLabel} を送りました。相手の通知に表示されます。`);
      } else {
        showToast(`${directionLabel} しました`);
      }
      setFootprints((f) => [{ name: current.name, rank: current.rank, gender: current.gender, action: directionLabel, time: '今' }, ...f].slice(0, 20));
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
    markDmRead(matchId);
  }

  async function sendDm(e) {
    e.preventDefault();
    if (!activeThreadId || !dmDraft.trim()) return;
    setDmSending(true);
    try {
      const payload = await api.sendDm({ matchId: activeThreadId, body: dmDraft.trim() });
      setDmDraft('');
      setDmThreads((threads) => threads.map((thread) => thread.match.id === activeThreadId ? { ...thread, messages: [...thread.messages, payload.message], updatedAt: payload.message.createdAt } : thread));
      showToast('メッセージを送信しました');
    } catch (error) {
      showToast(error.message || '送信に失敗しました');
    } finally {
      setDmSending(false);
    }
  }

  function blockCurrent() {
    if (!current) return;
    nextCard();
    showToast(`${current.name}を非表示にしました`);
  }

  function reportCurrent() {
    if (!current) return;
    api.report({ userId: user.id, profileId: current.id, reason: 'プロフィールでの迷惑行為/不適切な内容' }).catch(() => null);
    setReports((r) => [{ id: Date.now(), profileId: current.id, reason: 'プロフィール通報', status: 'open' }, ...r]);
    showToast(`${current.name}を通報しました`);
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

  const shared = useMemo(() => ({ user, isAuthed, activeTab, setActiveTab, tabs: appTabs, current, plan, setPlan, activePlan, plansData, entitlements, pricingTab, setPricingTab, buyPlan, buyItem, targetGender, setTargetGender, genderFilterLocked, swipe, reportCurrent, blockCurrent, reportProfile, blockProfile, stats, matches, receivedLikes, acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, setActiveThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, footprints, reports, profiles, index, form, setForm, openApp, openProfileEditor, logout }), [user, isAuthed, activeTab, current, plan, activePlan, plansData, entitlements, pricingTab, targetGender, genderFilterLocked, stats, matches, receivedLikes, dmThreads, unreadDmCount, notificationCount, activeThreadId, dmDraft, dmSending, footprints, reports, profiles, index, form]);

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
