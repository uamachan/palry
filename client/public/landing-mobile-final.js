(() => {
  const css = `
@media (max-width: 760px) {
  html body #root .site-page {
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 auto !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important;
    text-align: center !important;
  }
  html body #root > .site-header {
    width: min(100%, 430px) !important;
    max-width: 430px !important;
    margin-left: auto !important;
    margin-right: auto !important;
    box-sizing: border-box !important;
  }
  html body #root .site-page .hero,
  html body #root .site-page .hero.section,
  html body #root main.site-page .hero.section#top {
    width: min(100%, 430px) !important;
    max-width: 430px !important;
    min-width: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    padding: 42px 0 50px !important;
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) !important;
    justify-items: center !important;
    align-items: start !important;
    text-align: center !important;
    box-sizing: border-box !important;
    overflow: hidden !important;
  }
  html body #root .site-page .hero-copy {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    margin-left: auto !important;
    margin-right: auto !important;
    display: grid !important;
    justify-items: center !important;
    text-align: center !important;
    box-sizing: border-box !important;
  }
  html body #root .site-page .hero-copy .eyebrow {
    width: 100% !important;
    text-align: center !important;
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
  html body #root .site-page .hero-card {
    width: min(100%, 390px) !important;
    max-width: 390px !important;
    margin: 28px auto 0 !important;
    justify-self: center !important;
    transform: none !important;
  }
}`;

  function apply() {
    if (document.getElementById('pairly-mobile-final-style')) return;
    const style = document.createElement('style');
    style.id = 'pairly-mobile-final-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  window.addEventListener('load', apply, { once: true });
  window.setTimeout(apply, 0);
})();
