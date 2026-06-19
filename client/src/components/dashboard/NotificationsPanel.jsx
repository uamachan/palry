import React, { useMemo, useState } from 'react';
import { TAB_ICONS } from '../../constants.jsx';
import { SkeletonList } from '../../ui/primitives.jsx';

function relativeTime(value) {
  const time = value ? new Date(value).getTime() : 0;
  if (!Number.isFinite(time) || time <= 0) return '';
  const diff = Date.now() - time;
  if (diff < 60 * 1000) return 'たった今';
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))}分前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 3600000))}時間前`;
  if (diff < 48 * 60 * 60 * 1000) return '昨日';
  return `${Math.max(2, Math.floor(diff / 86400000))}日前`;
}

function initialOf(name) {
  return String(name || 'P').trim().slice(0, 2) || 'P';
}

function NotificationAvatar({ src, name, tone = 'pink' }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`notification-avatar notification-avatar--${tone}`} aria-hidden="true">
      {src && !failed ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <span>{initialOf(name)}</span>}
    </div>
  );
}

export default function NotificationsPanel({ receivedLikes, dmThreads, setActiveTab, selectDmThread, acceptLike, likesLoading, dmLoading }) {
  const [filter, setFilter] = useState('all');
  const unreadThreads = dmThreads.filter((t) => Number(t.unreadCount || 0) > 0);
  const recentThreads = dmThreads.slice(0, 5);
  const totalUnread = receivedLikes.length + unreadThreads.reduce((sum, t) => sum + Number(t.unreadCount || 0), 0);
  const loadingFirstLoad = (likesLoading || dmLoading) && !receivedLikes.length && !dmThreads.length;

  const items = useMemo(() => {
    const likeItems = receivedLikes.map((like) => ({
      id: `like_${like.id}`,
      kind: 'like',
      name: like.fromProfileName || '相手',
      photo: like.fromPhoto || '',
      chip: 'いいね',
      title: 'あなたにいいねしました',
      subtitle: `${like.fromRank || 'ランク未設定'}・${like.fromRole || 'ロール未設定'}`,
      time: relativeTime(like.createdAt),
      action: 'いいね返し',
      tone: 'gold',
      important: true,
      onAction: () => acceptLike(like.id),
    }));

    const unreadItems = unreadThreads.map((thread) => ({
      id: `dm_${thread.match.id}`,
      kind: 'dm',
      name: thread.match.profileName || '相手',
      photo: thread.match.profilePhoto || '',
      chip: 'DM',
      title: `${thread.unreadCount}件の未読があります`,
      subtitle: thread.messages?.at?.(-1)?.body || '新しいメッセージが届いています',
      time: relativeTime(thread.match.sortAt || thread.match.createdAt),
      action: '開く',
      tone: 'teal',
      onAction: () => { selectDmThread(thread.match.id); setActiveTab('dm'); },
    }));

    const matchItems = recentThreads.map((thread) => ({
      id: `match_${thread.match.id}`,
      kind: 'match',
      name: thread.match.profileName || '相手',
      photo: thread.match.profilePhoto || '',
      chip: 'マッチ',
      title: 'マッチしました！DMを送ってみましょう',
      subtitle: `${thread.match.profileRank || 'ランク未設定'}・${thread.match.profileRole || 'ロール未設定'}`,
      time: relativeTime(thread.match.sortAt || thread.match.createdAt),
      action: 'DMを送る',
      tone: 'pink',
      highlight: true,
      onAction: () => { selectDmThread(thread.match.id); setActiveTab('dm'); },
    }));

    const seen = new Set();
    return [...likeItems, ...unreadItems, ...matchItems].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [receivedLikes, unreadThreads, recentThreads, acceptLike, selectDmThread, setActiveTab]);

  const visibleItems = filter === 'all' ? items : items.filter((item) => item.kind === filter);

  return (
    <div className="notifications-panel list-panel" aria-label="通知パネル">
      <div className="notifications-head">
        <div><h3>通知・いいね</h3></div>
        {totalUnread > 0 && <b aria-label={`${totalUnread}件の通知`}>{totalUnread}件</b>}
      </div>

      <div className="notification-filters" aria-label="通知フィルター">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>すべて</button>
        <button type="button" className={filter === 'like' ? 'active' : ''} onClick={() => setFilter('like')}>いいね</button>
        <button type="button" className={filter === 'match' ? 'active' : ''} onClick={() => setFilter('match')}>マッチ</button>
      </div>

      <div className="notification-list" role="list">
        {loadingFirstLoad && <SkeletonList rows={3} />}
        {visibleItems.map((item) => (
          <article className={`notification-card notification-card--${item.kind}${item.highlight ? ' notification-card--highlight' : ''}${item.important ? ' important' : ''}`} key={item.id} role="listitem">
            <NotificationAvatar src={item.photo} name={item.name} tone={item.tone} />
            <div className="notification-card-body">
              <div className="notification-card-title-row">
                <b>{item.name}</b>
                <span className={`notification-chip notification-chip--${item.kind}`}>{item.chip}</span>
              </div>
              <p>{item.title}</p>
              <small>{item.subtitle}</small>
            </div>
            <div className="notification-card-side">
              {item.time && <time>{item.time}</time>}
              <button type="button" onClick={item.onAction}>{item.action}</button>
            </div>
          </article>
        ))}
        {!loadingFirstLoad && !visibleItems.length && (
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
