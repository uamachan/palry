import React, { useEffect, useRef, useState } from 'react';
import { cx } from '../../constants.jsx';
import ProfileDetailModal from './ProfileDetailModal.jsx';

export const dmStarters = ['よろしくお願いします！', '何時ごろ遊べますか？', 'ランク一緒に行きませんか？'];

function safeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

export function profileFromMatch(match) {
  return {
    id: match.profileId,
    name: match.profileName,
    riotId: match.profileRiotId || match.riotId || '',
    profilePhoto: match.profilePhoto || '',
    rank: match.profileRank || '未設定',
    role: match.profileRole || '未設定',
    gender: match.profileGender || '',
    ageRange: match.profileAgeRange || '',
    region: match.profileRegion || '',
    tags: safeArray(match.profileTags || match.tags),
    agents: safeArray(match.profileAgents || match.agents),
    xHandle: match.profileXHandle || match.xHandle || '',
    vc: match.profileVc || match.vc || '',
    maps: safeArray(match.profileMaps || match.maps),
    favoriteWeapon: match.profileFavoriteWeapon || match.favoriteWeapon || '',
    voiceIntro: match.profileVoiceIntro || match.voiceIntro || '',
    matchScore: 100,
    opener: match.opener || `${match.profileName}さんとマッチしました！`,
    bio: match.profileBio || 'DMで会話しながら相性を確かめましょう。',
  };
}

function ProfileChips({ items, empty = '未設定' }) {
  const list = safeArray(items);
  if (!list.length) return <span className="dm-profile-empty">{empty}</span>;
  return <div className="dm-profile-chips">{list.map((item) => <span key={item}>{item}</span>)}</div>;
}

function DmProfileSidebar({ profile, onOpenDetail, onReport, onBlock }) {
  if (!profile) return null;
  const xLabel = profile.xHandle ? (String(profile.xHandle).startsWith('@') ? profile.xHandle : `@${profile.xHandle}`) : '未設定';
  return (
    <aside className="dm-profile-sidebar" aria-label="相手のプロフィール">
      <div className="dm-profile-cover"></div>
      <div className="dm-profile-main">
        <div className="dm-profile-avatar">
          {profile.profilePhoto ? <img src={profile.profilePhoto} alt="" loading="lazy" decoding="async" /> : profile.name?.slice(0, 1) || 'P'}
        </div>
        <h3>{profile.name}</h3>
        <p className="dm-profile-riot">{profile.riotId || 'Riot ID 未設定'}</p>
      </div>

      <div className="dm-profile-section">
        <b>基本情報</b>
        <dl className="dm-profile-info">
          <div><dt>ランク</dt><dd>{profile.rank || '未設定'}</dd></div>
          <div><dt>ロール</dt><dd>{profile.role || '未設定'}</dd></div>
          <div><dt>地域</dt><dd>{profile.region || '未設定'}</dd></div>
          <div><dt>年齢帯</dt><dd>{profile.ageRange || '未設定'}</dd></div>
          <div><dt>性別</dt><dd>{profile.gender || '未設定'}</dd></div>
          <div><dt>X</dt><dd>{xLabel}</dd></div>
        </dl>
      </div>

      <div className="dm-profile-section">
        <b>目的タグ</b>
        <ProfileChips items={profile.tags} />
      </div>

      <div className="dm-profile-section">
        <b>よく使うエージェント</b>
        <ProfileChips items={profile.agents} />
      </div>

      <div className="dm-profile-section">
        <b>プレイスタイル詳細</b>
        <dl className="dm-profile-info">
          <div><dt>VC</dt><dd>{profile.vc || '未設定'}</dd></div>
          <div><dt>好きな武器</dt><dd>{profile.favoriteWeapon || '未設定'}</dd></div>
        </dl>
        <div className="dm-profile-maps">
          <span className="dm-profile-maps-label">得意MAP</span>
          <ProfileChips items={profile.maps} empty="未設定" />
        </div>
      </div>

      <div className="dm-profile-section">
        <b>自己紹介</b>
        <p className="dm-profile-bio">{profile.bio || '未設定'}</p>
      </div>

      <div className="dm-profile-actions">
        <button type="button" onClick={onOpenDetail}>プロフィール全体を表示</button>
        <button type="button" onClick={onReport}>通報</button>
        <button type="button" className="danger" onClick={onBlock}>ブロック</button>
      </div>
    </aside>
  );
}

