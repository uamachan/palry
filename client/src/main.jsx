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
const roles = ['デュエリスト', 'イニシエーター', 'コントローラー', 'センチネル'];
const defaultRole = roles[0];
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
  { id: 'notifications', label: '通知' },
  { id: 'dm', label: 'メッセージ' },
  { id: 'footprints', label: '足あと' },
];
const TAB_ICONS = {
  match: <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>,
  notifications: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  dm: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  footprints: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
};
const googleProvider = new GoogleAuthProvider();

function cx(...v) { return v.filter(Boolean).join(' '); }

function resizePhoto(file, maxSize = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('画像を処理できませんでした'));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('画像を読み込めませんでした'));
    };
    image.src = objectUrl;
  });
}

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
  const [profileSetupPrompt, setProfileSetupPrompt] = useState(false);
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
    if (firebaseAuth) await signOut(firebaseAuth).catch(() => null);
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      if (await loadSavedProfile(firebaseAuth.currentUser, '保存済みプロフィールでログインしました')) return;
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
    if (!firebaseReady || !firebaseAuth) return showToast('Firebase設定が未設定です。.envを確認してください');
    if (!form.email || !form.password) return showToast('メールアドレスとパスワードを入力してください');
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, form.email, form.password);
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shared = useMemo(() => ({ user, isAuthed, activeTab, setActiveTab, tabs: appTabs, current, plan, setPlan, activePlan, plansData, pricingTab, setPricingTab, buyPlan, targetGender, setTargetGender, genderFilterLocked, swipe, reportCurrent, blockCurrent, reportProfile, blockProfile, stats, matches, receivedLikes, acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, setActiveThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, footprints, reports, profiles, index, form, setForm, openApp, openProfileEditor, logout }), [user, isAuthed, activeTab, current, plan, activePlan, plansData, pricingTab, buyPlan, targetGender, genderFilterLocked, swipe, stats, matches, receivedLikes, acceptLike, dmThreads, unreadDmCount, notificationCount, activeThreadId, dmDraft, dmSending, footprints, reports, profiles, index, form, openApp, openProfileEditor, logout]);

  return <>
    <div className="toast" role="status" aria-live="polite" aria-atomic="true" aria-relevant="text" hidden={!toast}>{toast}</div>
    {isAuthed && profileEditorOpen && <AuthModal onClose={() => setProfileEditorOpen(false)} size="profile">
      <ProfileEditSection form={editForm} setForm={setEditForm} user={user} onSubmit={saveProfileEdit} onCancel={() => setProfileEditorOpen(false)} showToast={showToast} />
    </AuthModal>}
    {!isAuthed && authMode && <AuthModal onClose={() => setAuthMode(null)} size={authMode === 'profileSetup' ? 'profile' : ['register', 'login', 'emailVerification', 'entry'].includes(authMode) ? 'narrow' : undefined}>
      {authMode === 'entry' && <AuthEntrySection onShowRegister={() => showAuth('register')} onShowLogin={() => showAuth('login')} onGoogle={continueWithGoogle} />}
      {authMode === 'register' && <AccountSignupSection form={form} setForm={setForm} onSubmit={createAccount} onGoogle={continueWithGoogle} onShowLogin={() => showAuth('login')} />}
      {authMode === 'emailVerification' && <EmailVerificationSection pendingEmail={pendingFirebaseUser?.email} onCheck={confirmEmailVerified} onResend={resendVerificationEmail} onShowLogin={() => showAuth('login')} />}
      {authMode === 'profileSetup' && <SignupSection form={form} setForm={setForm} pendingEmail={pendingFirebaseUser?.email} onSubmit={register} onShowLogin={() => showAuth('login')} showToast={showToast} />}
      {authMode === 'login' && <LoginSection form={form} setForm={setForm} onLogin={loginWithFirebase} onGoogle={continueWithGoogle} onResetPassword={resetPassword} onShowRegister={() => showAuth('register')} />}
    </AuthModal>}
    {view === 'app' && user ? <AppDashboard {...shared} onBackSite={() => setView('site')} /> : <>
      <SiteHeader isAuthed={isAuthed} user={user} plan={plan} notificationCount={notificationCount} onAuth={() => showAuth('entry')} onOpenApp={() => openApp('match')} openProfileEditor={openProfileEditor} logout={logout} onGoApp={() => { openApp('match'); }} onGoNotifications={() => { openApp('notifications'); }} />
      <main className="site-page">
        <Hero onSignup={() => showAuth('register')} onOpenApp={() => openApp('match')} />
        {profileSetupPrompt && pendingFirebaseUser && <PendingProfileSetupCard email={pendingFirebaseUser.email} onOpen={() => advanceToProfileSetup(pendingFirebaseUser.uid, pendingFirebaseUser.email, 'プロフィールを設定してください')} />}
        {isAuthed && <ReturnToAppCard user={user} openApp={openApp} />}
        <PublicPricing plansData={plansData} pricingTab={pricingTab} setPricingTab={setPricingTab} onSignup={() => showAuth('register')} buyPlan={buyPlan} />
        <Safety />
      </main>
      <Footer />
    </>}
  </>;
}

