import React from 'react';
import { TAB_ICONS } from '../../constants.jsx';
import { SkeletonList } from '../../ui/primitives.jsx';

export default function NotificationsPanel({ receivedLikes, dmThreads, setActiveTab, selectDmThread, acceptLike, likesLoading, dmLoading }) {
  const unreadThreads = dmThreads.filter((t) => Number(t.unreadCount || 0) > 0);
  const recentThreads = dmThreads.slice(0, 3);
  const totalUnread = receivedLikes.length + unreadThreads.reduce((sum, t) => sum + Number(t.unreadCount || 0), 0);
  const loadingFirstLoad = (likesLoading || dmLoading) && !receivedLikes.length && !dmThreads.length;
  return (
    <div className="notifications-panel list-panel" aria-label="通知パネル">
      <div className="notifications-head">
        <div><h3>通知</h3></div>
        {totalUnread > 0 && <b aria-label={`${totalUnread}件の通知`}>{totalUnread}件</b>}
      </div>
      <div className="notification-list" role="list">
        {loadingFirstLoad && <SkeletonList rows={3} />}
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
        {!loadingFirstLoad && !receivedLikes.length && !unreadThreads.length && !recentThreads.length && (
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
