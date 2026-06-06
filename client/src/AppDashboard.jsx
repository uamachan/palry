import React, { useEffect, useRef, useState } from 'react';
import { cx, planLabel, TAB_ICONS } from './constants.jsx';
import SiteHeader from './SiteHeader.jsx';
import PublicPricing from './Pricing.jsx';
import { SafetyCompact } from './Safety.jsx';

// ─── VoiceIntroPlayer ──────────────────────────────────────────────
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
      else { audio.pause(); setPlaying(false); }
    };
    return (
      <div className="voice-intro-player compact">
        <button
          type="button"
          className={cx('voice-chip', playing && 'playing', !src && 'empty')}
          onClick={toggleAudio}
          aria-label={src ? '声の自己紹介を再生' : '声の自己紹介はありません'}
          disabled={!src}
        >
          <span className="voice-chip-icon">{!src ? '-' : playing ? 'Ⅱ' : '▶'}</span>
          <span className="voice-chip-text">{!src ? '声がない' : playing ? '再生中' : '声を聞く'}</span>
          <i></i><i></i><i></i>
        </button>
        {src && <audio ref={audioRef} src={src} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />}
      </div>
    );
  }
  if (!src) return null;
  return (
    <div className="voice-intro-player">
      <span>声の自己紹介</span>
      <audio src={src} controls />
    </div>
  );
}

