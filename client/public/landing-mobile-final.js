(() => {
  const css = `
@media (max-width: 760px) {
  /* Landing pages must scroll; app screens intentionally stay viewport-locked. */
  html:has(body #root .site-page),
  body:has(#root .site-page),
  #root:has(.site-page) {
    height: auto !important;
    min-height: 100% !important;
    max-height: none !important;
    overflow-x: hidden !important;
    overflow-y: auto !important;
  }

  html:has(body #root .appv2),
  body:has(#root .appv2),
  #root:has(.appv2) {
    height: 100% !important;
    max-height: 100% !important;
    overflow: hidden !important;
  }

  html body #root > .site-header {
    width: 100% !important;
    max-width: 100% !important;
    margin-left: 0 !important;
    margin-right: 0 !important;
    padding: 14px 16px 12px !important;
    display: flex !important;
    flex-wrap: wrap !important;
    align-items: center !important;
    gap: 10px 12px !important;
    box-sizing: border-box !important;
  }

  html body #root > .site-header .brand {
    order: 1 !important;
    flex: 0 1 auto !important;
    margin-right: 0 !important;
  }

  html body #root > .site-header .brand img {
    width: 132px !important;
    max-width: 42vw !important;
    height: auto !important;
  }

  html body #root > .site-header .header-actions {
    order: 2 !important;
    margin-left: auto !important;
    flex: 0 0 auto !important;
    justify-content: flex-end !important;
  }

  html body #root > .site-header .primary.small {
    white-space: nowrap !important;
    padding: 10px 18px !important;
  }

  html body #root > .site-header .site-nav {
    order: 3 !important;
    width: 100% !important;
    margin-left: auto !important;
    margin-right: 0 !important;
    display: flex !important;
    justify-content: flex-end !important;
    gap: 10px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    -webkit-overflow-scrolling: touch !important;
    padding-bottom: 2px !important;
  }

  html body #root > .site-header .site-nav a,
  html body #root > .site-header .site-nav .nav-button {
    flex: 0 0 auto !important;
    white-space: nowrap !important;
  }

  html body #root .site-page {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding-left: 0 !important;
    padding-right: 0 !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important;
    overflow-y: visible !important;
    text-align: center !important;
  }

  html body #root .site-page .hero,
  html body #root .site-page .hero.section,
  html body #root main.site-page .hero.section#top {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    padding: 58px 18px 54px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    justify-items: center !important;
    align-items: start !important;
    text-align: center !important;
    box-sizing: border-box !important;
    overflow: visible !important;
  }

  html body #root .site-page .hero-copy {
    width: min(100%, 430px) !important;
    max-width: 430px !important;
    min-width: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    display: grid !important;
    justify-items: center !important;
    text-align: center !important;
    box-sizing: border-box !important;
  }

  html body #root .site-page .hero-copy .eyebrow {
    display: none !important;
  }

  html body #root .site-page .hero-copy h1 {
    width: 100% !important;
    max-width: 100% !important;
    margin: 12px auto 18px !important;
    text-align: center !important;
    font-size: clamp(38px, 10.4vw, 54px) !important;
    line-height: 1.08 !important;
    letter-spacing: -0.06em !important;
  }

  html body #root .site-page .hero-copy h1 span {
    display: block !important;
    width: 100% !important;
    text-align: center !important;
  }

  html body #root .site-page .hero-copy p,
  html body #root .site-page .notice-line {
    width: 100% !important;
    max-width: 390px !important;
    margin-left: auto !important;
    margin-right: auto !important;
    text-align: center !important;
    font-size: clamp(15px, 4.3vw, 18px) !important;
    line-height: 1.8 !important;
  }

  html body #root .site-page .hero-actions {
    width: 100% !important;
    max-width: 390px !important;
    margin: 26px auto 0 !important;
    display: grid !important;
    grid-template-columns: 1fr !important;
    justify-items: center !important;
    gap: 12px !important;
  }

  html body #root .site-page .hero-actions button {
    width: min(100%, 360px) !important;
    margin-left: auto !important;
    margin-right: auto !important;
    justify-content: center !important;
  }

  html body #root .site-page > .section:not(.hero),
  html body #root .site-page > .pricing-section.section,
  html body #root .site-page > .pending-profile-section.section {
    width: 100% !important;
    max-width: 100% !important;
    padding-left: 18px !important;
    padding-right: 18px !important;
    overflow: visible !important;
  }

  html body #root .site-page .hero-card {
    width: min(100%, 390px) !important;
    max-width: 390px !important;
    margin: 28px auto 0 !important;
    justify-self: center !important;
    transform: none !important;
  }
}`;

  function apply() {
    let style = document.getElementById('pairly-mobile-final-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pairly-mobile-final-style';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  window.addEventListener('load', apply, { once: true });
  window.setTimeout(apply, 0);
})();
