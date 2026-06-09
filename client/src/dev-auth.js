// 開発者モード: ログイン(Firebase)とメール認証をスキップして
// プロフィール作成・アプリ動作確認を行うための仕組み。
//
// 有効/無効のマスタースイッチはサーバの環境変数 ALLOW_DEV_LOGIN（/api/config で公開）。
// クライアント側のこのフラグは「ボタンを出すか」のUI判定にのみ使い、実際の認可は
// 必ずサーバが判定する（ALLOW_DEV_LOGIN=false ならトークンは拒否される）。
export const DEV_TOKEN = 'dev-skip-login';
export const DEV_EMAIL = 'dev@palry.local';
export const DEV_UID = 'dev-user';

// タブ単位の一時セッション。リロードでは保持、タブを閉じると消える。
const SESSION_KEY = 'palry-dev-session';

export function isDevSession() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function startDevSession() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage 不可環境は無視 */ }
}

export function endDevSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage 不可環境は無視 */ }
}
