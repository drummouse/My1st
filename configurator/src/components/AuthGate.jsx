import { useEffect, useState } from 'react';
import { COUNTRIES, REGIONS } from '../data/taxRates.js';
import { formatPostalOrZip } from '../lib/address.js';

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

const BLANK_SIGNUP = {
  email: '', password: '', companyName: '',
  firstName: '', lastName: '', businessName: '', phone: '',
  addressLine: '', city: '', country: 'CA', regionCode: 'CA-AB', postalCode: '',
  website: '', socialUrl: '',
};

export default function AuthGate({ children }) {
  const [status, setStatus] = useState(() => (isCustomerFacingEntry() ? 'public' : 'checking'));
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState({ email: '', password: '', ...BLANK_SIGNUP });
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

  const hasName = form.firstName.trim() && form.lastName.trim();
  const hasBusiness = form.businessName.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup') {
      if (!hasName && !hasBusiness) {
        setError('Enter either your first and last name, or a business name.');
        return;
      }
      if (!form.phone.trim()) {
        setError('Phone number is required.');
        return;
      }
      if (!form.addressLine.trim() || !form.city.trim() || !form.postalCode.trim()) {
        setError('Full address (street, city, postal/zip code) is required.');
        return;
      }
    }
    setBusy(true);
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
            <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
              Enter your name, a business name, or both.
            </div>
            <div className="settings-row settings-row-wide">
              <label htmlFor="auth-first">First name</label>
              <input
                id="auth-first" type="text" className="control-select"
                value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              />
            </div>
            <div className="settings-row settings-row-wide">
              <label htmlFor="auth-last">Last name</label>
              <input
                id="auth-last" type="text" className="control-select"
                value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              />
            </div>
            <label className="field-label" htmlFor="auth-business">Business name</label>
            <input
              id="auth-business" type="text" className="control-select"
              value={form.businessName} onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value, companyName: e.target.value }))}
            />

            <label className="field-label" htmlFor="auth-phone">Phone</label>
            <input
              id="auth-phone" type="tel" required className="control-select"
              value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />

            <label className="field-label" htmlFor="auth-address">Address</label>
            <input
              id="auth-address" type="text" required className="control-select" placeholder="Street address"
              value={form.addressLine} onChange={(e) => setForm((f) => ({ ...f, addressLine: e.target.value }))}
            />
            <div className="settings-row">
              <label htmlFor="auth-city">City</label>
              <input
                id="auth-city" type="text" required className="control-select"
                value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="settings-row">
              <label htmlFor="auth-country">Country</label>
              <select
                id="auth-country" className="control-select" value={form.country}
                onChange={(e) => {
                  const country = e.target.value;
                  setForm((f) => ({ ...f, country, regionCode: REGIONS[country]?.[0]?.code || '' }));
                }}
              >
                {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className="settings-row">
              <label htmlFor="auth-region">Province / State</label>
              <select
                id="auth-region" className="control-select" value={form.regionCode}
                onChange={(e) => setForm((f) => ({ ...f, regionCode: e.target.value }))}
              >
                {(REGIONS[form.country] || []).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </div>
            <div className="settings-row">
              <label htmlFor="auth-postal">Postal / Zip code</label>
              <input
                id="auth-postal" type="text" required className="control-select"
                value={form.postalCode}
                onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))}
                onBlur={(e) => setForm((f) => ({ ...f, postalCode: formatPostalOrZip(e.target.value, f.country) }))}
              />
            </div>

            <label className="field-label" htmlFor="auth-website">Website (optional)</label>
            <input
              id="auth-website" type="text" className="control-select"
              value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
            />
            <label className="field-label" htmlFor="auth-social">Social link (optional)</label>
            <input
              id="auth-social" type="text" className="control-select"
              value={form.socialUrl} onChange={(e) => setForm((f) => ({ ...f, socialUrl: e.target.value }))}
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
