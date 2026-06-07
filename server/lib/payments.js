// 決済プロバイダ統合のためのシーム（拡張ポイント）。
//
// 現状はデモ（isDemoPaymentAllowed のフェイルクローズ）で、実課金は未統合。
// 本番で Stripe 等を使う場合は、ここを実装の差し替え地点にする：
//   1) `npm i stripe` を追加
//   2) STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET を環境変数に設定
//   3) createCheckoutSession() を Stripe Checkout のセッション生成で実装
//   4) Webhook（支払い完了）を検証して users.json の plan / entitlements を確定
//
// こうしておくことで、ルーティング側（index.js）は「決済が設定済みか」を
// isPaymentsConfigured() で判定し、未設定ならデモのまま安全に動作できる。

export function isPaymentsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function paymentsProvider() {
  return isPaymentsConfigured() ? 'stripe' : 'demo';
}

/**
 * 実決済のチェックアウトセッションを生成する（未設定時はエラー）。
 * index.js の purchase 系ハンドラから、実課金移行時に呼び出す想定。
 */
export async function createCheckoutSession() {
  if (!isPaymentsConfigured()) {
    const error = new Error('決済プロバイダが未設定です（STRIPE_SECRET_KEY 未設定）。');
    error.status = 503;
    throw error;
  }
  // TODO: Stripe 統合時に実装する。
  //   const Stripe = (await import('stripe')).default;
  //   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  //   return stripe.checkout.sessions.create({ ... });
  const error = new Error('決済機能は準備中です。');
  error.status = 503;
  throw error;
}
