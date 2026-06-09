import { isDevSession, DEV_TOKEN } from './dev-auth.js';

// firebase.js は動的インポートで遅延ロードする。
// 静的インポートにすると vendor-firebase チャンクが起動時に同期ロードされ
// FCP/LCP が大幅に遅れてしまうため使わない。

// フロントを静的サイト、APIを別Renderサービスで出す場合に使う。
// 未設定なら同一オリジンの /api を叩く。
// 例: VITE_API_BASE_URL=https://palry-api.onrender.com
const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/** 現在ユーザーの Firebase ID トークンを取得する。未ログイン時は null。 */
async function getToken() {
  // 開発者モード中は Firebase を介さず固定トークンを返す（サーバ側も非本番のみ受理）。
  if (isDevSession()) return DEV_TOKEN;
  try {
    const { firebaseAuth } = await import('./firebase.js');
    return await firebaseAuth?.currentUser?.getIdToken() ?? null;
  } catch { return null; }
}

async function request(path, options = {}) {
  let authHeader = {};
  try {
    const token = await getToken();
    if (token) authHeader = { Authorization: `Bearer ${token}` };
  } catch { /* no auth token */ }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader, ...(options.headers || {}) },
    ...options,
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* non-JSON body (HTML error pages etc.) */ }
  if (!response.ok) {
    const error = new Error(payload.message || payload.reason || `${response.status} ${response.statusText}`);
    Object.assign(error, payload);
    error.httpStatus = response.status;
    throw error;
  }
  return payload;
}

export const api = {
  plans: () => request('/api/plans'),
  profiles: ({ plan = 'FREE', targetGender = 'all', userId = '' } = {}) => request(`/api/profiles?plan=${encodeURIComponent(plan)}&targetGender=${encodeURIComponent(targetGender)}&userId=${encodeURIComponent(userId)}`),
  register: (body) => request('/api/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/login', { method: 'POST', body: JSON.stringify(body) }),
  updateProfile: (body) => request('/api/profile', { method: 'PUT', body: JSON.stringify(body) }),
  like: (body) => request('/api/like', { method: 'POST', body: JSON.stringify(body) }),
  matches: (userId) => request(`/api/matches/${encodeURIComponent(userId)}`),
  dmThreads: (userId) => request(`/api/dm/${encodeURIComponent(userId)}`),
  markDmRead: (body) => request('/api/dm/read', { method: 'POST', body: JSON.stringify(body) }),
  sendDm: (body) => request('/api/dm', { method: 'POST', body: JSON.stringify(body) }),
  footprints: () => request('/api/footprints/me'),
  recordFootprint: (body) => request('/api/footprint', { method: 'POST', body: JSON.stringify(body) }),
  receivedLikes: () => request('/api/received-likes/me'),
  acceptLike: (body) => request('/api/accept-like', { method: 'POST', body: JSON.stringify(body) }),
  report: (body) => request('/api/report', { method: 'POST', body: JSON.stringify(body) }),
  block: (body) => request('/api/block', { method: 'POST', body: JSON.stringify(body) }),
  purchase: (body) => request('/api/purchase', { method: 'POST', body: JSON.stringify(body) }),
  purchaseItem: (body) => request('/api/purchase-item', { method: 'POST', body: JSON.stringify(body) }),
  entitlements: (userId) => request(`/api/entitlements/${encodeURIComponent(userId)}`),
  reports: () => request('/api/admin/reports'),
  adminUnhide: (body) => request('/api/admin/unhide', { method: 'POST', body: JSON.stringify(body) }),
  adminAudit: () => request('/api/admin/audit'),
};
