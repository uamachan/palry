import React from 'react';

export default function FootprintsPanel({ footprints, plan }) {
  return (
    <div className="list-panel">
      <h3>足あと</h3>
      {plan === 'FREE' && <p className="hint">足あと詳細はPLUS/VIP向け機能です。デモでは直近ログのみ表示します。</p>}
      {footprints.length ? footprints.map((f, i) => (
        <div className="list-row" key={f.id || i}>
          <b>{typeof f.name === 'string' ? f.name : ''}</b>
          <p>{typeof f.rank === 'string' ? f.rank : ''}{f.gender ? ` / ${f.gender}` : ''}</p>
          <span>{typeof f.action === 'string' ? f.action : ''}・{f.createdAt ? new Date(f.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
      )) : <p className="empty-text">まだ足あとがありません。</p>}
    </div>
  );
}
