import React, { useEffect, useRef, useState } from 'react';
import { cx, ranks, roles, agents, intentTags, regions, resizePhoto, vcOptions, maps as mapList, favoriteWeapons, rankIconMap, roleIconMap } from './constants.jsx';

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
    function esc(e) { if (e.key === 'Escape') onCloseRef.current?.(); }
    panel.addEventListener('keydown', trap);
    window.addEventListener('keydown', esc);
    return () => {
      panel.removeEventListener('keydown', trap);
      window.removeEventListener('keydown', esc);
    };
  }, []);

  return <div ref={panelRef} className={cx('auth-modal-card', size === 'wide' && 'wide')} role="dialog" aria-modal="true">{children}</div>;
}

function SignupForm({ form, setForm, onSubmit, onShowLogin, showToast, submitLabel = 'プロフィールを完成する', cancelLabel = 'ログインに戻る', showAgreement = true }) {
  const tabs = ['基本情報', 'ランク/ロール', 'プレイスタイル', '追加情報', '自己紹介', ...(showAgreement ? ['規約'] : [])];
  const [activeSetupTab, setActiveSetupTab] = useState(tabs[0]);
  const [maxUnlockedIndex, setMaxUnlockedIndex] = useState(0);
  const [setupError, setSetupError] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const recordTimerRef = useRef(null);

  const activeIndex = Math.max(0, tabs.indexOf(activeSetupTab));
  const isLastStep = activeIndex === tabs.length - 1;
  const progress = Math.round(((activeIndex + 1) / tabs.length) * 100);
  const AGE_RANGES = ['10代', '20代', '30代', '40代', '50代', '60代', '70代', '80代', '90代'];
  const ROLE_INFO = {
    'デュエリスト': { icon: '⚡', desc: '撃ち合い・エントリー' },
    'イニシエーター': { icon: '🔍', desc: '情報・フラッシュ補助' },
    'コントローラー': { icon: '💨', desc: '煙幕・陣地支配' },
    'センチネル': { icon: '🛡️', desc: '守り・ヒーリング' },
  };
  const RANK_TIERS = [
    { tier: 'Unranked', color: '#8a8a8a', rankList: ['Unranked'] },
    { tier: 'Iron', color: '#7e6b6b', rankList: ['Iron 1', 'Iron 2', 'Iron 3'] },
    { tier: 'Bronze', color: '#9c6535', rankList: ['Bronze 1', 'Bronze 2', 'Bronze 3'] },
    { tier: 'Silver', color: '#748e9e', rankList: ['Silver 1', 'Silver 2', 'Silver 3'] },
    { tier: 'Gold', color: '#b88a10', rankList: ['Gold 1', 'Gold 2', 'Gold 3'] },
    { tier: 'Platinum', color: '#00a898', rankList: ['Platinum 1', 'Platinum 2', 'Platinum 3'] },
    { tier: 'Diamond', color: '#3858d0', rankList: ['Diamond 1', 'Diamond 2', 'Diamond 3'] },
    { tier: 'Ascendant', color: '#169855', rankList: ['Ascendant 1', 'Ascendant 2', 'Ascendant 3'] },
    { tier: 'Immortal', color: '#c0204a', rankList: ['Immortal 1', 'Immortal 2', 'Immortal 3'] },
    { tier: 'Radiant', color: '#c8a000', rankList: ['Radiant'] },
  ];

  const toggleAgent = (agent) => setForm((f) => ({ ...f, agents: f.agents.includes(agent) ? f.agents.filter((a) => a !== agent) : [...f.agents, agent].slice(0, 5) }));
  const toggleTag = (tag) => setForm((f) => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter((item) => item !== tag) : [...f.tags, tag].slice(0, 4) }));
  const toggleMap = (map) => setForm((f) => {
    const current = f.maps || [];
    return { ...f, maps: current.includes(map) ? current.filter((m) => m !== map) : [...current, map].slice(0, 5) };
  });

  useEffect(() => () => {
    clearTimeout(recordTimerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function isValidAgeRange(value) { return AGE_RANGES.includes(value); }
  function validateStep(tab = activeSetupTab) {
    if (tab === '基本情報') {
      if (!form.name?.trim()) return '表示名';
      if (!form.riotId?.trim()) return 'Riot ID';
      if (!/^[^#]{1,16}#[^#]{1,5}$/u.test(form.riotId.trim())) return 'Riot IDはGameName#Tagline形式で入力してください（例：たろう#JP1）';
      if (!form.age) return '年齢帯';
      if (!isValidAgeRange(form.age)) return '年齢帯を選択してください';
      if (!form.region) return '地域';
      if (!form.gender) return '性別';
    }
    if (tab === 'ランク/ロール') {
      if (!form.rank) return '現在ランク';
      if (!form.role) return 'メインロール';
    }
    if (tab === 'プレイスタイル' && (!form.tags?.length && !form.agents?.length)) return '目的タグ または よく使うエージェント';
    if (tab === '規約' && showAgreement && !form.agreed) return '利用規約への同意';
    return '';
  }
  function notifyRequired(message) {
    const notice = message.startsWith('入力が必要です') ? message : `入力が必要です：${message}`;
    setSetupError(notice);
    showToast?.(notice);
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
    setActiveSetupTab(tabs[Math.max(activeIndex - 1, 0)]);
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

  return (
    <section className="email-signup-panel profile-setup-panel">
      <div className="email-signup-header profile-setup-heading"><h2 id="auth-modal-title">プロフィールを作成</h2><p>ステップに沿って設定しましょう</p></div>
      <form className="email-signup-form signup-card profile-setup-card" onSubmit={handleProfileSubmit} noValidate>
        <div className="setup-progress" aria-label={`プロフィール設定の進捗 ${progress}%`}><span style={{ width: `${progress}%` }} /></div>
        <div className="setup-tabs" role="tablist" aria-label="プロフィール設定ステップ">{tabs.map((tab, index) => <button key={tab} type="button" className={cx(activeSetupTab === tab && 'active', index > maxUnlockedIndex + 1 && 'locked')} onClick={() => goToStep(index)}>{index + 1}. {tab}</button>)}</div>
        {setupError && <div className="setup-error" id="setup-error" role="alert" aria-live="assertive">{setupError}</div>}

        {activeSetupTab === '基本情報' && <div className="pv-basic-grid force-visible-basic">
          <label className="pv-photo-card">
            <input type="file" accept="image/*" onChange={selectPhoto} className="pv-photo-input" />
            <div className="pv-photo-preview">{form.profilePhoto ? <img src={form.profilePhoto} alt="プロフィール写真プレビュー" /> : <div className="pv-photo-placeholder"><span className="pv-photo-plus">＋</span><span className="pv-photo-hint">写真を追加</span></div>}</div>
            <div className="pv-photo-footer"><span className="pv-photo-btn">{form.profilePhoto ? '写真を変更' : '写真を選択'}</span><small>JPG/PNG・自動で最適化</small></div>
          </label>
          <div className="pv-text-fields">
            <label className="pv-field"><span className="pv-label">表示名 <small>(最大16文字)</small></span><input required value={form.name} maxLength="16" onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：Pairlyちゃん" /></label>
            <label className="pv-field"><span className="pv-label">Riot ID</span><input required value={form.riotId} maxLength="22" data-copyable onChange={(e) => setForm({ ...form, riotId: e.target.value })} placeholder="例：たろう#JP1" /><span className="pv-hint">GameName#Tagline（日本語・英語・韓国語OK）</span></label>
          </div>
          <div className="pv-field-group pv-span-all"><span className="pv-label">年齢帯 <span className="pv-req">必須</span></span><div className="pv-chip-row">{AGE_RANGES.map((age) => <button type="button" key={age} className={cx('pv-chip', form.age === age && 'pv-chip--on')} onClick={() => setForm({ ...form, age })}>{age}</button>)}</div></div>
          <label className="pv-field pv-span-all region-visible-field"><span className="pv-label">地域 <span className="pv-req">必須</span></span><select required value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}><option value="">選択してください</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          <div className="pv-field-group pv-span-all gender-visible-field"><span className="pv-label">性別 <span className="pv-req">必須</span></span><div className="pv-gender-row">{['男性', '女性', 'その他/未設定'].map((g) => <button type="button" key={g} className={cx('pv-gender-btn', form.gender === g && 'pv-gender-btn--on')} onClick={() => setForm({ ...form, gender: g })}>{g}</button>)}</div></div>
        </div>}

        {activeSetupTab === 'ランク/ロール' && <div className="pv-rank-section"><div className="pv-field-group"><span className="pv-label">現在のランク <span className="pv-req">必須</span></span><div className="pv-rank-tiers">{RANK_TIERS.map(({ tier, color, rankList }) => <div key={tier} className={cx('pv-rank-card', rankList.includes(form.rank) && 'pv-rank-card--on')} style={{ '--rc': color }}><div className="pv-rank-card-head"><span className="pv-rank-icon-wrap" aria-hidden="true"><img src={rankIconMap?.[tier]} alt="" loading="lazy" /></span><span className="pv-rank-tier-name">{tier}</span></div><div className="pv-rank-badge-group">{rankList.map((rank) => <button type="button" key={rank} className={cx('pv-rank-badge', form.rank === rank && 'pv-rank-badge--on')} onClick={() => setForm({ ...form, rank })}>{rank.replace(tier !== 'Unranked' ? tier + ' ' : '', '') || rank}</button>)}</div></div>)}</div></div><div className="pv-field-group"><span className="pv-label">メインロール <span className="pv-req">必須</span></span><div className="pv-role-grid">{roles.map((role) => <button type="button" key={role} className={cx('pv-role-card', form.role === role && 'pv-role-card--on')} onClick={() => setForm({ ...form, role })}><span className="pv-role-icon">{roleIconMap?.[role] ? <img src={roleIconMap[role]} alt="" /> : ROLE_INFO[role]?.icon || '🎮'}</span><span className="pv-role-name">{role}</span><span className="pv-role-desc">{ROLE_INFO[role]?.desc || ''}</span></button>)}</div></div></div>}

        {activeSetupTab === 'プレイスタイル' && <div className="setup-stack"><div className="pv-field-group"><span className="pv-label">目的タグ（最大4つ）<span className="pv-req">いずれか必須</span></span><div className="pv-chip-grid">{intentTags.map((tag) => <button type="button" key={tag} className={cx('pv-chip pv-chip--tag', form.tags.includes(tag) && 'pv-chip--on')} onClick={() => toggleTag(tag)}>{tag}</button>)}</div></div><div className="pv-field-group"><span className="pv-label">よく使うエージェント（最大5つ）</span><div className="pv-chip-grid pv-chip-grid--compact">{agents.map((agent) => <button type="button" key={agent} className={cx('pv-chip pv-chip--agent', form.agents.includes(agent) && 'pv-chip--on')} onClick={() => toggleAgent(agent)}>{agent}</button>)}</div></div></div>}
        {activeSetupTab === '追加情報' && <div className="setup-stack"><div className="pv-field-group"><span className="pv-label">VC（任意）</span><div className="pv-chip-row">{vcOptions.map((vc) => <button type="button" key={vc} className={cx('pv-chip', form.vc === vc && 'pv-chip--on')} onClick={() => setForm({ ...form, vc: form.vc === vc ? '' : vc })}>{vc}</button>)}</div></div><div className="pv-field-group"><span className="pv-label">得意MAP（最大5つ）</span><div className="pv-chip-grid">{mapList.map((map) => <button type="button" key={map} className={cx('pv-chip pv-chip--map', (form.maps || []).includes(map) && 'pv-chip--on')} onClick={() => toggleMap(map)}>{map}</button>)}</div></div><div className="pv-field-group"><span className="pv-label">好きな武器（任意）</span><div className="pv-chip-row">{favoriteWeapons.map((weapon) => <button type="button" key={weapon} className={cx('pv-chip pv-chip--weapon', form.favoriteWeapon === weapon && 'pv-chip--on')} onClick={() => setForm({ ...form, favoriteWeapon: form.favoriteWeapon === weapon ? '' : weapon })}>{weapon}</button>)}</div></div></div>}
        {activeSetupTab === '自己紹介' && <div className="setup-stack"><label className="pv-field"><span className="pv-label">Xアカウント（任意）</span><input value={form.xHandle} maxLength="40" onChange={(e) => setForm({ ...form, xHandle: e.target.value })} placeholder="@pairly" /></label><div className="pv-field"><span className="pv-label">自己紹介 <small>(最大240文字)</small></span><textarea className="pv-bio-area" value={form.bio} maxLength="240" onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="遊ぶ時間、VC、募集したい相手、得意なことなど" rows={5} /><span className="pv-char-count">{(form.bio || '').length} / 240</span></div><div className="voice-record-box"><div><b>声の自己紹介</b><p>任意で20秒まで録音できます。</p></div><button type="button" className={isRecordingVoice ? 'danger' : 'secondary'} onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}>{isRecordingVoice ? '録音停止' : '録音する'}</button>{form.voiceIntro && <span className="pv-voice-done">録音済み</span>}</div></div>}
        {activeSetupTab === '規約' && <div className="setup-stack terms-box"><h3>利用ルール</h3><p>迷惑行為、なりすまし、外部誘導、Riot Gamesの規約に反する行為は禁止です。PairlyはRiot Games公式サービスではありません。</p><label className="terms-check"><input type="checkbox" checked={form.agreed} onChange={(e) => setForm({ ...form, agreed: e.target.checked })} /> <span>利用規約と禁止事項に同意します</span></label></div>}

        <div className="email-signup-actions profile-setup-actions"><button type="button" className="secondary" onClick={goPrev} disabled={activeIndex === 0}>戻る</button>{!isLastStep && <button type="button" className="secondary" onClick={goNext}>次へ</button>}{isLastStep && <button type="submit" className="primary">{submitLabel}</button>}<button type="button" className="plain reset-password-link" onClick={onShowLogin}>{cancelLabel}</button></div>
      </form>
    </section>
  );
}

export default function AuthFormsContainer(props) {
  const { isAuthed, profileEditorOpen, setProfileEditorOpen, user, editForm, setEditForm, saveProfileEdit, showToast, authMode, setAuthMode, showAuth, form, setForm, pendingFirebaseUser, createAccount, register, continueWithGoogle, loginWithFirebase, resendVerificationEmail, confirmEmailVerified, resetPassword, authStatus, authStatusType, closeAuth } = props;
  return (
    <>
      {profileEditorOpen && isAuthed && <div className="auth-modal-backdrop"><AuthModal onClose={() => setProfileEditorOpen(false)} size="wide"><button className="auth-modal-close" type="button" onClick={() => setProfileEditorOpen(false)}>×</button><SignupForm form={editForm} setForm={setEditForm} onSubmit={saveProfileEdit} onShowLogin={() => setProfileEditorOpen(false)} showToast={showToast} submitLabel="保存する" cancelLabel="閉じる" showAgreement={false} /></AuthModal></div>}
      {showAuth && <div className="auth-modal-backdrop"><AuthModal onClose={closeAuth} size="wide"><button className="auth-modal-close" type="button" onClick={closeAuth}>×</button>{authStatus && <div className={cx('auth-status-message', authStatusType === 'success' && 'success')}>{authStatus}</div>}<SignupForm form={form} setForm={setForm} onSubmit={pendingFirebaseUser ? createAccount : register} onShowLogin={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} showToast={showToast} /></AuthModal></div>}
    </>
  );
}
