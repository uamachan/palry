import React from 'react';

/**
 * 再利用 UI プリミティブ。
 * 既存の手書き JSX を一括置換するのではなく、新規 UI（スケルトン・空表示・404・
 * 同意バナー等）で参照する共通部品としてまず導入する。
 */

/** スケルトン1本（幅・高さ指定可） */
export function Skeleton({ width = '100%', height = 14, radius, style, className = '' }) {
  return (
    <span
      className={`ui-skeleton ${className}`}
      aria-hidden="true"
      style={{ width, height, ...(radius ? { borderRadius: radius } : null), ...style }}
    />
  );
}

/** カード型スケルトン（候補プロフィール等） */
export function SkeletonCard() {
  return (
    <div className="ui-skeleton-card" aria-hidden="true">
      <Skeleton height={180} radius={14} />
      <Skeleton width="60%" height={18} />
      <Skeleton width="40%" height={14} />
      <Skeleton width="90%" height={12} />
    </div>
  );
}

/** リスト型スケルトン（DM・通知一覧） */
export function SkeletonList({ rows = 3 }) {
  return (
    <div className="ui-skeleton-list" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ui-skeleton-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={44} height={44} radius="50%" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="50%" height={14} />
            <Skeleton width="80%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 404 ページ（不正な URL） */
export function NotFound() {
  return (
    <div className="ui-notfound" role="main">
      <img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" width="132" height="44" />
      <div className="ui-notfound-code">404</div>
      <h2>ページが見つかりません</h2>
      <p>お探しのページは存在しないか、移動した可能性があります。</p>
      <a className="primary" href="/" style={{ textDecoration: 'none' }}>ホームに戻る</a>
    </div>
  );
}

