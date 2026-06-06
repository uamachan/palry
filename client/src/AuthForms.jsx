import React, { useEffect, useRef, useState } from 'react';
import { cx, ranks, roles, agents, intentTags, regions, resizePhoto } from './constants.jsx';

// ─── AuthModal ────────────────────────────────────────────────────
function AuthModal({ children, onClose, size }) {
  const panelRef = useRef(null);

  // フォーカストラップ: モーダル内に留まらせる
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const getFocusable = () => panel.querySelectorAll(
      'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'
    );
    getFocusable()[0]?.focus();
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
    function esc(e) { if (e.key === 'Escape') onClose(); }
    panel.addEventListener('keydown', trap);
    document.addEventListener('keydown', esc);
    return () => {
      panel.removeEventListener('keydown', trap);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

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

// ─── AuthEntrySection ─────────────────────────────────────────────
function AuthEntrySection({ onShowRegister, onShowLogin, onGoogle }) {
  return (
    <section className="email-signup-panel auth-entry-panel">
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
    </section>
  );
}

// ─── LoginSection ─────────────────────────────────────────────────
function LoginSection({ form, setForm, onLogin, onGoogle, onResetPassword, onShowRegister }) {
  return (
    <section className="email-signup-panel">
      <div className="email-signup-header">
        <span className="eyebrow">ログイン</span>
        <h2 id="auth-modal-title">ログイン</h2>
        <p>メールアドレスとパスワードでログインします。メール未確認の場合はFirebaseの確認メールが必要です。</p>
      </div>
      <form className="email-signup-form signup-card" autoComplete="on" onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
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

// ─── AccountSignupSection ─────────────────────────────────────────
function AccountSignupSection({ form, setForm, onSubmit, onGoogle, onShowLogin }) {
  return (
    <section className="email-signup-panel">
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
    </section>
  );
}

// ─── EmailVerificationSection ─────────────────────────────────────
function EmailVerificationSection({ pendingEmail, onCheck, onResend, onShowLogin }) {
  return (
    <section className="email-signup-panel verification-panel">
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
    </section>
  );
}

// ─── CustomSelect ─────────────────────────────────────────────────
function CustomSelect({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cx('custom-select-field', open && 'open')}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
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

// ─── SignupForm ───────────────────────────────────────────────────
function SignupForm({ form, setForm, onSubmit, onShowLogin, showToast, submitLabel = '無料でアカウント作成', cancelLabel = 'ログインに戻る', showAgreement = true }) {
  const tabs = ['基本情報', 'ランク', 'プレイスタイル', '自己紹介', ...(showAgreement ? ['規約'] : [])];
  const [activeSetupTab, setActiveSetupTab] = useState(tabs[0]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [submitAfterAgree, setSubmitAfterAgree] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordTimerRef = useRef(null);

  const toggleAgent = (agent) => setForm((f) => ({
    ...f, agents: f.agents.includes(agent) ? f.agents.filter((a) => a !== agent) : [...f.agents, agent].slice(0, 5)
  }));
  const toggleTag = (tag) => setForm((f) => ({
    ...f, tags: f.tags.includes(tag) ? f.tags.filter((item) => item !== tag) : [...f.tags, tag].slice(0, 4)
  }));

  // クリーンアップ: コンポーネントアンマウント時に録音を停止
  useEffect(() => () => {
    clearTimeout(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  // チェックボックス同意後に自動送信
  useEffect(() => {
    if (submitAfterAgree && form.agreed) {
      setSubmitAfterAgree(false);
      onSubmit({ preventDefault: () => {} });
    }
  }, [submitAfterAgree, form.agreed]);

  async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return alert('このブラウザは音声録音に対応していません。');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return alert('マイクの許可が必要です。ブラウザの権限を確認してください。'); }
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    streamRef.current = stream;
    recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => setForm((c) => ({ ...c, voiceIntro: String(reader.result || '') }));
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
      const photo = await resizePhoto(file);
      setForm((c) => ({ ...c, profilePhoto: photo }));
    } catch { alert('写真の読み込みに失敗しました。別の画像を選んでください。'); }
  }

  const currentTabIndex = tabs.indexOf(activeSetupTab);
  const isLastTab = currentTabIndex === tabs.length - 1;
  const isAgreementTab = activeSetupTab === '規約';
  const basicInfoComplete = Boolean(form.name && form.gender && form.riotId && form.age && form.region);

  function goToTab(label) {
    if (tabs.indexOf(label) > 0 && !basicInfoComplete) {
      showToast?.('基本情報（表示名・性別・Riot ID・年齢・地域）をすべて入力してください');
      return;
    }
    setActiveSetupTab(label);
  }
  function goNext() { if (!isLastTab) goToTab(tabs[currentTabIndex + 1]); }
  function handleAgreementChange(e) {
    const agreed = e.target.checked;
    setForm({ ...form, agreed });
    setSubmitAfterAgree(agreed);
  }

  return (
    <form className="signup-card profile-setup-card" onSubmit={onSubmit}>
      <div className="setup-tabs" role="tablist">
        {tabs.map((label) => (
          <button type="button" role="tab" key={label} className={activeSetupTab === label ? 'active' : ''} aria-selected={activeSetupTab === label} onClick={() => goToTab(label)}>{label}</button>
        ))}
      </div>
      <div className="setup-pane">
        {activeSetupTab === '基本情報' && (
          <div className="profile-setup-grid">
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
              <label>地域<select required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="">選択してください</option>{regions.map((r) => <option key={r}>{r}</option>)}</select></label>
              <label>X<input value={form.xHandle} onChange={(e) => setForm({ ...form, xHandle: e.target.value })} placeholder="@pairly_user" /></label>
            </div>
          </div>
        )}
        {activeSetupTab === 'ランク' && (
          <div className="setup-fields setup-tab-grid">
            <CustomSelect label="ランク" value={form.rank} options={ranks} onChange={(rank) => setForm({ ...form, rank })} />
            <CustomSelect label="メインロール" value={form.role} options={roles} onChange={(role) => setForm({ ...form, role })} />
          </div>
        )}
        {activeSetupTab === 'プレイスタイル' && (
          <>
            <fieldset className="intent-fieldset"><legend>目的タグ（4つまで）</legend><div className="chip-list intent-chip-list">{intentTags.map((tag) => <button type="button" key={tag} className={form.tags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></fieldset>
            <fieldset className="agent-fieldset"><legend>よく使うキャラクター（5体まで）</legend><div className="chip-list">{agents.map((agent) => <button type="button" key={agent} className={form.agents.includes(agent) ? 'selected' : ''} onClick={() => toggleAgent(agent)}>{agent}</button>)}</div></fieldset>
          </>
        )}
        {activeSetupTab === '自己紹介' && (
          <div className="setup-intro-pane">
            <label className="setup-bio">自己紹介<textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="プレイ時間、VC、雰囲気、NGなことなど" /></label>
            <div className="voice-recorder">
              <div><b>声の自己紹介</b><span>最大20秒。カード上で相手が再生できます。</span></div>
              <div className="voice-actions">
                {!isRecordingVoice
                  ? <button type="button" className="secondary" onClick={startVoiceRecording}>{form.voiceIntro ? '録り直す' : '録音する'}</button>
                  : <button type="button" className="primary" onClick={stopVoiceRecording}>録音停止</button>}
                {form.voiceIntro && <button type="button" className="secondary" onClick={() => setForm((c) => ({ ...c, voiceIntro: '' }))}>削除</button>}
              </div>
              {isRecordingVoice && <p className="voice-status">録音中...</p>}
              {form.voiceIntro && <audio className="voice-player" src={form.voiceIntro} controls />}
            </div>
          </div>
        )}
        {activeSetupTab === '規約' && showAgreement && (
          <label className="check">
            <input type="checkbox" checked={form.agreed} onChange={handleAgreementChange} />
            本サービスを閲覧・登録・ログイン・いいね・マッチング・メッセージ・通報・課金・外部SNS連携などで使用した時点で利用規約に同意したものとみなします。登録時にも規約へ同意します。
          </label>
        )}
      </div>
      <div className="form-actions">
        {!isAgreementTab && !isLastTab && <button type="button" className="primary" onClick={goNext}>次へ</button>}
        {(!showAgreement || isLastTab) && !isAgreementTab && <button className="primary" type="submit">{submitLabel}</button>}
        <button type="button" className="secondary" onClick={onShowLogin}>{cancelLabel}</button>
      </div>
    </form>
  );
}

// ─── SignupSection ────────────────────────────────────────────────
function SignupSection({ form, setForm, pendingEmail, onSubmit, onShowLogin, showToast }) {
  return (
    <section className="setup-profile-section">
      <div className="setup-title">
        <span>プロフィール設定</span>
        <h2 id="auth-modal-title">プロフィール設定</h2>
        {pendingEmail && <p className="registered-email">登録メール: {pendingEmail}</p>}
      </div>
      <SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onShowLogin} showToast={showToast} />
    </section>
  );
}

// ─── ProfileEditSection ───────────────────────────────────────────
function ProfileEditSection({ form, setForm, user, onSubmit, onCancel, showToast }) {
  return (
    <section className="setup-profile-section profile-edit-section">
      <div className="setup-title">
        <span>アカウント</span>
        <h2 id="auth-modal-title">プロフィール編集</h2>
        <p className="registered-email">ログイン中: {user.email || user.name}</p>
      </div>
      <SignupForm form={form} setForm={setForm} onSubmit={onSubmit} onShowLogin={onCancel} showToast={showToast} submitLabel="変更を保存" cancelLabel="キャンセル" showAgreement={false} />
    </section>
  );
}

// ─── AuthFormsContainer（デフォルトエクスポート）──────────────────
/**
 * 認証モーダル群をまとめたコンテナ。
 * React.lazy で遅延読み込みされるため、ユーザーがログインボタンを押すまで
 * このファイルのコードがダウンロードされない。
 */
export default function AuthFormsContainer({
  isAuthed, profileEditorOpen, setProfileEditorOpen,
  user, editForm, setEditForm, saveProfileEdit, showToast,
  authMode, setAuthMode, showAuth,
  form, setForm,
  pendingFirebaseUser,
  createAccount, register, continueWithGoogle, loginWithFirebase,
  resendVerificationEmail, confirmEmailVerified, resetPassword,
}) {
  // プロフィール編集モーダル（ログイン済みユーザーが自分の情報を変更するとき）
  if (isAuthed && profileEditorOpen) {
    return (
      <AuthModal onClose={() => setProfileEditorOpen(false)} size="profile">
        <ProfileEditSection form={editForm} setForm={setEditForm} user={user} onSubmit={saveProfileEdit} onCancel={() => setProfileEditorOpen(false)} showToast={showToast} />
      </AuthModal>
    );
  }

  // 認証フロー各ステップのモーダル
  if (!isAuthed && authMode) {
    const modalSize = authMode === 'profileSetup'
      ? 'profile'
      : ['register', 'login', 'emailVerification', 'entry'].includes(authMode)
        ? 'narrow'
        : undefined;
    return (
      <AuthModal onClose={() => setAuthMode(null)} size={modalSize}>
        {authMode === 'entry' && <AuthEntrySection onShowRegister={() => showAuth('register')} onShowLogin={() => showAuth('login')} onGoogle={continueWithGoogle} />}
        {authMode === 'register' && <AccountSignupSection form={form} setForm={setForm} onSubmit={createAccount} onGoogle={continueWithGoogle} onShowLogin={() => showAuth('login')} />}
        {authMode === 'emailVerification' && <EmailVerificationSection pendingEmail={pendingFirebaseUser?.email} onCheck={confirmEmailVerified} onResend={resendVerificationEmail} onShowLogin={() => showAuth('login')} />}
        {authMode === 'profileSetup' && <SignupSection form={form} setForm={setForm} pendingEmail={pendingFirebaseUser?.email} onSubmit={register} onShowLogin={() => showAuth('login')} showToast={showToast} />}
        {authMode === 'login' && <LoginSection form={form} setForm={setForm} onLogin={loginWithFirebase} onGoogle={continueWithGoogle} onResetPassword={resetPassword} onShowRegister={() => showAuth('register')} />}
      </AuthModal>
    );
  }

  return null;
}
