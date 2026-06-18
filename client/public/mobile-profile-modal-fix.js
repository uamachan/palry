(() => {
  const STYLE_ID = 'pairly-mobile-profile-runtime-fix';
  const labels = ['基本', 'ロール', 'プレイ', '追加', '紹介', '規約'];

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
    width: min(100vw, 430px) !important;
    max-width: 100vw !important;
    height: 100dvh !important;
    min-height: 100dvh !important;
    max-height: 100dvh !important;
    border-radius: 0 !important;
    padding: 8px !important;
    overflow: hidden !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .auth-close {
    position: absolute !important;
    top: calc(8px + env(safe-area-inset-top, 0px)) !important;
    right: 10px !important;
    z-index: 70 !important;
    width: 34px !important;
    height: 34px !important;
    min-height: 34px !important;
    font-size: 21px !important;
  }

  html body .auth-modal--profile .profile-setup-panel,
  html body .auth-modal--profile .email-signup-panel {
    width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    padding: calc(8px + env(safe-area-inset-top, 0px)) 6px 0 !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-heading {
    flex: 0 0 auto !important;
    margin: 0 0 6px !important;
    padding-right: 44px !important;
  }

  html body .auth-modal--profile .profile-setup-heading h2 {
    margin: 0 0 2px !important;
    font-size: clamp(22px, 6.4vw, 30px) !important;
    line-height: 1.05 !important;
    letter-spacing: -.04em !important;
  }

  html body .auth-modal--profile .profile-setup-heading p {
    margin: 0 !important;
    font-size: 12px !important;
    line-height: 1.2 !important;
  }

  html body .auth-modal--profile .email-signup-form.profile-setup-card,
  html body .auth-modal--profile .profile-setup-card {
    flex: 1 1 auto !important;
    min-height: 0 !important;
    height: auto !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 6px !important;
    overflow: hidden !important;
    padding: 0 !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-progress {
    flex: 0 0 auto !important;
    height: 6px !important;
    min-height: 6px !important;
    margin: 0 !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs {
    flex: 0 0 42px !important;
    width: 100% !important;
    max-width: 100% !important;
    height: 42px !important;
    min-height: 42px !important;
    max-height: 42px !important;
    display: flex !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 5px !important;
    overflow: visible !important;
    white-space: nowrap !important;
    margin: 0 !important;
    padding: 0 0 4px !important;
    border-bottom: 1px solid var(--line, #e7e0d8) !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button {
    flex: 1 1 0 !important;
    width: auto !important;
    max-width: none !important;
    min-width: 0 !important;
    height: 35px !important;
    min-height: 35px !important;
    padding: 7px 2px !important;
    font-size: 11px !important;
    line-height: 1 !important;
    letter-spacing: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: clip !important;
    text-align: center !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button::before,
  html body .auth-modal--profile .profile-setup-card .setup-tabs button::after {
    content: none !important;
    display: none !important;
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
    padding: 10px 10px calc(76px + env(safe-area-inset-bottom, 0px)) !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-card > .pv-rank-section {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
  }

  html body .auth-modal--profile .pv-field-group {
    gap: 8px !important;
    margin: 0 !important;
  }

  html body .auth-modal--profile .pv-label {
    font-size: 18px !important;
    line-height: 1.2 !important;
  }

  html body .auth-modal--profile .pv-req {
    font-size: 11px !important;
    padding: 3px 7px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-grid {
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 6px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn {
    min-height: 62px !important;
    height: 62px !important;
    padding: 5px 3px !important;
    border-radius: 16px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn img {
    width: 27px !important;
    height: 27px !important;
    margin: 0 auto 2px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-label {
    max-width: 100% !important;
    font-size: 10px !important;
    line-height: 1.05 !important;
  }

  html body .auth-modal--profile .pv-rank-sub-row {
    gap: 7px !important;
    margin-top: 8px !important;
  }

  html body .auth-modal--profile .pv-rank-sub-btn {
    width: 48px !important;
    height: 48px !important;
    min-height: 48px !important;
    border-radius: 15px !important;
    font-size: 18px !important;
  }

  html body .auth-modal--profile .pv-role-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }

  html body .auth-modal--profile .pv-role-card {
    min-height: 54px !important;
    height: 54px !important;
    padding: 8px 10px !important;
    border-radius: 18px !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 7px !important;
  }

  html body .auth-modal--profile .pv-role-icon {
    width: 30px !important;
    height: 30px !important;
    min-width: 30px !important;
    border-radius: 12px !important;
  }

  html body .auth-modal--profile .pv-role-icon img {
    width: 20px !important;
    height: 20px !important;
  }

  html body .auth-modal--profile .pv-role-name {
    font-size: 15px !important;
    line-height: 1.1 !important;
    white-space: nowrap !important;
  }

  html body .auth-modal--profile .pv-role-desc {
    display: none !important;
  }

  html body .auth-modal--profile .profile-setup-actions {
    flex: 0 0 auto !important;
    position: relative !important;
    z-index: 50 !important;
    display: flex !important;
    flex-direction: row !important;
    gap: 8px !important;
    margin: 0 !important;
    padding: 8px 0 calc(8px + env(safe-area-inset-bottom, 0px)) !important;
    background: var(--paper, #fffdf9) !important;
    box-shadow: 0 -10px 22px rgba(31, 25, 20, .08) !important;
  }

  html body .auth-modal--profile .profile-setup-actions .secondary,
  html body .auth-modal--profile .profile-setup-actions .primary {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
    min-height: 46px !important;
    padding: 10px 12px !important;
  }
}

@media (max-width: 380px) {
  html body .auth-modal--profile .profile-setup-heading h2 {
    font-size: 22px !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs {
    gap: 4px !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button {
    padding: 7px 1px !important;
    font-size: 10px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn {
    height: 58px !important;
    min-height: 58px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn img {
    width: 24px !important;
    height: 24px !important;
  }

  html body .auth-modal--profile .pv-role-name {
    font-size: 14px !important;
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
        if (!label) return;
        if (button.textContent.trim() !== label) button.textContent = label;
        button.setAttribute('aria-label', label);
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

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  [0, 100, 250, 600, 1200, 2500].forEach((delay) => setTimeout(run, delay));
})();
