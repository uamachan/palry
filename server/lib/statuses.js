// データの状態（ステータス）文字列を一元管理する。各所での直書きをやめることで、
// 打ち間違い（例: 'penidng' が無言で一致しなくなる）による不具合を防ぐ。
export const LIKE_STATUS = Object.freeze({ PENDING: 'pending', ACCEPTED: 'accepted', BLOCKED: 'blocked', AUTO_HIDDEN: 'auto_hidden' });
export const REPORT_STATUS = Object.freeze({ OPEN: 'open', DISMISSED: 'dismissed' });
export const PURCHASE_STATUS = Object.freeze({ DEMO_PAID: 'demo_paid' });
