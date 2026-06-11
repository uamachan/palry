import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cx } from '../../constants.jsx';
import TinderProfileCard from './TinderProfileCard.jsx';
import ProfileDetailModal from './ProfileDetailModal.jsx';
import { SkeletonCard } from '../../ui/primitives.jsx';

const RANK_LABELS = { Iron: 'アイアン', Bronze: 'ブロンズ', Silver: 'シルバー', Gold: 'ゴールド', Platinum: 'プラチナ', Diamond: 'ダイヤモンド', Ascendant: 'アセンダント', Immortal: 'イモータル', Radiant: 'レディアント' };

function useIsMounted() {
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);
  return isMounted;
}

export default function MatchPanel({ current, swipe, reportCurrent, blockCurrent, targetGender, setTargetGender, targetRank, setTargetRank, filterLocked, receivedLikes, acceptLike, profilesLoading, refreshProfiles }) {
  const [swipeDir, setSwipeDir] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [acceptingLikeId, setAcceptingLikeId] = useState('');
  const [detailProfile, setDetailProfile] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterWrapRef = useRef(null);
  const isMounted = useIsMounted();

  useEffect(() => {
    if (!filterOpen) return;
    const handleClick = (e) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target)) setFilterOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  const filterActive = targetGender !== 'all' || targetRank !== 'all';
  const filterSummary = [
    targetGender !== 'all' ? targetGender : null,
    targetRank !== 'all' ? (RANK_LABELS[targetRank] || targetRank) : null,
  ].filter(Boolean).join(' · ');

  const handleSwipe = useCallback(async (type) => {
    if (actionBusy || !current) return;
    setActionBusy(true);
    const dir = type === 'pass' ? 'left' : type === 'super' ? 'up' : 'right';
    try {
      setSwipeDir(dir);
      await new Promise((r) => setTimeout(r, 200));
      if (!isMounted.current) return;
      setSwipeDir(null);
      await swipe(type);
    } finally {
      if (isMounted.current) {
        setSwipeDir(null);
        setActionBusy(false);
      }
    }
  }, [actionBusy, current, swipe, isMounted]);

  const handleAcceptLike = useCallback(async (id) => {
    if (acceptingLikeId) return;
    setAcceptingLikeId(id);
    try { await acceptLike(id); }
    finally { 
      if (isMounted.current) setAcceptingLikeId(''); 
    }
  }, [acceptingLikeId, acceptLike, isMounted]);

  return (
    <div className="mp-wrap">
      {/* 候補指定ボタン */}
      <div className="mp-filter-btn-wrap" ref={filterWrapRef}>
        <button
          type="button"
          className={cx('mp-filter-btn', filterActive && 'mp-filter-btn--active', filterLocked && 'mp-filter-btn--locked')}
          onClick={() => { if (!filterLocked) setFilterOpen((o) => !o); }}
          aria-expanded={filterOpen}
          aria-label="候補を絞り込む"
        >
          <svg className="mp-filter-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 1.5c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4Z"/>
          </svg>
          <span className="mp-filter-btn-label">
            {filterLocked ? 'PLUS/VIPで解放' : filterSummary || '候補を絞る'}
          </span>
          {filterActive && !filterLocked && <span className="mp-filter-dot" aria-hidden="true" />}
        </button>

        {filterOpen && !filterLocked && (
          <div className="mp-filter-popover" role="dialog" aria-label="絞り込み設定">
            <div className="mp-filter-popover-row">
              <label htmlFor="gender-filter" className="mp-filter-popover-label">性別</label>
              <select id="gender-filter" className="mp-filter-select" value={targetGender} onChange={(e) => setTargetGender(e.target.value)}>
                <option value="all">すべて</option>
                <option value="女性">女性</option>
                <option value="男性">男性</option>
                <option value="その他/未設定">その他</option>
              </select>
            </div>
            <div className="mp-filter-popover-row">
              <label htmlFor="rank-filter" className="mp-filter-popover-label">ランク帯</label>
              <select id="rank-filter" className="mp-filter-select" value={targetRank} onChange={(e) => setTargetRank(e.target.value)}>
                <option value="all">すべて</option>
                <option value="Iron">アイアン</option>
                <option value="Bronze">ブロンズ</option>
                <option value="Silver">シルバー</option>
                <option value="Gold">ゴールド</option>
                <option value="Platinum">プラチナ</option>
                <option value="Diamond">ダイヤモンド</option>
                <option value="Ascendant">アセンダント</option>
                <option value="Immortal">イモータル</option>
                <option value="Radiant">レディアント</option>
              </select>
            </div>
            {filterActive && (
              <button type="button" className="mp-filter-clear" onClick={() => { setTargetGender('all'); setTargetRank('all'); setFilterOpen(false); }}>
                絞り込みをクリア
              </button>
            )}
          </div>
        )}
      </div>

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

      {/* プロフィールカード */}
      <div className="mp-card-wrap">
        {current ? (
          <TinderProfileCard key={current.id} profile={current} onReport={reportCurrent} onBlock={blockCurrent} swipeDir={swipeDir} onOpenProfile={setDetailProfile} />
        ) : profilesLoading ? (
          <SkeletonCard />
        ) : (
          <div className="mp-empty" role="status" aria-live="polite">
            <h3>候補がなくなりました</h3>
            <p>新しい候補を自動で読み込みます…</p>
            <button type="button" className="secondary" onClick={refreshProfiles} style={{ marginTop: '0.75rem' }}>今すぐ再読み込み</button>
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
