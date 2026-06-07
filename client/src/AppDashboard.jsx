import React, { useRef } from 'react';
import { appTabs, cx, planLabel, TAB_ICONS } from './constants.jsx';
import SiteHeader from './SiteHeader.jsx';
import { SafetyCompact } from './Safety.jsx';

import MatchPanel from './components/dashboard/MatchPanel.jsx';
import PricingPanel from './components/dashboard/PricingPanel.jsx';
import NotificationsPanel from './components/dashboard/NotificationsPanel.jsx';
import DmPanel from './components/dashboard/DmPanel.jsx';
import FootprintsPanel from './components/dashboard/FootprintsPanel.jsx';
import ProfilePanel from './components/dashboard/ProfilePanel.jsx';
import AdminPanel from './components/dashboard/AdminPanel.jsx';

// ─── TabPanel ──────────────────────────────────────────────────────
function TabPanel(props) {
  switch (props.activeTab) {
    case 'match': return <MatchPanel {...props} />;
    case 'pricing': return <PricingPanel {...props} />;
    case 'safety': return <SafetyCompact />;
    case 'notifications': return <NotificationsPanel {...props} />;
    case 'dm': return <DmPanel {...props} />;
    case 'footprints': return <FootprintsPanel {...props} />;
    case 'profile': return <ProfilePanel {...props} />;
    case 'admin': return props.user?.isAdmin ? <AdminPanel {...props} /> : <MatchPanel {...props} />;
    default: return <MatchPanel {...props} />;
  }
}

export default function AppDashboard(props) {
  const { activeTab, setActiveTab, tabs = appTabs, onBackSite, user, plan, notificationCount, unreadDmCount, openProfileEditor, logout } = props;
  const contentRef = useRef(null);

  function goAppTab(tab) {
    setActiveTab(tab);
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  return (
    <div className="appv2">
      <SiteHeader
        isAuthed={true}
        user={user}
        plan={plan}
        notificationCount={notificationCount}
        onBrandClick={() => goAppTab('match')}
        activeTab={activeTab}
        setActiveTab={goAppTab}
        onGoApp={() => goAppTab('match')}
        onGoNotifications={() => goAppTab('notifications')}
        openProfileEditor={openProfileEditor}
        logout={logout}
      />
      <main ref={contentRef} className={cx('appv2-content', activeTab === 'dm' && 'appv2-content--dm', activeTab !== 'match' && activeTab !== 'dm' && 'appv2-content--scroll')} key={activeTab}>
        <TabPanel {...props} />
      </main>
      <nav className="appv2-bottom-nav" aria-label="アプリメニュー">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" className={cx('appv2-nav-btn', activeTab === tab.id && 'active')} onClick={() => goAppTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
            <span className="appv2-nav-icon">{TAB_ICONS[tab.id]}{tab.id === 'notifications' && notificationCount > 0 && <em className="appv2-nav-badge">{notificationCount}</em>}{tab.id === 'dm' && unreadDmCount > 0 && <em className="appv2-nav-badge">{unreadDmCount}</em>}</span>
            <span className="appv2-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
