// アナリティクス抽象化レイヤ。
// - 計測 ID（VITE_GA_ID）が設定されている時だけ動作する（未設定なら完全 no-op）。
// - ユーザーの同意があるまでタグを読み込まない（プライバシー配慮 / GDPR 的）。
// - すべての計測は track(event, params) の 1 関数に集約し、後から GA4 以外へ差し替え可能にする。

const GA_ID = String(import.meta.env.VITE_GA_ID || '').trim();
const CONSENT_KEY = 'pairly:analytics-consent';

let loaded = false;

function isAnalyticsConfigured() {
  return Boolean(GA_ID);
}

function getConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY); // 'granted' | 'denied' | null(未決定)
  } catch {
    return null;
  }
}

export function setConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch { /* ignore */ }
  if (value === 'granted') loadGtag();
}

// 同意バナーを出すべきか（設定済み かつ 未決定）
export function shouldAskConsent() {
  return isAnalyticsConfigured() && getConsent() === null;
}

function loadGtag() {
  if (loaded || !GA_ID) return;
  loaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  // IP 匿名化等の既定配慮。
  gtag('config', GA_ID, { anonymize_ip: true });
}

// 主要コンバージョン等をここに集約して計測する。
// 計測未設定・未同意なら何もしない。ErrorBoundary からも window.__pairlyTrack 経由で呼べる。
export function track(event, params = {}) {
  try {
    if (!GA_ID || getConsent() !== 'granted') return;
    if (!loaded) loadGtag();
    window.gtag?.('event', event, params);
  } catch { /* 計測失敗でアプリを止めない */ }
}

export function initAnalytics() {
  // 起動時に過去の同意があればロード。グローバル経由の計測フックも公開。
  if (typeof window !== 'undefined') window.__pairlyTrack = track;
  if (getConsent() === 'granted') loadGtag();
}
