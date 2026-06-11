// プロフィール項目の列挙値（VALORANTランク/ロール/地域など）と、その正規化・検証。
// すべて純粋関数で副作用を持たない（index.js から分離して単体テスト可能にした）。
import { cleanText, cleanAge } from './validation.js';

export const allowedGenders = ['男性', '女性', 'その他/未設定'];
export const valorantRanks = [
  'Unranked',
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant'
];
export const valorantRoles = ['デュエリスト', 'イニシエーター', 'コントローラー', 'センチネル'];
export const regions = ['北海道', '東北', '関東', '甲信越', '北陸', '東海', '近畿', '中国', '四国', '九州', '沖縄', '海外'];
export const allowedVcs = ['なし', 'Discord', 'Skype', 'その他'];
export const allowedMaps = ['アセント', 'スプリット', 'ヘイヴン', 'バインド', 'アイスボックス', 'ブリーズ', 'フラクチャー', 'パール', 'ロータス', 'サンセット', 'アビス', 'カロード'];
export const allowedWeapons = ['Vandal', 'Phantom', 'Operator', 'Sheriff', 'Ghost', 'Marshal', 'Judge', 'Odin'];

export const rankAliases = new Map([
  ['Iron', 'Iron 1'],
  ['Bronze', 'Bronze 1'],
  ['Silver', 'Silver 1'],
  ['Gold', 'Gold 1'],
  ['Platinum', 'Platinum 1'],
  ['Diamond', 'Diamond 1'],
  ['Ascendant', 'Ascendant 1'],
  ['Immortal', 'Immortal 1']
]);

// クライアントの AGE_RANGES と一致させる。数値年齢（旧形式）も後方互換で受け付ける。
export const AGE_RANGE_OPTIONS = ['10代', '20代', '20代前半', '20代後半', '30代', '40代', '40代以上', '50代以上'];

export function sanitizeMapsField(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v) => allowedMaps.includes(cleanText(v, 30))).slice(0, 5);
}

export function enumValue(value, allowed, fallback = '') {
  const normalized = cleanText(value, 60);
  return allowed.includes(normalized) ? normalized : fallback;
}

export function cleanAgeField(value) {
  const text = cleanText(value, 20);
  if (AGE_RANGE_OPTIONS.includes(text)) return text;
  return cleanAge(text); // 後方互換：数値年齢 13〜80
}

export function normalizeGender(gender) {
  return enumValue(gender, allowedGenders, 'その他/未設定');
}

export function normalizeRank(rank) {
  const value = cleanText(rank, 60);
  return enumValue(rankAliases.get(value) || value, valorantRanks, 'Gold 1');
}

export function normalizeRole(role) {
  return enumValue(role, valorantRoles, 'デュエリスト');
}

export function normalizeRegion(region) {
  return enumValue(region, regions, '');
}

export function validateProfileEnums(payload, existing = {}) {
  const gender = enumValue(payload.gender, allowedGenders);
  if (!gender) return { status: 400, message: '性別の値が不正です。' };
  const region = enumValue(payload.region, regions);
  if (!region) return { status: 400, message: '地域の値が不正です。' };
  const rankInput = cleanText(payload.rank || existing.rank || 'Gold 1', 60);
  const rank = enumValue(rankAliases.get(rankInput) || rankInput, valorantRanks);
  if (!rank) return { status: 400, message: 'ランクの値が不正です。' };
  const role = enumValue(payload.role || existing.role || 'デュエリスト', valorantRoles);
  if (!role) return { status: 400, message: 'ロールの値が不正です。' };
  return { gender, region, rank, role };
}
