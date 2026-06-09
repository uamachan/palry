import { isDevSession, DEV_TOKEN } from './dev-auth.js';

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');

let firebaseAuthPromise = null;
function getFirebaseAuth() {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = import('./firebase.js').then((firebase) => firebase.firebaseAuth);
  }
  return firebaseAuthPromise;
}

function apiError(message, httpStatus) {
  const e = new Error(message || 'リクエストに失敗しました');
  e.httpStatus = httpStatus;
  return e;
}

function buildUrl(path, query) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${API_BASE_URL}${cleanPath}`;
  if (!query || typeof query !== 'object') return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function currentIdToken({ required = true } = {}) {
  if (isDevSession()) return DEV_TOKEN;
  try {
    const auth = await getFirebaseAuth();
    const user = auth?.currentUser;
    if (!user) {
      if (required) throw apiError('認証が必要です。再ログインしてください。', 401);
      return '';
    }
    return user.getIdToken();
  } catch (error) {
    if (error?.httpStatus) throw error;
    if (required) throw apiError(error?.message || '認証情報の取得に失敗しました。', 401);
    return '';
  }
}

async function request(path, { method = 'GET', body, query, auth = false, idToken } = {}) {
  const headers = { Accept: 'application/json' };
  const init = { method, headers };

  if (auth) {
    const token = idToken || await currentIdToken({ required: true });
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(buildUrl(path, query), init);
  } catch {
    throw apiError('サーバーに接続できません。通信環境またはデプロイ状態を確認してください。', 0);
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().then((text) => text ? { message: text } : {}).catch(() => ({}));

  if (!response.ok) {
    throw apiError(payload?.message || `HTTP ${response.status}`, response.status);
  }

  return payload;
}

async function tokenBody(body = {}) {
  const idToken = body.idToken || await currentIdToken({ required: true });
  return { ...body, idToken };
}

function pollDmThread(matchId, onUpdate) {
  let cancelled = false;
  let timer = null;

  const run = async () => {
    if (cancelled || !matchId) return;
    try {
      const payload = await api.dmThreads();
      const thread = (payload.threads || []).find((item) => item?.match?.id === matchId);
      if (!cancelled && thread) onUpdate(thread.messages || []);
    } catch {
      // 購読ポーリングの失敗で画面全体を壊さない
    }
    if (!cancelled) timer = window.setTimeout(run, 5000);
  };

  run();
  return () => {
    cancelled = true;
    if (timer) window.clearTimeout(timer);
  };
}

export const api = {
  config: () => request('/api/config'),
  plans: () => request('/api/plans'),

  login: async (body = {}) => request('/api/login', {
    method: 'POST',
    body: await tokenBody(body),
  }),

  register: async (body = {}) => request('/api/register', {
    method: 'POST',
    body: await tokenBody(body),
  }),

  updateProfile: (body = {}) => request('/api/profile', {
    method: 'PUT',
    auth: true,
    body,
  }),

  profiles: ({ targetGender = 'all', targetRank = 'all' } = {}) => request('/api/profiles', {
    auth: true,
    query: { targetGender, targetRank },
  }),

  like: ({ profileId, type = 'like' } = {}) => request('/api/like', {
    method: 'POST',
    auth: true,
    body: { profileId, type },
  }),

  matches: () => request('/api/matches/me', { auth: true }),

  receivedLikes: () => request('/api/received-likes/me', { auth: true }),

  acceptLike: ({ receivedLikeId } = {}) => request('/api/accept-like', {
    method: 'POST',
    auth: true,
    body: { receivedLikeId },
  }),

  footprints: () => request('/api/footprints/me', { auth: true }),

  recordFootprint: ({ profileId, action } = {}) => request('/api/footprint', {
    method: 'POST',
    auth: true,
    body: { profileId, action },
  }),

  dmThreads: () => request('/api/dm/me', { auth: true }),

  markDmRead: ({ matchId } = {}) => request('/api/dm/read', {
    method: 'POST',
    auth: true,
    body: { matchId },
  }),

  sendDm: ({ matchId, body } = {}) => request('/api/dm', {
    method: 'POST',
    auth: true,
    body: { matchId, body },
  }),

  subscribeDmThread: (matchId, _userId, onUpdate) => pollDmThread(matchId, onUpdate),

  report: ({ profileId, reason = '' } = {}) => request('/api/report', {
    method: 'POST',
    auth: true,
    body: { profileId, reason },
  }),

  block: ({ profileId } = {}) => request('/api/block', {
    method: 'POST',
    auth: true,
    body: { profileId },
  }),

  entitlements: () => request('/api/entitlements/me', { auth: true }),

  purchase: ({ plan } = {}) => request('/api/purchase', {
    method: 'POST',
    auth: true,
    body: { plan },
  }),

  purchaseItem: ({ item } = {}) => request('/api/purchase-item', {
    method: 'POST',
    auth: true,
    body: { item },
  }),

  reports: () => request('/api/admin/reports', { auth: true }),

  adminUnhide: ({ profileId } = {}) => request('/api/admin/unhide', {
    method: 'POST',
    auth: true,
    body: { profileId },
  }),

  adminAudit: () => request('/api/admin/audit', { auth: true }),
};
