import React, { useState } from 'react';
import { cx, planLabel, TAB_ICONS } from './constants.jsx';

function maskEmail(email) {
  const value = String(email || '');
  const [name, domain] = value.split('@');
  if (!name || !domain) return value;
  const head = name.slice(0, Math.min(2, name.length));
  return `${head}***@${domain}`;
}

/**
 * サイトヘッダー。
 * ランディングページとアプリ画面の両方で共用するため独立ファイルに切り出す。
 * AppDashboard.jsx が React.lazy で遅延読み込みされるとき循環依存を避けるために必要。
 */
export default function SiteHeader({
  isAuthed, user, plan, notificationCount,
  onAuth, onOpenApp, openProfileEditor, logout,
  onGoApp, onGoNotifications, onGoPricing, onGoSafety,
  brandHref, onBrandClick,
  activeTab, setActiveTab,
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const logo = <img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" width="132" height="44" decoding="async" fetchPriority="high" />;
  const accountSubtext = user?.email ? maskEmail(user.email) : user?.riotId;

  const brandEl = onBrandClick
    ? (
      <button className="brand app-brand-button" type="button" onClick={onBrandClick} aria-label="Pairlyトップへ">
        {logo}
      </button>
    )
    : (
      <a className="brand" href={brandHref || '#top'}>
        {logo}
      </a>
    );

  return (
    <header className="site-header">
      {brandEl}
      <nav className="site-nav">
        {setActiveTab ? (
          <>
            <button type="button" className={cx('nav-button', activeTab === 'match' && 'active')} onClick={() => setActiveTab('match')}>マッチング</button>
            <button type="button" className={cx('nav-button', activeTab === 'pricing' && 'active')} onClick={() => setActiveTab('pricing')}>料金</button>
            <button type="button" className={cx('nav-button', activeTab === 'safety' && 'active')} onClick={() => setActiveTab('safety')}>安全・規約</button>
          </>
        ) : (
          <>
            <button className="nav-button" onClick={onOpenApp}>マッチング</button>
            <a href="#pricing">料金</a>
            <a href="#safety">安全・規約</a>
          </>
        )}
      </nav>
      <div className="header-actions">
        {isAuthed
          ? <span className="plan-pill">{planLabel(plan)}</span>
          : <button className="primary small" onClick={onAuth}>ログイン / 登録</button>}
        {isAuthed && user && (
          <>
            <button
              className={cx('appv2-notification-btn', activeTab === 'notifications' && 'active', notificationCount > 0 && 'has-unread')}
              type="button"
              onClick={onGoNotifications || (() => setActiveTab?.('notifications'))}
              aria-label="通知"
            >
              {TAB_ICONS.notifications}
              {notificationCount > 0 && <em>{notificationCount}</em>}
            </button>
            <div className="account-menu">
              <button
                className={cx('appv2-avatar', accountOpen && 'active')}
                type="button"
                onClick={() => setAccountOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                {user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0, 1) || 'P')}
              </button>
              {accountOpen && (
                <div className="account-dropdown" role="menu">
                  <div className="account-dropdown-head">
                    <div className="account-dropdown-avatar">
                      {user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0, 1) || 'P')}
                    </div>
                    <div>
                      <b>{user.name}</b>
                      <span>{accountSubtext}</span>
                    </div>
                  </div>
                  <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); openProfileEditor?.(); }}>プロフィール編集</button>
                  <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); (onGoApp || onOpenApp)?.(); }}>マッチングへ</button>
                  {setActiveTab && <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); setActiveTab('pricing'); }}>料金プラン</button>}
                  {setActiveTab && <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); setActiveTab('safety'); }}>安全・規約</button>}
                  <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); logout?.(); }}>ログアウト</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
