(() => {
  const STYLE_ID = 'pairly-app-nav-runtime-fix';

  const css = `
html body #root .appv2 {
  padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important;
}

html body #root .appv2-content,
html body #root .appv2-content--scroll,
html body #root .appv2-content--dm {
  padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important;
}

html body #root .appv2-bottom-nav {
  position: fixed !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  top: auto !important;
  transform: none !important;
  width: 100vw !important;
  max-width: none !important;
  min-width: 0 !important;
  height: calc(74px + env(safe-area-inset-bottom, 0px)) !important;
  min-height: calc(74px + env(safe-area-inset-bottom, 0px)) !important;
  margin: 0 !important;
  padding: 8px max(14px, env(safe-area-inset-left, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) max(14px, env(safe-area-inset-right, 0px)) !important;
  box-sizing: border-box !important;
  display: grid !important;
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  grid-auto-flow: column !important;
  gap: 4px !important;
  overflow: visible !important;
  border: 0 !important;
  border-top: 1px solid rgba(232, 224, 214, .95) !important;
  border-radius: 0 !important;
  background: rgba(255, 253, 249, .96) !important;
  backdrop-filter: blur(18px) saturate(1.12) !important;
  box-shadow: 0 -12px 32px rgba(31, 25, 20, .07) !important;
  z-index: 180 !important;
}

html body #root .appv2-bottom-nav .appv2-nav-btn {
  display: grid !important;
  visibility: visible !important;
  opacity: 1 !important;
  min-width: 0 !important;
  width: auto !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 5px 2px !important;
  place-items: center !important;
  align-content: center !important;
  gap: 3px !important;
  border: 0 !important;
  border-radius: 18px !important;
  background: transparent !important;
  color: #8a847d !important;
  font-weight: 900 !important;
  text-align: center !important;
}

html body #root .appv2-bottom-nav .appv2-nav-btn.active {
  color: var(--pairly-pink, #EE4374) !important;
}

html body #root .appv2-bottom-nav .appv2-nav-icon {
  position: relative !important;
  width: 30px !important;
  height: 30px !important;
  display: grid !important;
  place-items: center !important;
}

html body #root .appv2-bottom-nav .appv2-nav-icon svg {
  width: 25px !important;
  height: 25px !important;
}

html body #root .appv2-bottom-nav .appv2-nav-label {
  display: block !important;
  max-width: 100% !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  font-size: 11px !important;
  line-height: 1.12 !important;
  letter-spacing: 0 !important;
}

html body #root .appv2-bottom-nav .appv2-nav-badge {
  position: absolute !important;
  top: -5px !important;
  right: -8px !important;
  min-width: 17px !important;
  height: 17px !important;
  padding: 0 5px !important;
  border-radius: 999px !important;
  display: grid !important;
  place-items: center !important;
  background: var(--pairly-pink, #EE4374) !important;
  color: #fff !important;
  font-size: 10px !important;
  font-style: normal !important;
  font-weight: 900 !important;
  box-shadow: 0 0 0 2px #fffdf9 !important;
}

@media (max-width: 380px) {
  html body #root .appv2-bottom-nav {
    padding-left: 10px !important;
    padding-right: 10px !important;
  }

  html body #root .appv2-bottom-nav .appv2-nav-label {
    font-size: 10.5px !important;
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

  function ensureNavIntegrity() {
    const nav = document.querySelector('#root .appv2-bottom-nav');
    if (!nav) return;
    nav.style.setProperty('display', 'grid', 'important');
    nav.style.setProperty('grid-template-columns', 'repeat(4, minmax(0, 1fr))', 'important');
    nav.style.setProperty('width', '100vw', 'important');
    [...nav.querySelectorAll('.appv2-nav-btn')].forEach((button) => {
      button.style.setProperty('display', 'grid', 'important');
      button.style.setProperty('visibility', 'visible', 'important');
      button.style.setProperty('opacity', '1', 'important');
    });
  }

  function run() {
    ensureStyle();
    ensureNavIntegrity();
  }

  let raf = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  [0, 50, 150, 300, 700, 1200, 2500].forEach((delay) => setTimeout(run, delay));
})();
