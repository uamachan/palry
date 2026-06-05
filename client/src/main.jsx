import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
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
  { id: 'match', label: 'マッチング' },
  { id: 'dm', label: 'メッセージ' },
  { id: 'footprints', label: '足あと' },
  { id: 'pricing', label: '料金' },
  { id: 'profile', label: 'プロフィール' },
  { id: 'safety', label: '安全・規約' },
  { id: 'admin', label: '管理' }
];

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
  return message || 'ログイン処理に失敗しました。';
}

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('site');
  const [authMode, setAuthMode] = useState(null);
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
  const [dmThreads, setDmThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [dmDraft, setDmDraft] = useState('');
  const [footprints, setFootprints] = useState([]);
  const [reports, setReports] = useState([]);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const [form, setForm] = useState({ name: '', gender: '', riotId: '', email: '', emailConfirm: '', password: '', authCode: '', age: '', region: '', profilePhoto: '', rank: 'Gold 1', role: 'フレックス', tags: [], agents: [], xHandle: '', bio: '', agreed: false });

  const isAuthed = Boolean(user);
  const current = profiles[index] || null;
  const activePlan = plansData.plans?.[plan] || null;
  const genderFilterLocked = !activePlan?.genderFilter;

  useEffect(() => { api.plans().then(setPlansData).catch(() => showToast('料金データの取得に失敗しました')); }, []);

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
  }, [user]);

  useEffect(() => {
    if (activeTab === 'dm') refreshDmThreads();
  }, [activeTab]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', Boolean(authMode));
    return () => document.body.classList.remove('modal-open');
  }, [authMode]);

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

  function openApp(tab = 'match') {
    if (!user) {
      showToast('ログインしてください');
      showAuth('login');
      return;
    }
    setActiveTab(tab);
    setView('app');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function advanceToProfileSetup(uid, email, message) {
    setPendingFirebaseUser({ uid, email });
    setAuthMode('profileSetup');
    showToast(message);
  }

  async function createAccount(event) {
    event.preventDefault();
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email || form.password.length < 6) return showToast('メールアドレスと6文字以上のパスワードを入力してください');
    if (form.email.trim().toLowerCase() !== form.emailConfirm.trim().toLowerCase()) return showToast('確認用メールアドレスが一致していません');
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, form.email, form.password);
      await advanceToProfileSetup(credential.user.uid, credential.user.email, 'メール登録が完了しました。プロフィールを設定してください');
    } catch (e) {
      if (e?.code === 'auth/email-already-in-use') {
        try {
          const credential = await signInWithEmailAndPassword(firebaseAuth, form.email, form.password);
          await advanceToProfileSetup(credential.user.uid, credential.user.email, 'メール確認済みです。プロフィールを設定してください');
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
    if (!form.gender) return showToast('性別選択は必須です');
    if (!form.name || !form.riotId) return showToast('表示名とRiot IDを入力してください');
    if (!/^\d{4,8}$/.test(form.authCode)) return showToast('ログイン用の認証コードを4〜8桁の数字で設定してください');
    if (!form.age || !form.region) return showToast('年齢と地域を入力してください');
    if (!form.agreed) return showToast('利用規約への同意が必要です');
    try {
      const payload = await api.register({ ...form, firebaseUid: pendingFirebaseUser.uid, email: pendingFirebaseUser.email });
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
    if (!form.authCode) return showToast('認証コードを入力してください');
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, form.email, form.password);
      try {
        const payload = await api.login({ firebaseUid: credential.user.uid, email: credential.user.email, authCode: form.authCode });
        completeAuth(payload.user, 'ログインしました');
      } catch (profileError) {
        if (profileError?.message?.includes('Pairlyプロフィール')) {
          await advanceToProfileSetup(credential.user.uid, credential.user.email, 'プロフィール設定を完了してください');
          return;
        }
        showToast(profileError.message || 'ログインに失敗しました');
      }
    } catch (e) { showToast(authErrorMessage(e)); }
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
      const label = type === 'dual' ? '両いいね' : type === 'super' ? 'スーパーいいね' : 'いいね';
      setStats((s) => ({
        ...s,
        likes: type === 'like' ? s.likes + 1 : s.likes,
        super: type === 'super' ? s.super + 1 : s.super,
        dual: type === 'dual' && plan !== 'VIP' ? Math.max(0, s.dual - 1) : s.dual,
        matches: payload.matched ? s.matches + 1 : s.matches
      }));
      track(current, label);
      if (payload.matched) {
        showToast(`${current.name} とマッチ。メッセージが解放されました`);
        await refreshMatches();
        await refreshDmThreads(payload.match?.id);
      } else showToast(`${label}を送りました`);
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

  const shared = { user, isAuthed, activeTab, setActiveTab, tabs: appTabs, current, plan, setPlan, activePlan, plansData, pricingTab, setPricingTab, buyPlan, targetGender, setTargetGender, genderFilterLocked, swipe, reportCurrent, blockCurrent, stats, matches, dmThreads, activeThreadId, setActiveThreadId, dmDraft, setDmDraft, sendDm, footprints, reports, profiles, index, form, setForm, openApp };

  return <>
    {toast && <div className="toast">{toast}</div>}
    {!isAuthed && authMode && <AuthModal onClose={() => setAuthMode(null)} size={authMode === 'register' || authMode === 'login' ? 'narrow' : undefined}>
      {authMode === 'register' && <AccountSignupSection form={form} setForm={setForm} onSubmit={createAccount} onShowLogin={() => showAuth('login')} />}
      {authMode === 'profileSetup' && <SignupSection form={form} setForm={setForm} pendingEmail={pendingFirebaseUser?.email} onSubmit={register} onShowLogin={() => showAuth('login')} />}
      {authMode === 'login' && <LoginSection form={form} setForm={setForm} onLogin={loginWithFirebase} onResetPassword={resetPassword} onShowRegister={() => showAuth('register')} />}
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

function LoginSection({ form, setForm, onLogin, onResetPassword, onShowRegister }) {
  return <section className="email-signup-panel">
    <div className="email-signup-header">
      <span className="eyebrow">ログイン</span>
      <h2>ログイン</h2>
      <p>メールアドレス、パスワード、認証コードでログインします。</p>
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
      <label className="email-field-label">
        <span>認証コード</span>
        <input required id="login-auth-code" name="one-time-code" type="text" inputMode="numeric" autoComplete="one-time-code" value={form.authCode} onChange={(e) => setForm({ ...form, authCode: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="登録時に設定したコード" />
      </label>
      <div className="email-signup-actions">
        <button type="submit" className="primary">ログイン</button>
        <button type="button" className="secondary" onClick={onShowRegister}>アカウント作成はこちら</button>
        <button type="button" className="plain reset-password-link" onClick={onResetPassword}>パスワードを忘れた方</button>
      </div>
    </form>
  </section>;
}

function AccountSignupSection({ form, setForm, onSubmit, onShowLogin }) {
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
        <button type="button" className="plain reset-password-link" onClick={onShowLogin}>すでにアカウントがある方はこちら</button>
      </div>
    </form>
  </section>;
}

function SignupSection({ form, setForm, pendingEmail, onSubmit, onShowLogin }) {
  return <section className="setup-profile-section"><div className="setup-title"><span>プロフィール設定</span><h2>プロフィール設定</h2>{pendingEmail && <p className="registered-email">登録メール: {pendingEmail}</p>}</div><SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onShowLogin} /></section>;
}

function SignupForm({ form, setForm, onSubmit, onShowLogin }) {
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
        <label>認証コード<input required inputMode="numeric" maxLength="8" value={form.authCode} onChange={(e) => setForm({ ...form, authCode: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="4〜8桁の数字" /></label>
        <label>年齢<input required inputMode="numeric" maxLength="2" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="20" /></label>
        <label>地域<select required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="">選択してください</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
        <label>ランク<select value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })}>{ranks.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>メインロール<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>X<input value={form.xHandle} onChange={(e) => setForm({ ...form, xHandle: e.target.value })} placeholder="@pairly_user" /></label>
      </div>
      <fieldset className="span-all intent-fieldset"><legend>目的タグ（4つまで）</legend><div className="chip-list intent-chip-list">{intentTags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset>
      <fieldset className="span-all agent-fieldset"><legend>よく使うキャラクター（5体まで）</legend><div className="chip-list">{agents.map((agent) => <button type="button" key={agent} className={form.agents.includes(agent) ? 'selected' : ''} onClick={() => toggleAgent(agent)}>{agent}</button>)}</div></fieldset>
      <label className="span-all setup-bio">自己紹介<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="プレイ時間、VC、雰囲気、NGなことなど" /></label>
      <label className="check span-all"><input type="checkbox" checked={form.agreed} onChange={(e) => setForm({ ...form, agreed: e.target.checked })} />本サービスを閲覧・登録・ログイン・いいね・マッチング・メッセージ・通報・課金・外部SNS連携などで使用した時点で利用規約に同意したものとみなします。登録時にも規約へ同意します。</label>
    </div>
    <div className="form-actions"><button className="primary" type="submit">無料でアカウント作成</button><button type="button" className="secondary" onClick={onShowLogin}>ログインに戻る</button></div>
  </form>;
}

function ReturnToAppCard({ user, openApp }) {
  return <section className="section"><div className="return-card"><div><span className="eyebrow">ログイン中</span><h2>{user.name}さん、マッチング画面を開けます</h2><p>公開サイトとは分けた専用アプリ画面で、いいね・メッセージ・足あと・プロフィール管理を使えます。</p></div><button className="primary" onClick={() => openApp('match')}>マッチング画面を開く</button></div></section>;
}

function AppDashboard(props) {
  const { activeTab, setActiveTab, tabs, onBackSite } = props;
  return <main className="app-view">
    <header className="app-topbar"><button className="back-link" onClick={onBackSite}>← サイトに戻る</button><img src="/assets/pairly-logo-wide.png" alt="Pairly" /><span className="app-label">マッチング画面</span></header>
    <div className="app-layout">
      <aside className="app-sidebar"><ProfileSummary {...props} /><GenderFilter {...props} /></aside>
      <section className="app-main-panel">
        <div className="app-tabs" role="tablist">{tabs.map((tab) => <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}</div>
        <TabPanel {...props} />
      </section>
    </div>
  </main>;
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
    case 'pricing': return <PricingPanel {...props} />;
    case 'profile': return <ProfilePanel {...props} />;
    case 'safety': return <SafetyCompact />;
    case 'admin': return <AdminPanel {...props} />;
    default: return <MatchPanel {...props} />;
  }
}

function MatchPanel({ current, swipe, reportCurrent, blockCurrent, stats, plan, profiles, index }) {
  return (
    <div className="tinder-match-panel">
      <div className="tinder-card-area">
        {current ? (
          <TinderProfileCard profile={current} onReport={reportCurrent} onBlock={blockCurrent} />
        ) : (
          <div className="tinder-empty-card">
            <div className="tinder-empty-icon">🎮</div>
            <h3>候補がなくなりました</h3>
            <p>条件を変えるか、しばらくしてから再読み込みしてください。</p>
          </div>
        )}
      </div>
      <div className="tinder-actions">
        <button className="tinder-btn tinder-btn-undo" title="元に戻す" onClick={() => {}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
        <button className="tinder-btn tinder-btn-pass" onClick={() => swipe('pass')} title="見送る">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button className="tinder-btn tinder-btn-super" onClick={() => swipe('super')} title="スーパーいいね">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </button>
        <button className="tinder-btn tinder-btn-like" onClick={() => swipe('like')} title="いいね">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button className="tinder-btn tinder-btn-dual" onClick={() => swipe('dual')} disabled={plan !== 'VIP' && stats.dual === 0} title={`両いいね (残り${plan === 'VIP' ? '∞' : stats.dual})`}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        </button>
      </div>
      <div className="tinder-stats">
        <span>残り <b>{Math.max(0, profiles.length - index)}</b> 人</span>
        <span>マッチ <b>{stats.matches}</b></span>
        <span>両いいね <b>{plan === 'VIP' ? '∞' : stats.dual}</b></span>
      </div>
    </div>
  );
}

function TinderProfileCard({ profile, onReport, onBlock }) {
  const tags = profile.tags?.length ? profile.tags : profile.modes || [];
  return (
    <article className="tinder-profile-card">
      {profile.profilePhoto ? (
        <img className="tinder-photo" src={profile.profilePhoto} alt={profile.name} />
      ) : (
        <div className="tinder-photo-placeholder"
          style={{ background: `linear-gradient(135deg, hsl(${(profile.name.charCodeAt(0) * 47) % 360},55%,28%), var(--pink))` }}>
          {profile.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="tinder-card-gradient" />
      {profile.guarded && <div className="tinder-guard-badge">人気集中ガード</div>}
      <div className="tinder-score-badge">相性 {profile.matchScore}%</div>
      <div className="tinder-active-badge">
        <span className="tinder-active-dot" />
        Recently Active
      </div>
      <div className="tinder-card-info">
        <div className="tinder-card-name-row">
          <h3 className="tinder-card-name">{profile.name}</h3>
          <span className="tinder-card-age">{profile.ageRange}</span>
        </div>
        <p className="tinder-card-meta">{profile.gender} · {profile.rank} · {profile.role}</p>
        {tags.length > 0 && (
          <div className="tinder-card-tags">
            {tags.slice(0, 4).map((tag) => <span className="tinder-card-tag" key={tag}>{tag}</span>)}
          </div>
        )}
        {profile.bio && <p className="tinder-card-bio">{profile.bio}</p>}
      </div>
      <div className="tinder-card-tools">
        <button className="tinder-tool-btn" onClick={onReport}>通報</button>
        <button className="tinder-tool-btn" onClick={onBlock}>ブロック</button>
      </div>
    </article>
  );
}

function ProfileCard({ profile, onReport, onBlock }) {
  return <TinderProfileCard profile={profile} onReport={onReport} onBlock={onBlock} />;
}

function DmPanel({ dmThreads, activeThreadId, setActiveThreadId, dmDraft, setDmDraft, sendDm }) {
  const activeThread = dmThreads.find((thread) => thread.match.id === activeThreadId) || dmThreads[0];
  return <div className="dm-panel">
    <aside className="dm-thread-list">
      <div className="dm-head"><h3>マッチ後メッセージ</h3><span>{dmThreads.length}件</span></div>
      {dmThreads.length ? dmThreads.map((thread) => {
        const lastMessage = thread.messages.at(-1);
        return <button className={cx('dm-thread', activeThread?.match.id === thread.match.id && 'active')} key={thread.match.id} onClick={() => setActiveThreadId(thread.match.id)}>
          <b>{thread.match.profileName}</b>
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
            <time>{new Date(message.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
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
