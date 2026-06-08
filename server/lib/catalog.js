// プラン・単発課金の商品カタログと、それに基づく利用枠/決済の判定。
// データ定義と純粋関数のみ（ルーティングからは import して使う）。
const isProduction = process.env.NODE_ENV === 'production';

export const plans = {
  FREE: {
    name: 'FREE',
    price: 0,
    likeLimit: 10,
    superLimit: 1,
    dualLimit: 5,
    genderFilter: false,
    unlimited: false,
    features: ['通常LIKE 10回/day', 'SUPER LIKE 1回/day', '両LIKE 5回', 'マッチ後DM']
  },
  PLUS: {
    name: 'PLUS',
    price: 980,
    likeLimit: 40,
    superLimit: 5,
    dualLimit: 10,
    genderFilter: true,
    unlimited: false,
    features: ['LIKE 40回/day', 'SUPER LIKE 5回/day', '両LIKE 10回', '性別指定フィルター', '足あと閲覧']
  },
  VIP: {
    name: 'VIP',
    price: 1980,
    likeLimit: 'unlimited',
    superLimit: 'unlimited',
    dualLimit: 'unlimited',
    genderFilter: true,
    unlimited: true,
    features: ['全制限解除', 'LIKE無制限', 'SUPER/両LIKE無制限', '性別指定フィルター', '上位表示']
  }
};

export const singleItems = [
  { name: '性別指定フィルター7日', price: 400, detail: 'FREEでも7日間だけ表示性別を指定できます。' },
  { name: 'ブースト24時間', price: 300, detail: 'プロフィールを表示候補に出やすくします。' },
  { name: 'SUPER LIKE 3回', price: 500, detail: '相手に強めのLIKEを送れます。' },
  { name: 'プロフィール目立たせ7日', price: 700, detail: '検索・候補カードで視認性を上げます。' }
];

export const DAY_MS = 24 * 60 * 60 * 1000;

// 単発課金の効果定義。timed = 期限付き特典 / consumable = 回数消費型。
export const singleItemConfig = {
  '性別指定フィルター7日': { perk: 'genderFilter', kind: 'timed', durationMs: 7 * DAY_MS },
  'ブースト24時間': { perk: 'boost', kind: 'timed', durationMs: DAY_MS },
  'SUPER LIKE 3回': { perk: 'superCredits', kind: 'consumable', count: 3 },
  'プロフィール目立たせ7日': { perk: 'spotlight', kind: 'timed', durationMs: 7 * DAY_MS }
};

// プラン・種別ごとの本日の利用上限。unlimited は Infinity。
export function quotaFor(planName, type) {
  const plan = plans[planName] || plans.FREE;
  if (plan.unlimited) return Infinity;
  if (type === 'super') return plan.superLimit;
  if (type === 'dual') return plan.dualLimit;
  return plan.likeLimit;
}

// 本番環境では ENABLE_DEMO_PURCHASE=true を明示しないと決済を通さない（フェイルクローズ）。
export function isDemoPaymentAllowed() {
  return !isProduction || process.env.ENABLE_DEMO_PURCHASE === 'true';
}
