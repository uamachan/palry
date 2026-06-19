import React from 'react';

function formatFootprintTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function footprintInitial(name) {
  return String(name || 'P').trim().slice(0, 2) || 'P';
}

export default function FootprintsPanel({ footprints, plan }) {
  const isFree = plan === 'FREE';

  return (
    <section className="footprints-panel" aria-label="足あと">
      <div className="footprints-card">
        <div className="footprints-head">
          <div>
            <span className="footprints-eyebrow">Activity</span>
            <h3>足あと</h3>
          </div>
          {isFree && <span className="footprints-lock-pill">PLUS/VIPで解放</span>}
        </div>

        {isFree && (
          <p className="footprints-hint">足あと詳細はPLUS/VIP向け機能です。デモでは直近ログのみ表示します。</p>
        )}

        <div className="footprints-list" role="list">
          {footprints.length ? footprints.map((f, i) => {
            const name = typeof f.name === 'string' ? f.name : '';
            const rank = typeof f.rank === 'string' ? f.rank : '';
            const action = typeof f.action === 'string' ? f.action : '';
            const time = f.createdAt ? formatFootprintTime(f.createdAt) : '';
            return (
              <article className="footprint-row" key={f.id || i} role="listitem">
                <div className="footprint-avatar" aria-hidden="true">{footprintInitial(name || action)}</div>
                <div className="footprint-main">
                  <div className="footprint-title-row">
                    <b>{name || '相手'}</b>
                    {action && <span>{action}</span>}
                  </div>
                  <p>{rank || 'ランク未設定'}{f.gender ? `・${f.gender}` : ''}</p>
                </div>
                {time && <time>{time}</time>}
              </article>
            );
          }) : (
            <div className="footprints-empty">
              <div className="footprints-empty-icon" aria-hidden="true">◷</div>
              <h4>まだ足あとがありません</h4>
              <p>プロフィール閲覧やLIKEの履歴がここに表示されます。</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
