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
    justify-content: center !important;
    gap: 8px !important;
    overflow: hidden !important;
    white-space: nowrap !important;
    margin: 0 !important;
    padding: 0 0 4px !important;
    border-bottom: 1px solid var(--line, #e7e0d8) !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button {
    display: none !important;
    flex: 1 1 0 !important;
    width: auto !important;
    max-width: 150px !important;
    min-width: 0 !important;
    height: 35px !important;
    min-height: 35px !important;
    padding: 7px 8px !important;
    font-size: 12px !important;
    line-height: 1 !important;
    letter-spacing: 0 !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: clip !important;
    text-align: center !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button.pairly-tab-visible {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button.active.pairly-tab-visible {
    flex: 1.15 1 0 !important;
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
    padding: 10px 10px calc(88px + env(safe-area-inset-bottom, 0px)) !important;
    box-sizing: border-box !important;
  }

  html body .auth-modal--profile .profile-setup-card > .pv-rank-section {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
  }

  html body .auth-modal--profile .pv-field-group {
    gap: 7px !important;
    margin: 0 !important;
  }

  html body .auth-modal--profile .pv-label {
    font-size: 17px !important;
    line-height: 1.18 !important;
  }

  html body .auth-modal--profile .pv-req {
    font-size: 11px !important;
    padding: 3px 7px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-grid {
    display: grid !important;
    grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
    gap: 5px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn {
    min-height: 58px !important;
    height: 58px !important;
    padding: 4px 3px !important;
    border-radius: 15px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn img {
    width: 25px !important;
    height: 25px !important;
    margin: 0 auto 2px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-label {
    max-width: 100% !important;
    font-size: 10px !important;
    line-height: 1.05 !important;
  }

  html body .auth-modal--profile .pv-rank-sub-row {
    gap: 6px !important;
    margin-top: 7px !important;
  }

  html body .auth-modal--profile .pv-rank-sub-btn {
    width: 46px !important;
    height: 46px !important;
    min-height: 46px !important;
    border-radius: 15px !important;
    font-size: 17px !important;
  }

  html body .auth-modal--profile .pv-role-grid {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    gap: 7px !important;
  }

  html body .auth-modal--profile .pv-role-card {
    min-height: 46px !important;
    height: 46px !important;
    padding: 6px 9px !important;
    border-radius: 16px !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
  }

  html body .auth-modal--profile .pv-role-icon {
    width: 26px !important;
    height: 26px !important;
    min-width: 26px !important;
    border-radius: 10px !important;
  }

  html body .auth-modal--profile .pv-role-icon img {
    width: 18px !important;
    height: 18px !important;
  }

  html body .auth-modal--profile .pv-role-name {
    font-size: 14px !important;
    line-height: 1.08 !important;
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
    padding: 7px 0 calc(7px + env(safe-area-inset-bottom, 0px)) !important;
    background: var(--paper, #fffdf9) !important;
    box-shadow: 0 -10px 22px rgba(31, 25, 20, .08) !important;
  }

  html body .auth-modal--profile .profile-setup-actions .secondary,
  html body .auth-modal--profile .profile-setup-actions .primary {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    width: auto !important;
    min-height: 44px !important;
    padding: 9px 12px !important;
  }
}

@media (max-width: 380px) {
  html body .auth-modal--profile .profile-setup-heading h2 {
    font-size: 22px !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs {
    gap: 6px !important;
  }

  html body .auth-modal--profile .profile-setup-card .setup-tabs button {
    padding: 7px 6px !important;
    font-size: 11px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn {
    height: 54px !important;
    min-height: 54px !important;
  }

  html body .auth-modal--profile .pv-rank-icon-btn img {
    width: 23px !important;
    height: 23px !important;
  }

  html body .auth-modal--profile .pv-role-card {
    height: 44px !important;
    min-height: 44px !important;
  }

  html body .auth-modal--profile .pv-role-name {
    font-size: 13px !important;
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

  function visibleIndexes(activeIndex, total) {
    if (total <= 3) return new Set(Array.from({ length: total }, (_, index) => index));
    if (activeIndex <= 0) return new Set([0, 1, 2]);
    if (activeIndex >= total - 1) return new Set([total - 3, total - 2, total - 1]);
    return new Set([activeIndex - 1, activeIndex, activeIndex + 1]);
  }

  function fixTabs() {
    document.querySelectorAll('.auth-modal--profile .setup-tabs').forEach((tabs) => {
      const buttons = [...tabs.querySelectorAll('button')];
      const activeIndex = Math.max(0, buttons.findIndex((button) => button.classList.contains('active')));
      const shown = visibleIndexes(activeIndex, buttons.length);

      buttons.forEach((button, index) => {
        const label = labels[index];
        if (label && button.textContent.trim() !== label) button.textContent = label;
        button.setAttribute('aria-label', label || button.textContent.trim());
        const visible = shown.has(index);
        button.classList.toggle('pairly-tab-visible', visible);
        button.classList.toggle('pairly-tab-hidden', !visible);
        if (visible) {
          button.removeAttribute('aria-hidden');
          button.removeAttribute('tabindex');
        } else {
          button.setAttribute('aria-hidden', 'true');
          button.setAttribute('tabindex', '-1');
        }
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

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  [0, 100, 250, 600, 1200, 2500].forEach((delay) => setTimeout(run, delay));
})();
