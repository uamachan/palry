(() => {
  const STYLE_ID = 'pairly-mobile-profile-runtime-fix';
  const labels = ['1. 基本', '2. ロール', '3. プレイスタイル', '4. 追加', '5. 自己紹介', '6. 規約'];

  const css = `
@media (max-width: 820px) {
  html body .auth-modal--profile {
    padding: 0 !important;
    overflow: hidden !important;
    align-items: stretch !important;
    justify-content: stretch !important;
  }

  html body .auth-modal--profile .auth-modal-panel,
  html body .auth-modal--profile .auth-modal-panel--profile {
    width: 100vw !important;
    max-width: 100vw !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: 100dvh !important;
    border-radius: 0 !important;
    padding: 10px !important;
    overflow: hidden !important;
  }

  html body .auth-modal--profile .profile-setup-panel,
  html body .auth-modal--profile .email-signup-panel {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    padding: calc(8px + env(safe-area-inset-top, 0px)) 10px 0 !important;
  }

  html body .auth-modal--profile .profile-setup-heading {
    flex: 0 0 auto !important;
    margin: 0 0 8px !important;
    padding-right: 54px !important;
  }

  html body .auth-modal--profile .profile-setup-heading h2 {
    margin: 0 0 3px !important;
    font-size: clamp(24px, 7vw, 32px) !important;
    line-height: 1.08 !important;
  }

  html body .auth-modal--profile .profile-setup-heading p {
    margin: 0 !important;
    font-size: 13px !important;
    line-height: 1.25 !important;
  }

  html body .auth-modal--profile .email-signup-form.profile-setup-card,
  html body .auth-modal--profile .profile-setup-card {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    height: auto !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 7px !important;
    overflow: hidden !important;
    padding: 0 !important;
    box-shadow: none !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-progress {
    flex: 0 0 auto !important;
    margin: 0 !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs {
    flex: 0 0 44px !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 44px !important;
    min-height: 44px !important;
    max-height: 44px !important;
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    white-space: nowrap !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    margin: 0 !important;
    padding: 0 1px 4px !important;
    border-bottom: 1px solid var(--line, #e7e0d8) !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs::-webkit-scrollbar {
    display: none !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button {
    flex: 0 0 auto !important;
    width: auto !important;
    max-width: none !important;
    min-width: max-content !important;
    height: 36px !important;
    min-height: 36px !important;
    padding: 7px 12px !important;
    font-size: 12px !important;
    line-height: 1 !important;
    letter-spacing: .03em !important;
    white-space: nowrap !important;
    overflow: visible !important;
    text-overflow: clip !important;
  }

  html body .auth-modal--profile .profile-setup-card > .pv-basic-grid,
  html body .auth-modal--profile .profile-setup-card > .pv-rank-section,
  html body .auth-modal--profile .profile-setup-card > .setup-stack,
  html body .auth-modal--profile .profile-setup-card > .terms-box {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior: contain !important;
    align-content: start !important;
    padding: 12px 12px 128px !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-card > .pv-rank-section {
    gap: 12px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn {
    min-height: 76px !important;
    padding: 7px 4px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn img {
    width: 32px !important;
    height: 32px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-label {
    font-size: 11px !important;
    max-width: 100% !important;
  }

  html body .auth-modal--profile .pv-rank-sub-row {
    gap: 8px !important;
    margin-top: 10px !important;
  }

  html body .auth-modal--profile .pv-rank-sub-btn {
    width: 54px !important;
    height: 54px !important;
    min-height: 54px !important;
  }

  html body .auth-modal--profile .pv-role-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 10px !important;
  }

  html body .auth-modal--profile .pv-role-card {
    min-height: 106px !important;
    padding: 10px 8px !important;
  }

  html body .auth-modal--profile .pv-role-icon {
    width: 48px !important;
    height: 48px !important;
  }

  html body .auth-modal--profile .pv-role-name {
    font-size: 18px !important;
    line-height: 1.15 !important;
  }

  html body .auth-modal--profile .pv-role-desc {
    font-size: 12px !important;
    line-height: 1.35 !important;
  }

  html body .auth-modal--profile .profile-setup-actions {
    flex: 0 0 auto !important;
    position: sticky !important;
    bottom: 0 !important;
    z-index: 40 !important;
    display: flex !important;
    flex-direction: row !important;
    gap: 10px !important;
    margin: 0 !important;
    padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px)) !important;
    background: var(--paper, #fffdf9) !important;
    box-shadow: 0 -12px 24px rgba(31, 25, 20, .08) !important;
  }

  html body .auth-modal--profile .profile-setup-actions .secondary,
  html body .auth-modal--profile .profile-setup-actions .primary {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
    min-height: 48px !important;
  }
}

@media (max-width: 380px) {
  html body .auth-modal--profile .profile-setup-card .setup-tabs button {
    padding: 7px 10px !important;
    font-size: 11px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn {
    min-height: 70px !important;
  }

  html body .auth-modal--profile .pv-role-card {
    min-height: 100px !important;
  }
}
`;

  function ensureStyle() {
    const current = document.getElementById(STYLE_ID);
    if (current) current.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function fixTabs() {
    document.querySelectorAll('.auth-modal--profile .setup-tabs').forEach((tabs) => {
      [...tabs.querySelectorAll('button')].forEach((button, index) => {
        const label = labels[index];
        if (label && button.textContent.trim() !== label) button.textContent = label;
      });
    });
  }

  function run() {
    ensureStyle();
    fixTabs();
  }

  let raf = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  [0, 250, 750, 1500, 3000].forEach((delay) => setTimeout(run, delay));
})();
