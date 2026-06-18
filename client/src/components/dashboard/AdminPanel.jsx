import React from 'react';

const AUDIT_LABELS = {
  report: '通報', block: 'ブロック', auto_hide: '自動非表示',
  admin_view_reports: '管理閲覧', admin_unhide: '非表示解除',
  demo_purchase_plan: 'デモプラン購入', demo_purchase_item: 'デモ単品購入',
};

export default function AdminPanel({ reports, alerts = [], auditLog = [] }) {
  return (
    <div className="list-panel">
      <h3>重要通知（多数の通報）</h3>
      {alerts.length ? alerts.map((a) => (
        <div className="list-row" key={a.id}>
          <b>⚠️ {a.profileName || '(名前なし)'}</b>
          <p>通報 {a.reportCount}件 / {a.updatedAt ? new Date(a.updatedAt).toLocaleString('ja-JP') : '-'}</p>
          <span>要確認</span>
        </div>
      )) : <p className="empty-text">重要通知はありません。</p>}
      <h3>通報管理</h3>
      {reports.length ? reports.map((r) => (
        <div className="list-row" key={r.id}>
          <b>{r.reason}</b>
          <p>{r.profileName || r.profileId || '-'}</p>
          <span>{r.status}</span>
        </div>
      )) : <p className="empty-text">通報はありません。</p>}
      <h3>監査ログ</h3>
      {auditLog.length ? auditLog.slice(0, 100).map((a) => (
        <div className="list-row" key={a.id}>
          <b>{AUDIT_LABELS[a.action] || a.action}</b>
          <p>{a.actorId || 'system'} → {a.targetId || '-'}</p>
          <span>{a.createdAt ? new Date(a.createdAt).toLocaleString('ja-JP') : ''}</span>
        </div>
      )) : <p className="empty-text">監査ログはありません。</p>}
    </div>
  );
}
