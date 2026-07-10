import { useEffect, useState } from 'react';

// Detects the three customer-facing entry points (shared project link,
// legacy embedded-design link, or a downloaded HTML export) — none of these
// should ever show a login screen; a customer viewing a shared design has no
// account of their own. Only the bare app URL (an admin/salesperson opening
// their own workspace) is gated.
function isCustomerFacingEntry() {
  if (typeof window === 'undefined') return false;
  if (window.__IRONWRAP_DESIGN__) return true;
  const params = new URLSearchParams(window.location.search);
  return params.has('p') || params.has('d');
}

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(() => (isCustomerFacingEntry() ? 'public' : 'checking'));
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', companyName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status !== 'checking') return;
    fetch('/api/auth/me')
      .then((res) => {
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return null;
        return res.json();
      })
      // A 200 with no real user id (e.g. a dev/preview server's SPA
      // fallback serving index.html for an unmatched API path with a
      // misleadingly-ok status) must never be treated as authenticated.
      .then((body) => setStatus(body?.id ? 'authed' : 'anon'))
      .catch(() => setStatus('anon'));
  }, [status]);

  if (status === 'public' || status === 'authed') return children;
  if (status === 'checking') return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setStatus('authed');
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="auth-gate">
      <form className="auth-gate-card" onSubmit={handleSubmit}>
        <div className="app-title">IronWrap 3D Configurator</div>
        <div className="control-label" style={{ marginTop: '1rem' }}>
          {mode === 'login' ? 'Log In' : 'Create Account'}
        </div>

        <label className="field-label" htmlFor="auth-email">Email</label>
        <input
          id="auth-email" type="email" required className="control-select"
          value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />

        {mode === 'signup' && (
          <>
            <label className="field-label" htmlFor="auth-company">Company Name</label>
            <input
              id="auth-company" type="text" className="control-select"
              value={form.companyName} onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
            />
          </>
        )}

        <label className="field-label" htmlFor="auth-password">Password</label>
        <input
          id="auth-password" type="password" required minLength={8} className="control-select"
          value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />

        {error && <div className="control-sublabel" style={{ color: '#b91c1c' }}>{error}</div>}

        <div className="export-buttons" style={{ marginTop: '0.75rem' }}>
          <button type="submit" className="btn-primary" disabled={busy} style={{ width: '100%' }}>
            {mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </div>

        <button
          type="button"
          className="btn-secondary"
          style={{ width: '100%' }}
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
        >
          {mode === 'login' ? "Need an account? Sign up" : 'Already have an account? Log in'}
        </button>
      </form>
    </div>
  );
}
