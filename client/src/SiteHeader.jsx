import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const avatarBtnRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const logo = <img src="/assets/pairly-logo-wide-transparent.svg" alt="Pairly" width="132" height="44" decoding="async" fetchPriority="high" />;

  useEffect(() => {
    if (!accountOpen) return;
    const btn = avatarBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    const close = (e) => { if (!e.target.closest('.account-dropdown')) setAccountOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [accountOpen]);
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
                ref={avatarBtnRef}
                className={cx('appv2-avatar', accountOpen && 'active')}
                type="button"
                onClick={() => setAccountOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
              >
                {user.profilePhoto ? <img src={user.profilePhoto} alt="" /> : (user.name?.slice(0, 1) || 'P')}
              </button>
              {accountOpen && createPortal(
                <div className="account-dropdown" role="menu" style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 200 }}>
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
                  <button type="button" role="menuitem" onClick={() => { setAccountOpen(false); logout?.(); }}>ログアウト</button>
                </div>,
                document.body
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
