import React from 'react';

export default function FootprintsPanel({ footprints, plan }) {
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