export default function DmPanel({ dmThreads, activeThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, reportProfile, blockProfile }) {
  const activeThread = dmThreads.find((t) => t.match.id === activeThreadId) || dmThreads[0];
  const [detailProfile, setDetailProfile] = useState(null);
  const activeProfile = activeThread ? profileFromMatch(activeThread.match) : null;

  // 同一スレッドへの多重既読APIコールを防ぐ
  const lastMarkedRef = useRef(null);
  useEffect(() => {
    const threadId = activeThread?.match?.id;
    if (!threadId || lastMarkedRef.current === threadId) return;
    lastMarkedRef.current = threadId;
    markDmRead(threadId);
  }, [activeThread?.match?.id, markDmRead]);

  const hasUserMessage = Boolean(activeThread?.messages?.some((m) => m.sender === 'user' && !m.system));

  return (
    <div className="dm-panel dm-panel-with-profile">
      <aside className="dm-thread-list">
        <div className="dm-head"><h3>ダイレクトメッセージ</h3><span>{dmThreads.length}件</span></div>
        {dmThreads.length ? dmThreads.map((thread) => {
          const lastMessage = thread.messages.at(-1);
          const threadProfile = profileFromMatch(thread.match);
          return (
            <button
              className={cx('dm-thread', activeThread?.match.id === thread.match.id && 'active', thread.unreadCount > 0 && 'unread')}
              key={thread.match.id}
              onClick={() => selectDmThread(thread.match.id)}
            >
              <b>{thread.match.profileName}{thread.unreadCount > 0 && <em>{thread.unreadCount}</em>}</b>
              <small>{threadProfile.riotId || threadProfile.rank || 'プロフィール未設定'}</small>
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
              <div><h3>{activeThread.match.profileName}</h3><span>{activeProfile?.riotId || 'メッセージ解放済み'}</span></div>
              <div className="dm-head-actions dm-head-actions-compact">
                <button type="button" onClick={() => setDetailProfile(activeProfile)}>プロフィール</button>
              </div>
            </div>
            <div className="dm-messages" data-copyable>
              {activeThread.messages.map((message) => (
                <div className={cx('dm-bubble', message.sender === 'user' && 'mine')} key={message.id}>
                  <p>{message.body}</p>
                  <div className="dm-message-meta">
                    {message.sender === 'user' && (
                      <span className={cx('dm-read-state', message.readAt && 'read')}>{message.readAt ? '既読' : '送信済み'}</span>
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
            <form className="dm-form" onSubmit={sendDm} data-sending={dmSending ? 'true' : 'false'}>
              <input value={dmDraft} maxLength="500" onChange={(e) => setDmDraft(e.target.value)} placeholder={`${activeThread.match.profileName}へメッセージを送信`} />
              <button className="primary" type="submit" disabled={dmSending || !dmDraft.trim()}>{dmSending ? '送信中' : '送信'}</button>
            </form>
            {detailProfile && <ProfileDetailModal profile={detailProfile} onClose={() => setDetailProfile(null)} />}
          </>
        ) : (
          <div className="locked-panel"><h3>メッセージはマッチ後に解放</h3><p>お互いにいいねすると、ここに1対1の会話が表示されます。</p></div>
        )}
      </section>

      {activeThread && activeProfile && (
        <DmProfileSidebar
          profile={activeProfile}
          onOpenDetail={() => setDetailProfile(activeProfile)}
          onReport={() => reportProfile(activeThread.match.profileId, activeThread.match.profileName)}
          onBlock={() => blockProfile(activeThread.match.profileId, activeThread.match.profileName)}
        />
      )}
    </div>
  );
}
