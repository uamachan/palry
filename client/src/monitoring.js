// クライアント側エラーモニタリングの抽象化。
// - 例外を1関数 captureError() に集約。後から送信先（Sentry等）を差し替え可能。
// - グローバルの未捕捉エラー / Promise rejection を拾って計測へ送る。
// - Sentry を使う場合は index.html に Sentry ローダ（CDN）を足し VITE_SENTRY_DSN を設定する。
//   その際 CSP に CSP_SCRIPT_SRC_EXTRA / CSP_CONNECT_SRC_EXTRA で Sentry ドメインを許可する。
//   ローダが読み込まれると window.Sentry が生え、本モジュールが自動的に利用する。

const SENTRY_DSN = String(import.meta.env.VITE_SENTRY_DSN || '').trim();

export function isMonitoringConfigured() {
  return Boolean(SENTRY_DSN);
}

export function captureError(error, context = {}) {
  // 常にコンソールには出す。
  console.error('[captureError]', error, context);
  try {
    // Sentry ローダが読み込まれていれば送る（未導入なら no-op）。
    window.Sentry?.captureException?.(error instanceof Error ? error : new Error(String(error)), { extra: context });
  } catch { /* ignore */ }
  try {
    // 計測（GA 同意済みのみ送られる）。
    window.__pairlyTrack?.('app_error', { message: String(error?.message || error) });
  } catch { /* ignore */ }
}

export function initMonitoring() {
  if (typeof window === 'undefined') return;
  window.__pairlyCaptureError = captureError;

  window.addEventListener('error', (event) => {
    captureError(event.error || event.message, { type: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    captureError(event.reason, { type: 'unhandledrejection' });
  });
}
