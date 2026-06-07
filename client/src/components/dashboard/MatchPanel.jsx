import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cx } from '../../constants.jsx';
import TinderProfileCard from './TinderProfileCard.jsx';
import ProfileDetailModal from './ProfileDetailModal.jsx';

function useIsMounted() {
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);
  return isMounted;
}

export default function MatchPanel({ current, swipe, reportCurrent, blockCurrent, targetGender, setTargetGender, genderFilterLocked, receivedLikes, acceptLike }) {
  const [swipeDir, setSwipeDir] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [acceptingLikeId, setAcceptingLikeId] = useState('');
  const [detailProfile, setDetailProfile] = useState(null);
  const isMounted = useIsMounted();

  const handleSwipe = useCallback(async (type) => {
    if (actionBusy || !current) return;
    setActionBusy(true);
    const dir = type === 'pass' ? 'left' : type === 'super' ? 'up' : 'right';
    try {
      setSwipeDir(dir);
      await new Promise((r) => setTimeout(r, 300));
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
