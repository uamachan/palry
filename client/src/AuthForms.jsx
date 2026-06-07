import React, { useEffect, useRef, useState } from 'react';
import { cx, ranks, roles, agents, intentTags, regions, resizePhoto } from './constants.jsx';

function AuthModal({ children, onClose, size }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    function esc(e) {
      if (e.key === 'Escape') onCloseRef.current();
    }
    panel.addEventListener('keydown', trap);
    document.addEventListener('keydown', esc);
    return () => {
      panel.removeEventListener('keydown', trap);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  return (
    <div className={cx('auth-modal', size === 'profile' && 'auth-modal--profile')} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <button className="auth-scrim" type="button" aria-label="モーダルを閉じる" onClick={onClose}></button>
      <div ref={panelRef} className={cx('auth-modal-panel', size === 'narrow' && 'auth-modal-panel--narrow', size === 'profile' && 'auth-modal-panel--profile')}>
        <button className="auth-close" type="button" aria-label="閉じる" onClick={onClose}>×</button>
        {children}
      </div>
    </div>
  );
}

function AuthEntrySection({ onShowRegister, onShowLogin, onGoogle }) {
  return (
    <section className="email-signup-panel auth-entry-panel">
      <div className="email-signup-header">
        <h2 id="auth-modal-title">Pairlyへようこそ</h2>
        <p>VALORANTの相方を見つけよう</p>
      </div>
      <div className="email-signup-actions">
        <button type="button" className="primary" onClick={onShowRegister}>無料で新規登録</button>
        <button type="button" className="secondary google-button" onClick={onGoogle}>Googleで続ける</button>
        <button type="button" className="secondary" onClick={onShowLogin}>ログイン（登録済みの方）</button>
      </div>
    </section>
  );
}

function LoginSection({ form, setForm, onLogin, onGoogle, onResetPassword, onShowRegister }) {
  return (
    <section className="email-signup-panel">
      <div className="email-signup-header">
        <span className="eyebrow">ログイン</span>
        <h2 id="auth-modal-title">ログイン</h2>
        <p>メールアドレスとパスワードでログインします。メール未確認の場合はFirebaseの確認メールが必要です。</p>
      </div>
      <form className="email-signup-form signup-card" autoComplete="on" onSubmit={(e) => { e.preventDefault(); onLogin(e); }}>
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
    </section>
  );
}

function AccountSignupSection({ form, setForm, onSubmit, onGoogle, onShowLogin }) {
  return (
    <section className="email-signup-panel">
      <div className="email-signup-header">
        <span className="eyebrow">アカウント作成</span>
        <h2 id="auth-modal-title">メール登録</h2>
        <p>まずメールアドレスとパスワードを登録します。登録後にメール認証へ進みます。</p>
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
          <button type="submit" className="primary">確認メールを送る</button>
          <button type="button" className="secondary google-button" onClick={onGoogle}>Googleで続ける</button>
          <button type="button" className="plain reset-password-link" onClick={onShowLogin}>すでにアカウントがある方はこちら</button>
        </div>
      </form>
    </section>
  );
}

function EmailVerificationSection({ pendingEmail, onCheck, onResend, onShowLogin }) {
  return (
    <section className="email-signup-panel verification-panel">
      <div className="email-signup-header">
        <span className="eyebrow">メール認証</span>
        <h2 id="auth-modal-title">メールを確認してください</h2>
        <p>{pendingEmail || '登録メールアドレス'} に確認メールを送信しました。リンクを開いたあと、この画面へ戻ってください。</p>
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
    </section>
  );
}

function CustomSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx('custom-select-field', open && 'open')} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <span>{label}</span>
      <button type="button" className="custom-select-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((c) => !c)}>
        <b>{value}</b>
        <i></i>
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" tabIndex={-1}>
          {options.map((option) => (
            <button
              type="button"
              key={option}
              role="option"
              aria-selected={option === value}
              className={option === value ? 'selected' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(option); setOpen(false); }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeAgeInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 2);
  if (!digits) return '';
  const age = Number(digits);
  if (age > 80) return '80';
  return digits;
}

function isValidAge(value) {
  const age = Number(value);
  return Number.isInteger(age) && age >= 13 && age <= 80;
}

function SignupForm({ form, setForm, onSubmit, onShowLogin, showToast, submitLabel = 'プロフィールを完成する', cancelLabel = 'ログインに戻る', showAgreement = true }) {
  const tabs = ['基本情報', 'ランク', 'プレイスタイル', '自己紹介', ...(showAgreement ? ['規約'] : [])];
  const [activeSetupTab, setActiveSetupTab] = useState(tabs[0]);
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [setupError, setSetupError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordTimerRef = useRef(null);

  const activeIndex = Math.max(0, tabs.indexOf(activeSetupTab));
  const isLastStep = activeIndex === tabs.length - 1;
  const progress = Math.round(((activeIndex + 1) / tabs.length) * 100);

  const toggleAgent = (agent) => setForm((f) => ({
    ...f,
    agents: f.agents.includes(agent) ? f.agents.filter((a) => a !== agent) : [...f.agents, agent].slice(0, 5)
  }));
  const toggleTag = (tag) => setForm((f) => ({
    ...f,
    tags: f.tags.includes(tag) ? f.tags.filter((item) => item !== tag) : [...f.tags, tag].slice(0, 4)
  }));

  useEffect(() => () => {
    clearTimeout(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (setupError && !validateStep()) setSetupError('');
  }, [activeSetupTab, form.name, form.riotId, form.age, form.region, form.gender, form.rank, form.role, form.tags, form.agents, form.agreed]);

  function notifyRequired(message) {
    const notice = message.startsWith('入力が必要です') ? message : `入力が必要です：${message}`;
    setSetupError(notice);
    showToast?.(notice);
  }

  function validateStep(tab = activeSetupTab) {
    if (tab === '基本情報') {
      if (!form.name?.trim()) return '表示名';
      if (!form.riotId?.trim()) return 'Riot ID';
      if (!form.age) return '年齢';
      if (!isValidAge(form.age)) return '年齢は13〜80歳で入力';
      if (!form.region) return '地域';
      if (!form.gender) return '性別';
    }
    if (tab === 'ランク') {
      if (!form.rank) return '現在ランク';
      if (!form.role) return 'メインロール';
    }
    if (tab === 'プレイスタイル' && (!form.tags?.length && !form.agents?.length)) return '目的タグ または よく使うエージェント';
    if (tab === '規約' && showAgreement && !form.agreed) return '利用規約への同意';
    return '';
  }

  function validateAllSteps() {
    for (const tab of tabs) {
      const error = validateStep(tab);
      if (error) {
        setActiveSetupTab(tab);
        return error;
      }
    }
    return '';
  }

  function goNext() {
    const error = validateStep();
    if (error) return notifyRequired(error);
    setSetupError('');
    const nextIndex = Math.min(activeIndex + 1, tabs.length - 1);
    setMaxUnlockedIndex((current) => Math.max(current, nextIndex));
    setActiveSetupTab(tabs[nextIndex]);
  }

  function goPrev() {
    setSetupError('');
    const prevIndex = Math.max(activeIndex - 1, 0);
    setActiveSetupTab(tabs[prevIndex]);
  }

  function goToStep(index) {
    if (index <= maxUnlockedIndex) {
      setSetupError('');
      return setActiveSetupTab(tabs[index]);
    }
    if (index === maxUnlockedIndex + 1 && index === activeIndex + 1) return goNext();
    notifyRequired('前の項目から順番に設定');
  }

  function handleProfileSubmit(e) {
    e.preventDefault();
    if (!isLastStep) return goNext();
    const error = validateAllSteps();
    if (error) return notifyRequired(error);
    setSetupError('');
    onSubmit({ preventDefault: () => {} });
  }

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert('このブラウザは音声録音に対応していません。');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return alert('マイクの許可が必要です。ブラウザの権限を確認してください。'); }
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
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

  async function selectPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizePhoto(file);
      setForm((current) => ({ ...current, profilePhoto: dataUrl }));
      showToast?.('プロフィール写真を設定しました');
    } catch {
      showToast?.('画像の読み込みに失敗しました');
    }
  }

  return (
    <section className="email-signup-panel profile-setup-panel">
      <div className="email-signup-header profile-setup-heading">
        <span className="eyebrow">プロフィール設定</span>
        <h2 id="auth-modal-title">プロフィールを作成</h2>
        <p>上から順番に1つずつ設定します。未入力のまま次へ進むと、必要な項目を通知します。</p>
      </div>

      <form className="email-signup-form signup-card profile-setup-card" onSubmit={handleProfileSubmit} noValidate>
        <div className="setup-progress" aria-label={`プロフィール設定の進捗 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        <div className="setup-tabs" role="tablist" aria-label="プロフィール設定ステップ">
          {tabs.map((tab, index) => (
            <button key={tab} type="button" className={cx(activeSetupTab === tab && 'active', index > maxUnlockedIndex + 1 && 'locked')} onClick={() => goToStep(index)}>
              {index + 1}. {tab}
            </button>
          ))}
        </div>
        {setupError && <div className="setup-error" id="setup-error" role="alert" aria-live="assertive">{setupError}</div>}

        {activeSetupTab === '基本情報' && <div className="setup-grid two">
          <label className="email-field-label"><span>表示名</span><input required value={form.name} maxLength="40" aria-invalid={Boolean(setupError) && !form.name?.trim()} aria-describedby={setupError ? 'setup-error' : undefined} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：Pairlyちゃん" /></label>
          <label className="email-field-label"><span>Riot ID</span><input required value={form.riotId} maxLength="60" aria-invalid={Boolean(setupError) && !form.riotId?.trim()} aria-describedby={setupError ? 'setup-error' : undefined} onChange={(e) => setForm({ ...form, riotId: e.target.value })} placeholder="例：name#JP1" data-copyable /></label>
          <label className="email-field-label"><span>年齢</span><input required type="number" inputMode="numeric" min="13" max="80" maxLength="2" aria-invalid={Boolean(setupError) && (!form.age || !isValidAge(form.age))} aria-describedby={setupError ? 'setup-error' : undefined} value={form.age} onChange={(e) => setForm({ ...form, age: normalizeAgeInput(e.target.value) })} onBlur={() => { if (form.age && !isValidAge(form.age)) setForm({ ...form, age: '' }); }} placeholder="13〜80" /></label>
          <label className="email-field-label"><span>地域</span><select required value={form.region} aria-invalid={Boolean(setupError) && !form.region} aria-describedby={setupError ? 'setup-error' : undefined} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="">選択してください</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
          <div className="gender-select-block"><span>性別（必須）</span><div className="gender-options">
            {['男性', '女性', 'その他/未設定'].map((gender) => <button key={gender} type="button" className={form.gender === gender ? 'selected' : ''} onClick={() => setForm({ ...form, gender })}>{gender}</button>)}
          </div></div>
          <label className="photo-upload-card">
            <span className="photo-upload-preview">{form.profilePhoto ? <img src={form.profilePhoto} alt="プロフィール写真プレビュー" /> : <b>{form.name?.slice(0, 1) || '+'}</b>}</span>
            <span className="photo-upload-copy"><strong>プロフィール写真</strong><em>{form.profilePhoto ? '写真を変更する' : '写真を追加する'}</em><small>JPG/PNG推奨・自動で軽量化します</small></span>
            <input type="file" accept="image/*" onChange={selectPhoto} />
          </label>
        </div>}

        {activeSetupTab === 'ランク' && <div className="setup-grid two">
          <CustomSelect label="現在ランク" value={form.rank} options={ranks} onChange={(rank) => setForm({ ...form, rank })} />
          <CustomSelect label="メインロール" value={form.role} options={roles} onChange={(role) => setForm({ ...form, role })} />
        </div>}

        {activeSetupTab === 'プレイスタイル' && <div className="setup-stack">
          <div><span className="field-caption">目的タグ（最大4つ）</span><div className="tag-choice-grid">{intentTags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></div>
          <div><span className="field-caption">よく使うエージェント（最大5つ）</span><div className="tag-choice-grid compact">{agents.map((agent) => <button type="button" key={agent} className={form.agents.includes(agent) ? 'selected' : ''} onClick={() => toggleAgent(agent)}>{agent}</button>)}</div></div>
        </div>}

        {activeSetupTab === '自己紹介' && <div className="setup-stack">
          <label className="email-field-label"><span>Xアカウント（任意）</span><input value={form.xHandle} maxLength="40" onChange={(e) => setForm({ ...form, xHandle: e.target.value })} placeholder="@pairly" /></label>
          <label className="email-field-label"><span>自己紹介</span><textarea value={form.bio} maxLength="240" onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="遊ぶ時間、VC、募集したい相手など" /></label>
          <div className="voice-record-box"><div><b>声の自己紹介</b><p>任意で20秒まで録音できます。声を載せると雰囲気が伝わりやすくなります。</p></div><button type="button" className={isRecordingVoice ? 'danger' : 'secondary'} onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}>{isRecordingVoice ? '録音停止' : '録音する'}</button>{form.voiceIntro && <span>録音済み</span>}</div>
        </div>}

        {activeSetupTab === '規約' && <div className="setup-stack terms-box">
          <h3>利用ルール</h3><p>迷惑行為、なりすまし、外部誘導、Riot Gamesの規約に反する行為は禁止です。PairlyはRiot Games公式サービスではありません。</p>
          <label className="terms-check"><input type="checkbox" checked={form.agreed} onChange={(e) => setForm({ ...form, agreed: e.target.checked })} /> <span>利用規約と禁止事項に同意します</span></label>
        </div>}

        <div className="email-signup-actions profile-setup-actions">
          <button type="button" className="secondary" onClick={goPrev} disabled={activeIndex === 0}>戻る</button>
          {!isLastStep && <button type="button" className="secondary" onClick={goNext}>次へ</button>}
          {isLastStep && <button type="submit" className="primary">{submitLabel}</button>}
          <button type="button" className="plain reset-password-link" onClick={onShowLogin}>{cancelLabel}</button>
        </div>
      </form>
    </section>
  );
}

export default function AuthFormsContainer(props) {
  const {
    isAuthed, profileEditorOpen, setProfileEditorOpen, user, editForm, setEditForm,
    saveProfileEdit, showToast, authMode, setAuthMode, showAuth, form, setForm,
    pendingFirebaseUser, createAccount, register, continueWithGoogle, loginWithFirebase,
    resendVerificationEmail, confirmEmailVerified, resetPassword
  } = props;

  return <>
    {profileEditorOpen && isAuthed && (
      <AuthModal size="profile" onClose={() => setProfileEditorOpen(false)}>
        <SignupForm form={editForm} setForm={setEditForm} onSubmit={saveProfileEdit} onShowLogin={() => setProfileEditorOpen(false)} showToast={showToast} submitLabel="プロフィールを保存" cancelLabel="閉じる" showAgreement={false} />
      </AuthModal>
    )}

    {authMode && !profileEditorOpen && (
      <AuthModal size={authMode === 'profileSetup' ? 'profile' : 'narrow'} onClose={() => setAuthMode(null)}>
        {authMode === 'entry' && <AuthEntrySection onShowRegister={() => showAuth('register')} onShowLogin={() => showAuth('login')} onGoogle={continueWithGoogle} />}
        {authMode === 'register' && <AccountSignupSection form={form} setForm={setForm} onSubmit={createAccount} onGoogle={continueWithGoogle} onShowLogin={() => showAuth('login')} />}
        {authMode === 'emailVerification' && <EmailVerificationSection pendingEmail={pendingFirebaseUser?.email} onCheck={confirmEmailVerified} onResend={resendVerificationEmail} onShowLogin={() => showAuth('login')} />}
        {authMode === 'profileSetup' && <SignupForm form={form} setForm={setForm} onSubmit={register} onShowLogin={() => showAuth('login')} showToast={showToast} />}
        {authMode === 'login' && <LoginSection form={form} setForm={setForm} onLogin={loginWithFirebase} onGoogle={continueWithGoogle} onResetPassword={resetPassword} onShowRegister={() => showAuth('register')} />}
      </AuthModal>
    )}
  </>;
}
