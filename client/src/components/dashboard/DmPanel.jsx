import React, { useEffect, useRef, useState } from 'react';
import { cx } from '../../constants.jsx';
import ProfileDetailModal from './ProfileDetailModal.jsx';

export const dmStarters = ['よろしくお願いします！', '何時ごろ遊べますか？', 'ランク一緒に行きませんか？'];

export function profileFromMatch(match) {
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

export default function DmPanel({ dmThreads, activeThreadId, selectDmThread, markDmRead, dmDraft, setDmDraft, sendDm, dmSending, reportProfile, blockProfile }) {
  const activeThread = dmThreads.find((t) => t.match.id === activeThreadId) || dmThreads[0];
  const [detailProfile, setDetailProfile] = useState(null);

  // 開いているスレッドを既読化する。初回オープン時に加え、表示中に新着が
  // 届いて未読が増えた場合も再度既読化する（既読後はローカルで unreadCount が
  // 0 になるため、このエフェクトは無限ループしない）。
  const lastMarkedRef = useRef(null);
  useEffect(() => {
    const threadId = activeThread?.match?.id;
    if (!threadId) return;
    const unread = Number(activeThread?.unreadCount || 0);
    if (lastMarkedRef.current === threadId && unread === 0) return;
    lastMarkedRef.current = threadId;
    markDmRead(threadId);
  }, [activeThread?.match?.id, activeThread?.unreadCount, markDmRead]);

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
            <form className="dm-form" onSubmit={sendDm}>
              <input value={dmDraft} maxLength="500" onChange={(e) => setDmDraft(e.target.value)} placeholder="メッセージを入力" />
              <button className="primary" type="submit" disabled={dmSending || !dmDraft.trim()}>{dmSending ? '送信中' : '送信'}</button>
            </form>
            {detailProfile && <ProfileDetailModal profile={profileFromMatch(activeThread.match)} onClose={() => setDetailProfile(null)} />}
          </>
        ) : (
          <div className="locked-panel"><h3>メッセージはマッチ後に解放</h3><p>お互いにいいねすると、ここに1対1の会話が表示されます。</p></div>
        )}
      </section>
    </div>
  );
}
