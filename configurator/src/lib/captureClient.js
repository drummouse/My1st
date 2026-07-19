// Thin fetch wrapper for the Capture API, matching libraryClient.js /
// superadminClient.js conventions: JSON in/out, typed error codes surfaced
// on the thrown Error, session cookie handled by the browser.
async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof result.error === 'object' ? result.error : { message: result.error };
    const error = new Error(detail?.message || `Capture request failed (${response.status})`);
    error.code = detail?.code;
    error.details = detail?.details;
    throw error;
  }
  return result;
}

export const captureApi = {
  list: (status) => request(`/api/capture/sessions${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  create: (input) => request('/api/capture/sessions', { method: 'POST', body: input }),
  get: (id) => request(`/api/capture/sessions/${id}`),
  update: (id, patch) => request(`/api/capture/sessions/${id}`, { method: 'PATCH', body: patch }),
  archive: (id, reason) => request(`/api/capture/sessions/${id}`, { method: 'PATCH', body: { status: 'archived', reason } }),
};

// Stable per-draft idempotency key, generated once when the user starts a
// new capture — a retried create (flaky network, refresh mid-request)
// resolves to the same session instead of a duplicate.
export function newClientRef() {
  return (crypto.randomUUID ? crypto.randomUUID() : `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
