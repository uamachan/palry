// 開発者モード: ログインボタンを出すかどうかの UI 判定にのみ使う。
//
// Firestore-direct 構成のため、このフラグだけでは Firestore 操作が通らない。
// （Firestore Rules は request.auth != null を必須とするため、dev-auth セッションのまま
//   書き込むと permission-denied になる。）
// 実際に API 操作をテストする場合は VITE_USE_EMULATOR=true で Firebase Emulator を起動し、
// Emulator Auth で実ユーザーとしてサインインして使用する。
export const DEV_TOKEN = 'dev-skip-login';
export const DEV_EMAIL = 'dev@palry.local';
export const DEV_UID = 'dev-user';

// タブ単位の一時セッション。リロードでは保持、タブを閉じると消える。
const SESSION_KEY = 'palry-dev-session';

export function isDevSession() {
  if (!import.meta.env.DEV) return false;
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function startDevSession() {
  if (!import.meta.env.DEV) return;
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage 不可環境は無視 */ }
}

export function endDevSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage 不可環境は無視 */ }
}