function SiteHeader({ isAuthed, user, plan, notificationCount, onAuth, onOpenApp, openProfileEditor, logout, onGoApp, onGoNotifications, onGoPricing, onGoSafety, brandHref, onBrandClick, activeTab, setActiveTab }) {
  const [accountOpen, setAccountOpen] = useState(false);
  const logo = <img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" width="132" height="44" decoding="async" fetchPriority="high" />;
  const brandEl = onBrandClick
    ? <button className="brand app-brand-button" type="button" onClick={onBrandClick} aria-label="Pairlyトップへ">{logo}</button>
    : <a className="brand" href={brandHref || '#top'}>{logo}</a>;
  return <header className="site-header">
    {brandEl}
    <nav className="site-nav">
      {setActiveTab ? <>
        <button type="button" className={cx('nav-button', activeTab === 'match' && 'active')} onClick={() => setActiveTab('match')}>マッチング</button>
        <button type="button" className="nav-button" onClick={onGoPricing || (() => setActiveTab('pricing'))}>料金</button>
        <button type="button" className="nav-button" onClick={onGoSafety || (() => setActiveTab('safety'))}>安全・規約</button>
      </> : <>
        <button className="nav-button" onClick={onOpenApp}>マッチング</button><a href="#pricing">料金</a><a href="#safety">安全・規約</a>
      </>}
    </nav>
    <div className="header-actions">
      {isAuthed ? <span className="plan-pill">{planLabel(plan)}</span> : <button className="primary small" onClick={onAuth}>ログイン / 登録</button>}
      {isAuthed && user && <>
        <button className={cx('appv2-notification-btn', activeTab === 'notifications' && 'active', notificationCount > 0 && 'has-unread')} type="button" onClick={onGoNotifications || (() => setActiveTab?.('notifications'))} aria-label="通知">
          {TAB_ICONS.notifications}
          {notificationCount > 0 && <em>{notificationCount}</em>}
        </button>
        <div className="account-menu">
          <button className={cx('appv2-avatar', accountOpen && 'active')} type="button" onClick={() => setAccountOpen(o => !o)} aria-haspopup="menu" aria-expanded={accountOpen}>
            {user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0,1) || 'P')}
          </button>
          {accountOpen && <div className="account-dropdown" role="menu">
            <div className="account-dropdown-head">
              <div className="account-dropdown-avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0,1) || 'P')}</div>
              <div><b>{user.name}</b><span>{user.email || user.riotId}</span></div>
            </div>
            <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); openProfileEditor?.(); }}>プロフィール編集</button>
            <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); (onGoApp || onOpenApp)?.(); }}>マッチングへ</button>
            <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); logout?.(); }}>ログアウト</button>
          </div>}
        </div>
      </>}
    </div>
  </header>;
}