// ─── ProfileDetailModal ────────────────────────────────────────────
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
    ['信頼度', profile.trust ? `${profile.trust}%` : profile.verified ? '認証済み' : '未設定'],
  ];

  return (
    <div className="profile-detail-modal" role="dialog" aria-modal="true">
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
          {tags.length > 0 && <div className="profile-detail-block"><strong>目的タグ</strong><div className="profile-detail-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>}
          {modes.length > 0 && <div className="profile-detail-block"><strong>プレイスタイル</strong><div className="profile-detail-tags is-muted">{modes.map((mode) => <span key={mode}>{mode}</span>)}</div></div>}
          {agentsList.length > 0 && <div className="profile-detail-block"><strong>よく使うキャラ</strong><div className="profile-detail-tags is-plain">{agentsList.map((agent) => <span key={agent}>{agent}</span>)}</div></div>}
          <div className="profile-detail-block"><strong>自己紹介</strong><p>{profile.bio || '自己紹介は未入力です。'}</p></div>
          {profile.xHandle && (
            <div className="profile-detail-block">
              <strong>X</strong>
              <a className="profile-detail-link" href={`https://x.com/${profile.xHandle.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" aria-label={`${profile.name}のXプロフィールを開く`}>
                @{profile.xHandle.replace(/^@/, '')}
              </a>
            </div>
          )}
          {profile.opener && <div className="profile-detail-note"><strong>話しかけるきっかけ</strong><p>{profile.opener}</p></div>}
          {reasons.length > 0 && (
            <div className="profile-detail-block">
              <strong>相性が高い理由</strong>
              <ul className="profile-detail-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
          )}
          <VoiceIntroPlayer src={profile.voiceIntro} />
        </div>
      </section>
    </div>
  );
}

// ─── TinderProfileCard ─────────────────────────────────────────────
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
        : (
          <div className={cx('mp-photo-placeholder', `role-${roleTone}`)}>
            <div className="mp-placeholder-frame">
              <span>{profile.name.slice(0, 1).toUpperCase()}</span>
              <b>{profile.role || 'ROLE'}</b>
            </div>
          </div>
        )}
      <div className="mp-gradient" />
      {swipeDir === 'right' && <div className="mp-stamp mp-stamp-like">LIKE</div>}
      {swipeDir === 'left'  && <div className="mp-stamp mp-stamp-nope">NOPE</div>}
      {swipeDir === 'up'    && <div className="mp-stamp mp-stamp-super">SUPER</div>}
      <div className="mp-badges-top">
        <span className="mp-badge mp-badge-score">相性 {profile.matchScore}%</span>
      </div>
      <div className="mp-card-info">
        <div className="mp-active-row"><span className="mp-active-dot" /><span>最近アクティブ</span></div>
        <div className="mp-name-row">
          <button type="button" className="mp-name-button" onClick={(e) => { e.stopPropagation(); onOpenProfile?.(profile); }}>
            {profile.name}
          </button>
          <span className="mp-age">{profile.ageRange}</span>
        </div>
        <p className="mp-meta">{profile.rank} · {profile.role}</p>
        <p className="mp-meta">{profile.gender}{profile.region ? ` · ${profile.region}` : ''}</p>
        {tags.length > 0 && <div className="mp-tags">{tags.slice(0, 4).map((t) => <span className="mp-tag" key={t}>{t}</span>)}</div>}
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

// ─── MatchPanel ────────────────────────────────────────────────────
function MatchPanel({ current, swipe, reportCurrent, blockCurrent, targetGender, setTargetGender, genderFilterLocked, receivedLikes, acceptLike }) {
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

  async function handleAcceptLike(id) {
    if (acceptingLikeId) return;
    setAcceptingLikeId(id);
    try { await acceptLike(id); }
    finally { setAcceptingLikeId(''); }
  }

  return (
    <div className="mp-wrap">
      {/* 届いたいいねセクション */}
      <div className={cx('mp-received-section', !receivedLikes?.length && 'empty')}>
        <div className="mp-received-header">届いたいいね <span>{receivedLikes.length}</span></div>
        <div className="mp-received-list">
          {receivedLikes?.length ? receivedLikes.map((rl) => (
            <div key={rl.id} className="mp-received-card">
              <div className="mp-received-avatar">
                {rl.fromPhoto ? <img src={rl.fromPhoto} alt={rl.fromProfileName} /> : rl.fromProfileName?.slice(0, 1) || '?'}
              </div>
              <div className="mp-received-info"><b>{rl.fromProfileName}</b><span>{rl.fromRank} · {rl.fromRole}</span></div>
              <button className="mp-accept-btn" onClick={() => handleAcceptLike(rl.id)} disabled={acceptingLikeId === rl.id}>
                {acceptingLikeId === rl.id ? '送信中' : 'いいねを返す'}
              </button>
            </div>
          )) : <p className="mp-received-empty">まだ届いたいいねはありません。</p>}
        </div>
      </div>

      {/* 性別フィルター */}
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

// ─── NotificationsPanel ────────────────────────────────────────────
function NotificationsPanel({ receivedLikes, dmThreads, setActiveTab, selectDmThread, acceptLike }) {
  const unreadThreads = dmThreads.filter((t) => Number(t.unreadCount || 0) > 0);
  const recentThreads = dmThreads.slice(0, 3);
  const totalUnread = receivedLikes.length + unreadThreads.reduce((sum, t) => sum + Number(t.unreadCount || 0), 0);
  return (
    <div className="notifications-panel list-panel" aria-label="通知パネル">
      <div className="notifications-head">
        <div><span>通知</span><h3>通知</h3></div>
        <b aria-label={`${totalUnread}件の通知`}>{totalUnread}件</b>
      </div>
      <div className="notification-list" role="list">
        {receivedLikes.map((like) => (
          <article className="notification-card important" key={like.id} role="listitem">
            <div className="notification-icon" aria-hidden="true">♡</div>
            <div><b>{like.fromProfileName}さんからいいね</b><p>{like.fromRank || 'ランク未設定'} · {like.fromRole || 'ロール未設定'}</p></div>
            <button type="button" aria-label={`${like.fromProfileName}さんにいいねを返す`} onClick={() => acceptLike(like.id)}>いいねを返す</button>
          </article>
        ))}
        {unreadThreads.map((thread) => (
          <article className="notification-card" key={`unread_${thread.match.id}`} role="listitem">
            <div className="notification-icon" aria-hidden="true">✉</div>
            <div><b>{thread.match.profileName}さんからメッセージ</b><p>{thread.unreadCount}件の未読があります</p></div>
            <button type="button" aria-label={`${thread.match.profileName}さんのメッセージを開く`} onClick={() => { selectDmThread(thread.match.id); setActiveTab('dm'); }}>開く</button>
          </article>
        ))}
        {!receivedLikes.length && !unreadThreads.length && recentThreads.map((thread) => (
          <article className="notification-card quiet" key={`recent_${thread.match.id}`} role="listitem">
            <div className="notification-icon" aria-hidden="true">✓</div>
            <div><b>{thread.match.profileName}さんとマッチ済み</b><p>DMで会話できます</p></div>
            <button type="button" aria-label={`${thread.match.profileName}さんにDMを送る`} onClick={() => { selectDmThread(thread.match.id); setActiveTab('dm'); }}>DM</button>
          </article>
        ))}
        {!receivedLikes.length && !unreadThreads.length && !recentThreads.length && (
          <div className="notification-empty">
            <div className="notification-empty-icon">{TAB_ICONS.notifications}</div>
            <h3>通知はまだありません</h3>
            <p>いいねが届いた時やDMが来た時にここへ表示されます。</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DM ユーティリティ ─────────────────────────────────────────────
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
    bio: match.profileBio || 'DMで会話しながら相性を確かめましょう。',
  };
}

// ─── DmPanel ──────────────────────────────────────────────────────
function DmPanel({ dmThreads, activeThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, reportProfile, blockProfile }) {
  const activeThread = dmThreads.find((t) => t.match.id === activeThreadId) || dmThreads[0];
  const [detailProfile, setDetailProfile] = useState(null);

  useEffect(() => {
    if (activeThread?.match.id) markDmRead(activeThread.match.id);
  }, [activeThread?.match.id]);

  const hasUserMessage = Boolean(activeThread?.messages?.some((m) => m.sender === 'user' && !m.system));

  return (
    <div className="dm-panel">
      <aside className="dm-thread-list">
        <div className="dm-head"><h3>マッチ後メッセージ</h3><span>{dmThreads.length}件</span></div>
        {dmThreads.length ? dmThreads.map((thread) => {
          const lastMessage = thread.messages.at(-1);
          return (
            <button
              className={cx('dm-thread', activeThread?.match.id === thread.match.id && 'active', thread.unreadCount > 0 && 'unread')}
              key={thread.match.id}
              onClick={() => selectDmThread(thread.match.id)}
            >
              <b>{thread.match.profileName}{thread.unreadCount > 0 && <em>{thread.unreadCount}</em>}</b>
              <span>{lastMessage?.body || thread.match.opener}</span>
            </button>
          );
        }) : <p className="empty-text">まだマッチしていません。マッチ後だけメッセージが使えます。</p>}
      </aside>
      <section className="dm-conversation">
        {activeThread ? (
          <>
            <div className="dm-conversation-head">
              <div className="avatar small">
                {activeThread.match.profilePhoto
                  ? <img src={activeThread.match.profilePhoto} alt="" loading="lazy" decoding="async" />
                  : activeThread.match.profileName?.slice(0, 1) || 'P'}
              </div>
              <div><h3>{activeThread.match.profileName}</h3><span>メッセージ解放済み</span></div>
              <div className="dm-head-actions">
                <button type="button" onClick={() => setDetailProfile(profileFromMatch(activeThread.match))}>プロフィール</button>
                <button type="button" onClick={() => reportProfile(activeThread.match.profileId, activeThread.match.profileName)}>通報</button>
                <button type="button" className="danger" onClick={() => blockProfile(activeThread.match.profileId, activeThread.match.profileName)}>ブロック</button>
              </div>
            </div>
            <div className="dm-messages" data-copyable>
              {activeThread.messages.map((message) => (
                <div className={cx('dm-bubble', message.sender === 'user' && 'mine')} key={message.id}>
                  <p>{message.body}</p>
                  <div className="dm-message-meta">
                    {message.sender === 'user' && (
                      <span className={cx('dm-read-state', message.readAt && 'read')}>{message.readAt ? '既読' : '未読'}</span>
                    )}
                    <time>{new Date(message.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                  </div>
                </div>
              ))}
            </div>
            {!hasUserMessage && (
              <div className="dm-starters">
                {dmStarters.map((starter) => <button type="button" key={starter} onClick={() => setDmDraft(starter)}>{starter}</button>)}
              </div>
            )}
            <form className="dm-form" onSubmit={sendDm}>
              <input value={dmDraft} maxLength="500" onChange={(e) => setDmDraft(e.target.value)} placeholder="メッセージを入力" />
              <button className="primary" type="submit" disabled={dmSending || !dmDraft.trim()}>{dmSending ? '送信中' : '送信'}</button>
            </form>
            {detailProfile && <ProfileDetailModal profile={detailProfile} onClose={() => setDetailProfile(null)} />}
          </>
        ) : (
          <div className="locked-panel"><h3>メッセージはマッチ後に解放</h3><p>お互いにいいねすると、ここに1対1の会話が表示されます。</p></div>
        )}
      </section>
    </div>
  );
}

// ─── FootprintsPanel ───────────────────────────────────────────────
function FootprintsPanel({ footprints, plan }) {
  return (
    <div className="list-panel">
      <h3>足あと</h3>
      {plan === 'FREE' && <p className="hint">足あと詳細はPLUS/VIP向け機能です。デモでは直近ログのみ表示します。</p>}
      {footprints.length ? footprints.map((f, i) => (
        <div className="list-row" key={i}><b>{f.name}</b><p>{f.rank} / {f.gender}</p><span>{f.action}・{f.time}</span></div>
      )) : <p className="empty-text">まだ操作履歴がありません。</p>}
    </div>
  );
}

// ─── PricingPanel ──────────────────────────────────────────────────
function PricingPanel(props) { return <PublicPricing {...props} appMode />; }

// ─── ProfilePanel ──────────────────────────────────────────────────
function ProfilePanel({ user }) {
  return (
    <div className="list-panel">
      <h3>プロフィール</h3>
      <div className="profile-preview expanded">
        <div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0, 1) || 'P'}</div>
        <b>{user.name}</b>
        <span>{user.gender} / {user.age ? `${user.age}歳` : '年齢未設定'} / {user.region || '地域未設定'}</span>
        <span data-copyable>{user.riotId} / {user.rank} / {user.role}</span>
        {Boolean(user.tags?.length) && <div className="tag-row">{user.tags.map((tag) => <span className="intent-tag" key={tag}>{tag}</span>)}</div>}
        <p>{user.bio || '自己紹介は未入力です。'}</p>
        <VoiceIntroPlayer src={user.voiceIntro} />
      </div>
    </div>
  );
}

// ─── AdminPanel ────────────────────────────────────────────────────
function AdminPanel({ reports }) {
  return (
    <div className="list-panel">
      <h3>通報管理</h3>
      {reports.length ? reports.map((r) => (
        <div className="list-row" key={r.id}><b>{r.reason}</b><p>プロフィール: {r.profileId || '-'}</p><span>{r.status}</span></div>
      )) : <p className="empty-text">通報はありません。</p>}
    </div>
  );
}

// ─── ProfileSummary ────────────────────────────────────────────────
function ProfileSummary({ user, plan, stats, receivedLikes = [] }) {
  return (
    <div className="side-card">
      <h3>自分の状態</h3>
      <div className="avatar">{user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : user.name?.slice(0, 1) || 'P'}</div>
      <b>{user.name}</b>
      <p data-copyable>{user.riotId}</p>
      <div className="mini-list">
        <span>{user.gender}</span>
        <span>{user.age ? `${user.age}歳` : '年齢未設定'}</span>
        <span>{user.region || '地域未設定'}</span>
        <span>{user.rank}</span>
        <span>{user.role}</span>
        {user.tags?.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="statline">
        <span>好意あり {receivedLikes.length}</span>
        <span>マッチ {stats.matches}</span>
      </div>
      <span className="plan-pill">{planLabel(plan)}</span>
    </div>
  );
}

// ─── GenderFilter ──────────────────────────────────────────────────
function GenderFilter({ targetGender, setTargetGender, genderFilterLocked }) {
  return (
    <div className="side-card">
      <h3>表示フィルター</h3>
      <label>表示する性別
        <select disabled={genderFilterLocked} value={targetGender} onChange={(e) => setTargetGender(e.target.value)}>
          <option value="all">すべて</option>
          <option value="女性">女性だけ</option>
          <option value="男性">男性だけ</option>
          <option value="その他/未設定">その他/未設定</option>
        </select>
      </label>
      {genderFilterLocked
        ? <p className="hint">性別指定はPLUS/VIPで解放。FREEはすべて表示です。</p>
        : <p className="hint">性別指定フィルター使用中。</p>}
      <p className="hint">表示性別による特典差はありません。</p>
    </div>
  );
}

// ─── TabPanel ──────────────────────────────────────────────────────
function TabPanel(props) {
  switch (props.activeTab) {
    case 'match':         return <MatchPanel {...props} />;
    case 'pricing':       return <PricingPanel {...props} />;
    case 'safety':        return <SafetyCompact />;
    case 'notifications': return <NotificationsPanel {...props} />;
    case 'dm':            return <DmPanel {...props} />;
    case 'footprints':    return <FootprintsPanel {...props} />;
    default:              return <MatchPanel {...props} />;
  }
}

// ─── AppDashboard（デフォルトエクスポート）─────────────────────────
/**
 * ログイン後のアプリ画面。
 * React.lazy で遅延読み込みされるため、未ログインのユーザーには
 * このファイルのコードが一切ダウンロードされない。
 */
export default function AppDashboard(props) {
  const { activeTab, setActiveTab, onBackSite, user, plan, notificationCount, openProfileEditor, logout } = props;
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
        openProfileEditor={openProfileEditor}
        logout={logout}
      />
      <main className={cx('appv2-content', activeTab === 'dm' && 'appv2-content--dm')} key={activeTab}>
        <TabPanel {...props} />
      </main>
    </div>
  );
}
