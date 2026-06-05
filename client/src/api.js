const API_BASE = '';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  let payload = {};
  try { payload = await response.json(); } catch { /* non-JSON body (HTML error pages etc.) */ }
  if (!response.ok) {
    const error = new Error(payload.message || payload.reason || `${response.status} ${response.statusText}`);
    Object.assign(error, payload);
    throw error;
  }
  return payload;
}

export const api = {
  plans: () => request('/api/plans'),
  profiles: ({ plan = 'FREE', targetGender = 'all' } = {}) => request(`/api/profiles?plan=${encodeURIComponent(plan)}&targetGender=${encodeURIComponent(targetGender)}`),
  register: (body) => request('/api/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/login', { method: 'POST', body: JSON.stringify(body) }),
  like: (body) => request('/api/like', { method: 'POST', body: JSON.stringify(body) }),
  matches: (userId) => request(`/api/matches/${encodeURIComponent(userId)}`),
  dmThreads: (userId) => request(`/api/dm/${encodeURIComponent(userId)}`),
  sendDm: (body) => request('/api/dm', { method: 'POST', body: JSON.stringify(body) }),
  report: (body) => request('/api/report', { method: 'POST', body: JSON.stringify(body) }),
  block: (body) => request('/api/block', { method: 'POST', body: JSON.stringify(body) }),
  purchase: (body) => request('/api/purchase', { method: 'POST', body: JSON.stringify(body) }),
  reports: () => request('/api/admin/reports')
};
