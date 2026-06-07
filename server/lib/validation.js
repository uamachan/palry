// 入力検証・サニタイズの純粋関数群。
// 副作用を持たず、単体テスト可能（server/lib/validation.test.js）。

/** 文字列を整形：山括弧除去・トリム・最大長制限。 */
export function cleanText(value, max = 160) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

/**
 * 年齢を 13〜80 に正規化。範囲外・不正は空文字を返す。
 * slice(0,2) で先頭2桁だけ採るのは誤り（"21213"→"21" として通ってしまう）。
 * 数字以外を除去した全体を数値化して範囲判定する。
 */
export function cleanAge(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const age = Number(digits);
  if (!digits || !Number.isInteger(age) || age < 13 || age > 80) return '';
  return String(age);
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
