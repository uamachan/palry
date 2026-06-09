// 開発者モード: ログイン(Firebase)とメール認証をスキップして
// プロフィール作成・アプリ動作確認を行うための仕組み。
//
// 本番では絶対に有効化されないよう、ビルド時フラグでゲートする:
//  - import.meta.env.DEV          … vite dev サーバ(npm run dev)では常に有効
//  - VITE_ALLOW_DEV_LOGIN=true    … 明示的に許可したビルドのみ有効(既定OFF)
// サーバ側も ALLOW_DEV_LOGIN=true かつ非本番のときだけ開発トークンを受理する(二重ゲート)。
export const DEV_LOGIN_ENABLED =
  Boolean(import.meta.env.DEV) || String(import.meta.env.VITE_ALLOW_DEV_LOGIN) === 'true';

// サーバ(server/index.js)の開発者バイパスと一致させる固定トークン/識別子。
export const DEV_TOKEN = 'dev-skip-login';
export const DEV_EMAIL = 'dev@palry.local';
export const DEV_UID = 'dev-user';

// タブ単位の一時セッション。リロードでは保持、タブを閉じると消える。
const SESSION_KEY = 'palry-dev-session';

export function isDevSession() {
  if (!DEV_LOGIN_ENABLED) return false;
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function startDevSession() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage 不可環境は無視 */ }
}

export function endDevSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage 不可環境は無視 */ }
}