function AuthModal({ children, onClose, size }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // フォーカストラップ: モーダル内に留まらせる。
  // 初回だけフォーカスし、入力中の再レンダーではフォーカスを奪わない。
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const getFocusable = () => panel.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    const preferredFocus = panel.querySelector('input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])');
    (preferredFocus || getFocusable()[0])?.focus();
    function trap(e) {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function esc(e) { if (e.key === 'Escape') onCloseRef.current(); }
    panel.addEventListener('keydown', trap);
    document.addEventListener('keydown', esc);
    return () => {
      panel.removeEventListener('keydown', trap);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return <div className={cx('auth-modal', size === 'profile' && 'auth-modal--profile')} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
    <button className="auth-scrim" type="button" aria-label="モーダルを閉じる" onClick={onClose}></button>
    <div ref={panelRef} className={cx('auth-modal-panel', size === 'narrow' && 'auth-modal-panel--narrow', size === 'profile' && 'auth-modal-panel--profile')}>
      <button className="auth-close" type="button" aria-label="閉じる" onClick={onClose}>×</button>
      {children}
    </div>
  </div>;
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

function AuthEntrySection({ onShowRegister, onShowLogin, onGoogle }) {
  return <section className="email-signup-panel auth-entry-panel">
    <div className="email-signup-header">
      <span className="eyebrow">ようこそ</span>
      <h2 id="auth-modal-title">Pairlyへようこそ</h2>
      <p>VALORANTの相方を見つけよう</p>
    </div>
    <div className="email-signup-actions">
      <button className="primary" onClick={onShowRegister}>無料で新規登録</button>
      <button className="secondary google-button" onClick={onGoogle}>Googleで続ける</button>
      <button className="secondary" onClick={onShowLogin}>ログイン（登録済みの方）</button>
    </div>
  </section>;
}

function LoginSection({ form, setForm, onLogin, onGoogle, onResetPassword, onShowRegister }) {
  return <section className="email-signup-panel">
    <div className="email-signup-header">
      <span className="eyebrow">ログイン</span>
      <h2 id="auth-modal-title">ログイン</h2>
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
      <h2 id="auth-modal-title">メール登録</h2>
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
      <h2 id="auth-modal-title">メールを確認してください</h2>
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

function SignupSection({ form, setForm, pendingEmail, onSubmit, onShowLogin, showToast }) {
  return <section className="setup-profile-section"><div className="setup-title"><span>プロフィール設定</span><h2 id="auth-modal-title">プロフィール設定</h2>{pendingEmail && <p className="registered-email">登録メール: {pendingEmail}</p>}</div><SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onShowLogin} showToast={showToast} /></section>;
}

function ProfileEditSection({ form, setForm, user, onSubmit, onCancel, showToast }) {
  return <section className="setup-profile-section profile-edit-section">
    <div className="setup-title">
      <span>アカウント</span>
      <h2 id="auth-modal-title">プロフィール編集</h2>
      <p className="registered-email">ログイン中: {user.email || user.name}</p>
    </div>
    <SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onCancel} showToast={showToast} submitLabel="変更を保存" cancelLabel="キャンセル" showAgreement={false} />
  </section>;
}

function SignupForm({ form, setForm, onSubmit, onShowLogin, showToast, submitLabel = '無料でアカウント作成', cancelLabel = 'ログインに戻る', showAgreement = true }) {
  const tabs = ['基本情報', 'ランク', 'プレイスタイル', '自己紹介', ...(showAgreement ? ['規約'] : [])];
  const [activeSetupTab, setActiveSetupTab] = useState(tabs[0]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [submitAfterAgree, setSubmitAfterAgree] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordTimerRef = useRef(null);
  const toggleAgent = (agent) => setForm((f) => ({ ...f, agents: f.agents.includes(agent) ? f.agents.filter((a) => a !== agent) : [...f.agents, agent].slice(0, 5) }));
  const toggleTag = (tag) => setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((item) => item !== tag) : [...f.tags, tag].slice(0, 4) }));
  useEffect(() => () => {
    clearTimeout(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);
  useEffect(() => {
    if (submitAfterAgree && form.agreed) {
      setSubmitAfterAgree(false);
      onSubmit({ preventDefault: () => {} });
    }
  }, [submitAfterAgree, form.agreed]);
  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert('このブラウザは音声録音に対応していません。');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return alert('マイクの許可が必要です。ブラウザの権限を確認してください。');
    }
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => setForm((current) => ({ ...current, voiceIntro: String(reader.result || '') }));
      reader.readAsDataURL(blob);
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setIsRecordingVoice(false);
      clearTimeout(recordTimerRef.current);
    };
    recorder.start();
    setIsRecordingVoice(true);
    recordTimerRef.current = setTimeout(() => stopVoiceRecording(), 20000);
  }
  function stopVoiceRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }
  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const photo = await resizePhoto(file);
      setForm((current) => ({ ...current, profilePhoto: photo }));
    } catch {
      alert('写真の読み込みに失敗しました。別の画像を選んでください。');
    }
  }
  const currentTabIndex = tabs.indexOf(activeSetupTab);
  const isLastTab = currentTabIndex === tabs.length - 1;
  const isAgreementTab = activeSetupTab === '規約';
  const basicInfoComplete = Boolean(form.name && form.gender && form.riotId && form.age && form.region);

  function goToTab(label) {
    const targetIndex = tabs.indexOf(label);
    if (targetIndex > 0 && !basicInfoComplete) {
      showToast?.('基本情報（表示名・性別・Riot ID・年齢・地域）をすべて入力してください');
      return;
    }
    setActiveSetupTab(label);
  }

  function goNext() {
    if (!isLastTab) goToTab(tabs[currentTabIndex + 1]);
  }

  function handleAgreementChange(e) {
    const agreed = e.target.checked;
    setForm({ ...form, agreed });
    setSubmitAfterAgree(agreed);
  }

  return <form className="signup-card profile-setup-card" onSubmit={onSubmit}>
    <div className="setup-tabs" role="tablist">{tabs.map((label) => <button type="button" role="tab" key={label} className={activeSetupTab === label ? 'active' : ''} aria-selected={activeSetupTab === label} onClick={() => goToTab(label)}>{label}</button>)}</div>
    <div className="setup-pane">
      {activeSetupTab === '基本情報' && <div className="profile-setup-grid">
        <label className="photo-uploader">
          <span>プロフィール写真</span>
          <input type="file" accept="image/*" onChange={selectPhoto} />
          <div className="photo-preview">{form.profilePhoto ? <img src={form.profilePhoto} alt="" /> : <b>写真を追加</b>}</div>
        </label>
        <div className="setup-fields basic-fields">
          <label>表示名<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="yamada" /></label>
          <label>性別<select required value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">選択してください</option><option>女性</option><option>男性</option><option>その他/未設定</option></select></label>
          <label>RIOT ID<input required value={form.riotId} onChange={(e) => setForm({ ...form, riotId: e.target.value })} placeholder="name#JP1" /></label>
          <label>年齢<input required inputMode="numeric" maxLength="2" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="20" /></label>
          <label>地域<select required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="">選択してください</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
          <label>X<input value={form.xHandle} onChange={(e) => setForm({ ...form, xHandle: e.target.value })} placeholder="@pairly_user" /></label>
        </div>
      </div>}
      {activeSetupTab === 'ランク' && <div className="setup-fields setup-tab-grid">
        <CustomSelect label="ランク" value={form.rank} options={ranks} onChange={(rank) => setForm({ ...form, rank })} />
        <CustomSelect label="メインロール" value={form.role} options={roles} onChange={(role) => setForm({ ...form, role })} />
      </div>}
      {activeSetupTab === 'プレイスタイル' && <>
        <fieldset className="intent-fieldset"><legend>目的タグ（4つまで）</legend><div className="chip-list intent-chip-list">{intentTags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset>
        <fieldset className="agent-fieldset"><legend>よく使うキャラクター（5体まで）</legend><div className="chip-list">{agents.map((agent) => <button type="button" key={agent} className={form.agents.includes(agent) ? 'selected' : ''} onClick={() => toggleAgent(agent)}>{agent}</button>)}</div></fieldset>
      </>}
      {activeSetupTab === '自己紹介' && <div className="setup-intro-pane">
        <label className="setup-bio">自己紹介<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="プレイ時間、VC、雰囲気、NGなことなど" /></label>
        <div className="voice-recorder">
          <div><b>声の自己紹介</b><span>最大20秒。カード上で相手が再生できます。</span></div>
          <div className="voice-actions">
            {!isRecordingVoice
              ? <button type="button" className="secondary" onClick={startVoiceRecording}>{form.voiceIntro ? '録り直す' : '録音する'}</button>
              : <button type="button" className="primary" onClick={stopVoiceRecording}>録音停止</button>}
            {form.voiceIntro && <button type="button" className="secondary" onClick={() => setForm((current) => ({ ...current, voiceIntro: '' }))}>削除</button>}
          </div>
          {isRecordingVoice && <p className="voice-status">録音中...</p>}
          {form.voiceIntro && <audio className="voice-player" src={form.voiceIntro} controls />}
        </div>
      </div>}
      {activeSetupTab === '規約' && showAgreement && <label className="check"><input type="checkbox" checked={form.agreed} onChange={handleAgreementChange} />本サービスを閲覧・登録・ログイン・いいね・マッチング・メッセージ・通報・課金・外部SNS連携などで使用した時点で利用規約に同意したものとみなします。登録時にも規約へ同意します。</label>}
    </div>
    <div className="form-actions">
      {!isAgreementTab && !isLastTab && <button type="button" className="primary" onClick={goNext}>次へ</button>}
      {(!showAgreement || isLastTab) && !isAgreementTab && <button className="primary" type="submit">{submitLabel}</button>}
      <button type="button" className="secondary" onClick={onShowLogin}>{cancelLabel}</button>
    </div>
  </form>;
}

function CustomSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return <div className={cx('custom-select-field', open && 'open')} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span>{label}</span>
    <button type="button" className="custom-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <b>{value}</b>
      <i></i>
    </button>
    {open && <div className="custom-select-menu" role="listbox" tabIndex={-1}>
      {options.map((option) => <button
        type="button"
        key={option}
        role="option"
        aria-selected={option === value}
        className={option === value ? 'selected' : ''}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          onChange(option);
          setOpen(false);
        }}
      >
        {option}
      </button>)}
    </div>}
  </div>;
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

function AppDashboard(props) {
  const { activeTab, setActiveTab, tabs, onBackSite, user, plan, notificationCount, unreadDmCount, openProfileEditor, logout } = props;
  function openSiteSection(sectionId) {
    onBackSite();
    window.setTimeout(() => {
      const section = document.getElementById(sectionId);
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${sectionId}`);
    }, 50);
  }
  return (
    <div className="appv2">
      <SiteHeader
        isAuthed={true}
        user={user}
        plan={plan}
        notificationCount={notificationCount}
        onBrandClick={onBackSite}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onGoPricing={() => openSiteSection('pricing')}
        onGoSafety={() => openSiteSection('safety')}
        openProfileEditor={openProfileEditor}
        logout={logout}
      />
      <main className={cx('appv2-content', activeTab === 'dm' && 'appv2-content--dm')} key={activeTab}>
        <TabPanel {...props} />
      </main>
      <nav className="appv2-bottom-nav" aria-label="アプリメニュー">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cx('appv2-nav-btn', activeTab === tab.id && 'active')}
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
          >
            <span className="appv2-nav-icon">
              {TAB_ICONS[tab.id]}
              {tab.id === 'notifications' && notificationCount > 0 && <em className="appv2-nav-badge">{notificationCount}</em>}
              {tab.id === 'dm' && unreadDmCount > 0 && <em className="appv2-nav-badge">{unreadDmCount}</em>}
            </span>
            <span className="appv2-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function ProfileSummary({ user, plan, stats, receivedLikes = [] }) {
  return <div className="side-card"><h3>自分の状態</h3><div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0,1) || 'P'}</div><b>{user.name}</b><p data-copyable>{user.riotId}</p><div className="mini-list"><span>{user.gender}</span><span>{user.age ? `${user.age}歳` : '年齢未設定'}</span><span>{user.region || '地域未設定'}</span><span>{user.rank}</span><span>{user.role}</span>{user.tags?.map((tag) => <span key={tag}>{tag}</span>)}</div><div className="statline"><span>好意あり {receivedLikes.length}</span><span>マッチ {stats.matches}</span></div><span className="plan-pill">{planLabel(plan)}</span></div>;
}

function GenderFilter({ targetGender, setTargetGender, genderFilterLocked }) {
  return <div className="side-card"><h3>表示フィルター</h3><label>表示する性別<select disabled={genderFilterLocked} value={targetGender} onChange={(e) => setTargetGender(e.target.value)}><option value="all">すべて</option><option value="女性">女性だけ</option><option value="男性">男性だけ</option><option value="その他/未設定">その他/未設定</option></select></label>{genderFilterLocked ? <p className="hint">性別指定はPLUS/VIPで解放。FREEはすべて表示です。</p> : <p className="hint">性別指定フィルター使用中。</p>}<p className="hint">表示性別による特典差はありません。</p></div>;
}

function NotificationsPanel({ receivedLikes, dmThreads, setActiveTab, selectDmThread, acceptLike }) {
  const unreadThreads = dmThreads.filter((thread) => Number(thread.unreadCount || 0) > 0);
  const recentThreads = dmThreads.slice(0, 3);
  const totalUnread = receivedLikes.length + unreadThreads.reduce((sum, t) => sum + Number(t.unreadCount || 0), 0);
  return <div className="notifications-panel list-panel" aria-label="通知パネル">
    <div className="notifications-head">
      <div><span>通知</span><h3>通知</h3></div>
      <b aria-label={`${totalUnread}件の通知`}>{totalUnread}件</b>
    </div>
    <div className="notification-list" role="list">
      {receivedLikes.map((like) => <article className="notification-card important" key={like.id} role="listitem">
        <div className="notification-icon" aria-hidden="true">♡</div>
        <div><b>{like.fromProfileName}さんからいいね</b><p>{like.fromRank || 'ランク未設定'} · {like.fromRole || 'ロール未設定'}</p></div>
        <button type="button" aria-label={`${like.fromProfileName}さんにいいねを返す`} onClick={() => acceptLike(like.id)}>いいねを返す</button>
      </article>)}
      {unreadThreads.map((thread) => <article className="notification-card" key={`unread_${thread.match.id}`} role="listitem">
        <div className="notification-icon" aria-hidden="true">✉</div>
        <div><b>{thread.match.profileName}さんからメッセージ</b><p>{thread.unreadCount}件の未読があります</p></div>
        <button type="button" aria-label={`${thread.match.profileName}さんのメッセージを開く`} onClick={() => { selectDmThread(thread.match.id); setActiveTab('dm'); }}>開く</button>
      </article>)}
      {!receivedLikes.length && !unreadThreads.length && recentThreads.map((thread) => <article className="notification-card quiet" key={`recent_${thread.match.id}`} role="listitem">
        <div className="notification-icon" aria-hidden="true">✓</div>
        <div><b>{thread.match.profileName}さんとマッチ済み</b><p>DMで会話できます</p></div>
        <button type="button" aria-label={`${thread.match.profileName}さんにDMを送る`} onClick={() => { selectDmThread(thread.match.id); setActiveTab('dm'); }}>DM</button>
      </article>)}
      {!receivedLikes.length && !unreadThreads.length && !recentThreads.length && <div className="notification-empty">
        <div className="notification-empty-icon">{TAB_ICONS.notifications}</div>
        <h3>通知はまだありません</h3>
        <p>いいねが届いた時やDMが来た時にここへ表示されます。</p>
      </div>}
    </div>
  </div>;
}

function TabPanel(props) {
  switch (props.activeTab) {
    case 'match': return <MatchPanel {...props} />;
    case 'pricing': return <PricingPanel {...props} />;
    case 'safety': return <SafetyCompact />;
    case 'notifications': return <NotificationsPanel {...props} />;
    case 'dm': return <DmPanel {...props} />;
    case 'footprints': return <FootprintsPanel {...props} />;
    default: return <MatchPanel {...props} />;
  }
}

function MatchPanel({ current, swipe, reportCurrent, blockCurrent, stats, plan, profiles, index, targetGender, setTargetGender, genderFilterLocked, receivedLikes, acceptLike }) {
  const [swipeDir, setSwipeDir] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [acceptingLikeId, setAcceptingLikeId] = useState('');
  const [detailProfile, setDetailProfile] = useState(null);

  async function handleSwipe(type) {
    if (actionBusy || !current) return;
    setActionBusy(true);
    const dir = type === 'pass' ? 'left' : type === 'super' ? 'up' : 'right';
    try {
      setSwipeDir(dir);
      await new Promise((r) => setTimeout(r, 300));
      setSwipeDir(null);
      await swipe(type);
    } finally {
      setSwipeDir(null);
      setActionBusy(false);
    }
  }

  async function handleAcceptLike(receivedLikeId) {
    if (acceptingLikeId) return;
    setAcceptingLikeId(receivedLikeId);
    try {
      await acceptLike(receivedLikeId);
    } finally {
      setAcceptingLikeId('');
    }
  }

  return (
    <div className="mp-wrap">
      {/* 自分に届いた返答待ちのいいね */}
      <div className={cx('mp-received-section', !receivedLikes?.length && 'empty')}>
          <div className="mp-received-header">届いたいいね <span>{receivedLikes.length}</span></div>
          <div className="mp-received-list">
            {receivedLikes?.length ? receivedLikes.map((rl) => (
              <div key={rl.id} className="mp-received-card">
                <div className="mp-received-avatar">
                  {rl.fromPhoto ? <img src={rl.fromPhoto} alt={rl.fromProfileName} /> : rl.fromProfileName?.slice(0,1) || '?'}
                </div>
                <div className="mp-received-info">
                  <b>{rl.fromProfileName}</b>
                  <span>{rl.fromRank} · {rl.fromRole}</span>
                </div>
                <button className="mp-accept-btn" onClick={() => handleAcceptLike(rl.id)} disabled={acceptingLikeId === rl.id}>{acceptingLikeId === rl.id ? '送信中' : 'いいねを返す'}</button>
              </div>
            )) : <p className="mp-received-empty">まだ届いたいいねはありません。</p>}
          </div>
        </div>

      {/* フィルター行 */}
      <div className="mp-filter-row">
        <label htmlFor="gender-filter" className="mp-filter-label">表示</label>
        <select id="gender-filter" className="mp-filter-select" disabled={genderFilterLocked} value={targetGender} onChange={(e) => setTargetGender(e.target.value)} aria-label="表示する性別を選択">
          <option value="all">すべて</option>
          <option value="女性">女性</option>
          <option value="男性">男性</option>
          <option value="その他/未設定">その他</option>
        </select>
        {genderFilterLocked && <span className="mp-lock-hint" aria-label="性別フィルターはPLUSまたはVIPプランで解放できます">PLUS/VIPで解放</span>}
      </div>

      {/* プロフィールカード */}
      <div className="mp-card-wrap">
        {current ? (
          <TinderProfileCard key={current.id} profile={current} onReport={reportCurrent} onBlock={blockCurrent} swipeDir={swipeDir} onOpenProfile={setDetailProfile} />
        ) : (
          <div className="mp-empty" role="status" aria-live="polite">
            <h3>候補がなくなりました</h3>
            <p>条件を変えるか、時間をおいて再読み込みしてください。</p>
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className="mp-actions">
        <button className="mp-btn mp-btn-pass mp-btn-lg" onClick={() => handleSwipe('pass')} aria-label="見送る" disabled={actionBusy || !current}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button className="mp-btn mp-btn-like mp-btn-lg" onClick={() => handleSwipe('like')} aria-label="いいね" disabled={actionBusy || !current}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      {detailProfile && <ProfileDetailModal profile={detailProfile} onClose={() => setDetailProfile(null)} />}
    </div>
  );
}

function TinderProfileCard({ profile, onReport, onBlock, swipeDir, onOpenProfile }) {
  const tags = profile.tags?.length ? profile.tags : profile.modes || [];
  const roleTone = profile.role === 'デュエリスト' ? 'duelist'
    : profile.role === 'イニシエーター' ? 'initiator'
      : profile.role === 'コントローラー' ? 'controller'
        : profile.role === 'センチネル' ? 'sentinel'
          : 'default';
  return (
    <article className={cx('mp-card', swipeDir && `mp-swipe-${swipeDir}`)}>
      {profile.profilePhoto
        ? <img className="mp-photo" src={profile.profilePhoto} alt={profile.name} loading="lazy" decoding="async" />
        : <div className={cx('mp-photo-placeholder', `role-${roleTone}`)}>
          <div className="mp-placeholder-frame">
            <span>{profile.name.slice(0,1).toUpperCase()}</span>
            <b>{profile.role || 'ROLE'}</b>
          </div>
        </div>
      }
      <div className="mp-gradient" />

      {swipeDir === 'right' && <div className="mp-stamp mp-stamp-like">LIKE</div>}
      {swipeDir === 'left'  && <div className="mp-stamp mp-stamp-nope">NOPE</div>}
      {swipeDir === 'up'    && <div className="mp-stamp mp-stamp-super">SUPER</div>}

      <div className="mp-badges-top">
        <span className="mp-badge mp-badge-score">相性 {profile.matchScore}%</span>
      </div>

      <div className="mp-card-info">
        <div className="mp-active-row"><span className="mp-active-dot"/><span>最近アクティブ</span></div>
        <div className="mp-name-row">
          <button type="button" className="mp-name-button" onClick={(event) => { event.stopPropagation(); onOpenProfile?.(profile); }}>{profile.name}</button>
          <span className="mp-age">{profile.ageRange}</span>
        </div>
        <p className="mp-meta">{profile.rank} · {profile.role}</p>
        <p className="mp-meta">{profile.gender}{profile.region ? ` · ${profile.region}` : ''}</p>
        {tags.length > 0 && <div className="mp-tags">{tags.slice(0,4).map((t) => <span className="mp-tag" key={t}>{t}</span>)}</div>}
        {profile.bio && <p className="mp-bio">{profile.bio}</p>}
        <VoiceIntroPlayer src={profile.voiceIntro} compact />
      </div>

      <div className="mp-card-tools">
        <button className="mp-tool-btn" onClick={onReport}>通報</button>
        <button className="mp-tool-btn" onClick={onBlock}>ブロック</button>
      </div>
    </article>
  );
}

function ProfileCard({ profile, onReport, onBlock }) {
  return <TinderProfileCard profile={profile} onReport={onReport} onBlock={onBlock} />;
}

function ProfileDetailModal({ profile, onClose }) {
  const tags = Array.isArray(profile.tags) ? profile.tags : [];
  const modes = Array.isArray(profile.modes) ? profile.modes : [];
  const agentsList = Array.isArray(profile.agents) ? profile.agents : [];
  const reasons = Array.isArray(profile.reasons) ? profile.reasons : [];
  const voiceLabel = profile.voice || (profile.voiceIntro ? '声の自己紹介あり' : '未設定');
  const detailItems = [
    ['現在ランク', profile.rank || 'Unranked'],
    ['最高ランク', profile.peakRank || '未設定'],
    ['ロール', profile.role || 'ロール未設定'],
    ['活動時間', profile.activeTime || '未設定'],
    ['VC', voiceLabel],
    ['信頼度', profile.trust ? `${profile.trust}%` : profile.verified ? '認証済み' : '未設定']
  ];
  return <div className="profile-detail-modal" role="dialog" aria-modal="true">
    <button className="profile-detail-scrim" type="button" aria-label="閉じる" onClick={onClose}></button>
    <section className="profile-detail-panel">
      <button className="profile-detail-close" type="button" onClick={onClose}>×</button>
      <div className="profile-detail-hero">
        {profile.profilePhoto
          ? <img src={profile.profilePhoto} alt={profile.name} loading="lazy" decoding="async" />
          : <div className="profile-detail-fallback">{profile.name?.slice(0, 1) || 'P'}</div>}
      </div>
      <div className="profile-detail-body">
        <div className="profile-detail-head">
          <div>
            <h2>{profile.name}</h2>
            <p>{profile.gender}{profile.ageRange ? ` / ${profile.ageRange}` : ''}{profile.region ? ` / ${profile.region}` : ''}</p>
          </div>
          <span>相性 {profile.matchScore}%</span>
        </div>
        <div className="profile-detail-kpis">
          {detailItems.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
        </div>
        {tags.length > 0 && <div className="profile-detail-block">
          <strong>目的タグ</strong>
          <div className="profile-detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>}
        {modes.length > 0 && <div className="profile-detail-block">
          <strong>プレイスタイル</strong>
          <div className="profile-detail-tags is-muted">{modes.map((mode) => <span key={mode}>{mode}</span>)}</div>
        </div>}
        {agentsList.length > 0 && <div className="profile-detail-block">
          <strong>よく使うキャラ</strong>
          <div className="profile-detail-tags is-plain">{agentsList.map((agent) => <span key={agent}>{agent}</span>)}</div>
        </div>}
        <div className="profile-detail-block"><strong>自己紹介</strong><p>{profile.bio || '自己紹介は未入力です。'}</p></div>
        {profile.xHandle && <div className="profile-detail-block"><strong>X</strong><a className="profile-detail-link" href={`https://x.com/${profile.xHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" aria-label={`${profile.name}のXプロフィールを開く`}>@{profile.xHandle.replace(/^@/, '')}</a></div>}
        {profile.opener && <div className="profile-detail-note"><strong>話しかけるきっかけ</strong><p>{profile.opener}</p></div>}
        {reasons.length > 0 && <div className="profile-detail-block">
          <strong>相性が高い理由</strong>
          <ul className="profile-detail-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </div>}
        <VoiceIntroPlayer src={profile.voiceIntro} />
      </div>
    </section>
  </div>;
}

function VoiceIntroPlayer({ src, compact = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  if (compact) {
    const toggleAudio = (event) => {
      event.stopPropagation();
      if (!src) return;
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) audio.play().then(() => setPlaying(true)).catch(() => null);
      else {
        audio.pause();
        setPlaying(false);
      }
    };
    return <div className="voice-intro-player compact">
      <button type="button" className={cx('voice-chip', playing && 'playing', !src && 'empty')} onClick={toggleAudio} aria-label={src ? '声の自己紹介を再生' : '声の自己紹介はありません'} disabled={!src}>
        <span className="voice-chip-icon">{!src ? '-' : playing ? 'Ⅱ' : '▶'}</span>
        <span className="voice-chip-text">{!src ? '声がない' : playing ? '再生中' : '声を聞く'}</span>
        <i></i><i></i><i></i>
      </button>
      {src && <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />}
    </div>;
  }
  if (!src) return null;
  return <div className={cx('voice-intro-player', compact && 'compact')}>
    <span>声の自己紹介</span>
    <audio src={src} controls />
  </div>;
}

const dmStarters = ['よろしくお願いします！', '何時ごろ遊べますか？', 'ランク一緒に行きませんか？'];

function profileFromMatch(match) {
  return {
    id: match.profileId,
    name: match.profileName,
    profilePhoto: match.profilePhoto || '',
    rank: match.profileRank || '未設定',
    role: match.profileRole || '未設定',
    gender: match.profileGender || '',
    ageRange: match.profileAgeRange || '',
    region: match.profileRegion || '',
    matchScore: 100,
    opener: match.opener || `${match.profileName}さんとマッチしました！`,
    bio: match.profileBio || 'DMで会話しながら相性を確かめましょう。'
  };
}

function DmPanel({ dmThreads, activeThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, reportProfile, blockProfile }) {
  const activeThread = dmThreads.find((thread) => thread.match.id === activeThreadId) || dmThreads[0];
  const [detailProfile, setDetailProfile] = useState(null);
  useEffect(() => {
    if (activeThread?.match.id) markDmRead(activeThread.match.id);
  }, [activeThread?.match.id]);
  const hasUserMessage = Boolean(activeThread?.messages?.some((message) => message.sender === 'user' && !message.system));
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
          <div className="avatar small">{activeThread.match.profilePhoto ? <img src={activeThread.match.profilePhoto} alt="" loading="lazy" decoding="async" /> : activeThread.match.profileName?.slice(0, 1) || 'P'}</div>
          <div><h3>{activeThread.match.profileName}</h3><span>メッセージ解放済み</span></div>
          <div className="dm-head-actions">
            <button type="button" onClick={() => setDetailProfile(profileFromMatch(activeThread.match))}>プロフィール</button>
            <button type="button" onClick={() => reportProfile(activeThread.match.profileId, activeThread.match.profileName)}>通報</button>
            <button type="button" className="danger" onClick={() => blockProfile(activeThread.match.profileId, activeThread.match.profileName)}>ブロック</button>
          </div>
        </div>
        <div className="dm-messages" data-copyable>
          {activeThread.messages.map((message) => <div className={cx('dm-bubble', message.sender === 'user' && 'mine')} key={message.id}>
            <p>{message.body}</p>
            <div className="dm-message-meta">
              {message.sender === 'user' && <span className={cx('dm-read-state', message.readAt && 'read')}>{message.readAt ? '既読' : '未読'}</span>}
              <time>{new Date(message.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            </div>
          </div>)}
        </div>
        {!hasUserMessage && <div className="dm-starters">
          {dmStarters.map((starter) => <button type="button" key={starter} onClick={() => setDmDraft(starter)}>{starter}</button>)}
        </div>}
        <form className="dm-form" onSubmit={sendDm}>
          <input value={dmDraft} maxLength="500" onChange={(e) => setDmDraft(e.target.value)} placeholder="メッセージを入力" />
          <button className="primary" type="submit" disabled={dmSending || !dmDraft.trim()}>{dmSending ? '送信中' : '送信'}</button>
        </form>
        {detailProfile && <ProfileDetailModal profile={detailProfile} onClose={() => setDetailProfile(null)} />}
      </> : <div className="locked-panel"><h3>メッセージはマッチ後に解放</h3><p>お互いにいいねすると、ここに1対1の会話が表示されます。</p></div>}
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

function ProfilePanel({ user }) { return <div className="list-panel"><h3>プロフィール</h3><div className="profile-preview expanded"><div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0,1) || 'P'}</div><b>{user.name}</b><span>{user.gender} / {user.age ? `${user.age}歳` : '年齢未設定'} / {user.region || '地域未設定'}</span><span data-copyable>{user.riotId} / {user.rank} / {user.role}</span>{Boolean(user.tags?.length) && <div className="tag-row">{user.tags.map((tag) => <span className="intent-tag" key={tag}>{tag}</span>)}</div>}<p>{user.bio || '自己紹介は未入力です。'}</p><VoiceIntroPlayer src={user.voiceIntro} /></div></div>; }
function SafetyCompact() { return <div className="list-panel"><h3>安全・規約</h3><TermsList /></div>; }
function Safety() { return <section id="safety" className="section narrow"><div className="section-head"><span>安全</span><h2>安全・規約</h2></div><TermsList /></section>; }
function TermsList() { return <div className="terms-list"><article><h3>利用開始による同意</h3><p>本サービスを閲覧、登録、ログイン、いいね、マッチング、メッセージ、通報、課金、外部SNS連携などで使用した時点で、利用規約に同意したものとみなします。</p></article><article><h3>免責</h3><p>ユーザー間のメッセージ、ボイスチャット、ゲームプレイ、外部SNS、金銭・人間関係トラブルは原則ユーザー同士で解決するものとします。ただし法令上免責できない場合、運営の故意または重大な過失は除きます。</p></article><article><h3>禁止事項</h3><p>暴言、脅迫、差別、セクハラ、恋愛/性的関係やオフライン接触の強要、年齢詐称、なりすまし、チート、アカウント売買、晒し、詐欺、外部決済誘導を禁止します。</p></article><article><h3>非公式表記</h3><p>PairlyはRiot Games公式サービスではありません。VALORANTおよび関連商標はRiot Games, Inc.に帰属します。</p></article></div>; }
function AdminPanel({ reports }) { return <div className="list-panel"><h3>通報管理</h3>{reports.length ? reports.map((r) => <div className="list-row" key={r.id}><b>{r.reason}</b><p>プロフィール: {r.profileId || '-'}</p><span>{r.status}</span></div>) : <p className="empty-text">通報はありません。</p>}</div>; }
function Footer() { return <footer className="footer"><img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" width="110" height="37" loading="lazy" decoding="async" /><p>使用した時点で利用規約に同意したものとみなします。PairlyはRiot Games公式サービスではありません。</p></footer>; }

createRoot(document.getElementById('root')).render(<App />);
