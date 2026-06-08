// 入力検証・サニタイズの純粋関数群。
// 副作用を持たず、単体テスト可能（server/lib/validation.test.js）。

/** 文字列を整形：山括弧除去・トリム・最大長制限。 */
export function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

/**
 * Riot ID は GameName#Tagline 形式に限定する。
 * - GameName: 1〜16文字（日本語・韓国語・英数字など任意の Unicode。空白・# 除く）
 * - Tagline: 1〜5文字（同上）
 * クライアントの AuthForms.jsx / dm-submit-guard.js と同じルールを適用する。
 */
export const RIOT_ID_PATTERN = /^[^#\s]{1,16}#[^#\s]{1,5}$/u;

export function normalizeRiotIdInput(value) {
  const raw = String(value || '').trim().replace(/＃/g, '#').replace(/\s+/g, '');
  let normalized = '';
  let hasHash = false;
  for (const char of [...raw]) {
    if (char === '#') {
      if (!hasHash) { normalized += '#'; hasHash = true; }
      continue;
    }
    normalized += char;
  }
  const [gameName = '', tagline = ''] = normalized.split('#');
  const limitedGameName = [...gameName].slice(0, 16).join('');
  const limitedTagline = [...tagline].slice(0, 5).join('');
  return hasHash ? `${limitedGameName}#${limitedTagline}` : limitedGameName;
}

export function cleanRiotId(value) {
  const normalized = normalizeRiotIdInput(value);
  return RIOT_ID_PATTERN.test(normalized) ? normalized : '';
}

/**
 * 年齢帯をホワイトリスト制で検証する。
 * フロントの AGE_RANGES と同じ値（10代〜90代）を正とする。
 * それ以外・空は空文字を返す。
 */
export const VALID_AGE_RANGES = ['10代', '20代', '30代', '40代', '50代', '60代', '70代', '80代', '90代'];

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

/** 数値を 0 以上の整数へ丸める。数値化できない場合は fallback。 */
export function toNonNegativeInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}
