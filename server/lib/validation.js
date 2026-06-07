// 入力検証・サニタイズの純粋関数群。
// 副作用を持たず、単体テスト可能（server/lib/validation.test.js）。

/** 文字列を整形：山括弧除去・トリム・最大長制限。 */
export function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

/**
 * Riot ID は GameName#Tagline 形式に限定する。
 * - GameName: 英数字 3〜16文字
 * - Tagline: 英数字 3〜5文字
 */
export const RIOT_ID_PATTERN = /^[A-Za-z0-9]{3,16}#[A-Za-z0-9]{3,5}$/;

export function normalizeRiotIdInput(value) {
  const raw = String(value || '').trim().replace(/＃/g, '#');
  let normalized = '';
  let hasHash = false;
  for (const char of raw) {
    if (/^[A-Za-z0-9]$/.test(char)) {
      normalized += char;
      continue;
    }
    if (char === '#' && !hasHash) {
      normalized += '#';
      hasHash = true;
    }
  }
  const [gameName = '', tagline = ''] = normalized.split('#');
  const limitedGameName = gameName.slice(0, 16);
  const limitedTagline = tagline.slice(0, 5);
  return hasHash ? `${limitedGameName}#${limitedTagline}` : limitedGameName;
}

export function cleanRiotId(value) {
  const normalized = normalizeRiotIdInput(value);
  return RIOT_ID_PATTERN.test(normalized) ? normalized : '';
}

/**
 * 年齢帯をホワイトリスト制で検証する。
 * フロントの AGE_RANGES と同じ値（10代/20代前半/20代後半/30代/40代以上）を正とする。
 * それ以外・空は空文字を返す。
 */
export const VALID_AGE_RANGES = ['10代', '20代前半', '20代後半', '30代', '40代以上'];

export function cleanAge(value) {
  const v = String(value || '').trim();
  return VALID_AGE_RANGES.includes(v) ? v : '';
}

/**
 * プロフィール写真/ボイスは src としてそのまま配信するため、
 * 安全な media data URL 以外は弾く（data:text/html や javascript: の混入防止）。
 * クライアントは常に data URL（resizePhoto / MediaRecorder→readAsDataURL）で送る。
 */
export function sanitizeMedia(value, kind, max) {
  const v = String(value || '').trim();
  if (!v || v.length > max) return '';
  if (kind === 'image' && /^data:image\/(png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/.test(v)) return v;
  if (kind === 'audio' && /^data:audio\/(webm|ogg|mpeg|mp3|wav|mp4|x-m4a);base64,[A-Za-z0-9+/=\s]+$/.test(v)) return v;
  return '';
}

/** メールアドレスの比較用キー（整形 + 小文字化）。 */
export function emailKey(email) {
  return cleanText(email, 120).toLowerCase();
}
