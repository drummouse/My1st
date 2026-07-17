async function request(path, options) {
  const response = await fetch(`/api/superadmin${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export const superadminApi = {
  summary: () => request('/summary'),
  tenants: () => request('/tenants'),
  audit: () => request('/audit'),
  notifications: () => request('/notifications'),
  createUser: (input) => request('/users', { method: 'POST', body: JSON.stringify(input) }),
  changeStatus: (id, status, reason) => request(`/status?id=${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ status, reason }),
  }),
  resetPassword: (id, temporaryPassword, reason) => request(`/password-reset?id=${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ temporaryPassword, reason }),
  }),
  retryNotification: (id, reason) => request(`/notifications?id=${encodeURIComponent(id)}`, {
    method: 'POST', body: JSON.stringify({ reason }),
  }),
};
