import { useCallback, useEffect, useState } from 'react';
import { superadminApi } from '../lib/superadminClient.js';
import LibraryConsole from './LibraryConsole.jsx';

const EMPTY_USER = { email: '', companyName: '', phone: '', temporaryPassword: '', reason: '' };

export default function PlatformConsole({ capabilities = [] }) {
  const [summary, setSummary] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [audit, setAudit] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [form, setForm] = useState(EMPTY_USER);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextSummary, tenantResult, auditResult, noticeResult] = await Promise.all([
        superadminApi.summary(), superadminApi.tenants(), superadminApi.audit(), superadminApi.notifications(),
      ]);
      setSummary(nextSummary);
      setTenants(tenantResult.tenants || []);
      setAudit(auditResult.events || []);
      setNotifications(noticeResult.notifications || []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (operation) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const statusChange = (tenant, status) => {
    const reason = window.prompt(`Reason to ${status} ${tenant.email}:`);
    if (!reason?.trim()) return;
    run(() => superadminApi.changeStatus(tenant.id, status, reason));
  };

  const resetPassword = (tenant) => {
    const temporaryPassword = window.prompt(`Temporary password for ${tenant.email} (12+ characters):`);
    if (!temporaryPassword) return;
    const reason = window.prompt('Reason for password reset:');
    if (!reason?.trim()) return;
    run(() => superadminApi.resetPassword(tenant.id, temporaryPassword, reason));
  };

  return (
    <main className="platform-console">
      <div className="platform-heading">
        <div><h1>Platform Console</h1><p>Account operations and privacy-safe technical diagnostics.</p></div>
        <button className="btn-secondary" type="button" onClick={refresh} disabled={busy}>Refresh</button>
      </div>
      {error && <div className="platform-error">{error}</div>}

      {capabilities.includes('catalog.read') && <LibraryConsole capabilities={capabilities} tenants={tenants} />}

      <section className="platform-stats" aria-label="Platform summary">
        <div><strong>{summary?.accounts?.active || 0}</strong><span>Active accounts</span></div>
        <div><strong>{(summary?.accounts?.frozen || 0) + (summary?.accounts?.blocked || 0)}</strong><span>Restricted</span></div>
        <div><strong>{summary?.projectCount || 0}</strong><span>Projects (count only)</span></div>
        <div><strong>{summary?.pendingNotifications || 0}</strong><span>Notices pending</span></div>
      </section>

      <section className="platform-card">
        <h2>Create contractor account</h2>
        <form className="platform-form" onSubmit={(event) => {
          event.preventDefault();
          run(async () => { await superadminApi.createUser(form); setForm(EMPTY_USER); });
        }}>
          <input required type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Company" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
          <input placeholder="Phone / SMS" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input required minLength={12} type="password" placeholder="Temporary password" value={form.temporaryPassword} onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })} />
          <input required placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <button className="btn-primary" disabled={busy}>Create user</button>
        </form>
      </section>

      <section className="platform-card">
        <h2>Accounts</h2>
        <div className="platform-table-wrap"><table className="platform-table">
          <thead><tr><th>Account</th><th>Status</th><th>Projects</th><th>Last login</th><th>Actions</th></tr></thead>
          <tbody>{tenants.map((tenant) => <tr key={tenant.id}>
            <td><strong>{tenant.companyName || tenant.email}</strong><small>{tenant.email}</small></td>
            <td><span className={`status-badge status-${tenant.status}`}>{tenant.status}</span>{tenant.statusReason && <small>{tenant.statusReason}</small>}</td>
            <td>{tenant.projectCount}</td><td>{tenant.lastLoginAt ? new Date(tenant.lastLoginAt).toLocaleString() : 'Never'}</td>
            <td className="platform-actions">
              {tenant.status !== 'frozen' && tenant.status !== 'deleted' && <button onClick={() => statusChange(tenant, 'frozen')}>Freeze</button>}
              {tenant.status !== 'blocked' && tenant.status !== 'deleted' && <button onClick={() => statusChange(tenant, 'blocked')}>Block</button>}
              {tenant.status !== 'active' && <button onClick={() => statusChange(tenant, 'active')}>Activate</button>}
              {tenant.status !== 'deleted' && <button onClick={() => statusChange(tenant, 'deleted')}>Delete</button>}
              {tenant.status !== 'deleted' && <button onClick={() => resetPassword(tenant)}>Reset password</button>}
            </td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="platform-grid">
        <div className="platform-card"><h2>Audit trail</h2><ul className="platform-feed">{audit.slice(0, 20).map((event) => <li key={event.id}><strong>{event.action}</strong><span>{event.reason || 'No reason'} · {event.supportReference || '—'}</span></li>)}</ul></div>
        <div className="platform-card"><h2>Notification outbox</h2><ul className="platform-feed">{notifications.slice(0, 20).map((notice) => <li key={notice.id}><strong>{notice.channel} · {notice.status}</strong><span>{notice.supportReference}</span>{notice.status !== 'sent' && <button onClick={() => { const reason = window.prompt('Reason to retry notification:'); if (reason?.trim()) run(() => superadminApi.retryNotification(notice.id, reason)); }}>Retry</button>}</li>)}</ul></div>
      </section>
    </main>
  );
}
