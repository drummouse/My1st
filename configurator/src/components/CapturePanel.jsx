import { useEffect, useState } from 'react';
import { captureApi, newClientRef } from '../lib/captureClient.js';

const CAPTURE_TYPES = [
  { id: 'guided_product', label: 'Guided product capture' },
  { id: 'quick', label: 'Quick capture' },
];

const CATEGORIES = [
  ['roofing', 'Roofing'], ['siding', 'Siding'], ['soffit', 'Soffit'], ['fascia', 'Fascia'],
  ['gutter', 'Gutter'], ['downspout', 'Downspout'], ['trim', 'Trim / Flashing'],
  ['accessory', 'Accessory'], ['other', 'Other'],
];

const STATUS_LABELS = {
  draft: 'Draft',
  submitted: 'Submitted',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  publishing: 'Publishing',
  published: 'Published',
  rejected: 'Rejected',
  archived: 'Archived',
};

// Stage 1 Capture workspace: create, resume, edit, and archive draft
// capture sessions. Photos, guided steps, submission, and review arrive in
// later stages — this panel is deliberately just the recoverable-draft
// foundation, mobile-first (single column, large touch targets).
export default function CapturePanel() {
  const [sessions, setSessions] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // { session, fields } | null
  const [form, setForm] = useState({ title: '', category: '', notes: '' });

  const load = () =>
    captureApi.list()
      .then(({ sessions: rows }) => setSessions(rows))
      .catch((err) => {
        console.error('Capture API error:', err);
        setStatus('Could not reach the Capture service.');
        setSessions([]);
      });

  useEffect(() => { load(); }, []);

  const openSession = async (id) => {
    setBusy(true);
    setStatus('');
    try {
      const detail = await captureApi.get(id);
      setOpen(detail);
      setForm({
        title: detail.session.title || '',
        category: detail.session.category || '',
        notes: detail.fields.find((f) => f.fieldKey === 'notes')?.value || '',
      });
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (captureType) => {
    setBusy(true);
    setStatus('');
    try {
      const { session } = await captureApi.create({ captureType, clientRef: newClientRef() });
      await load();
      await openSession(session.id);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!open) return;
    setBusy(true);
    setStatus('');
    try {
      const { session } = await captureApi.update(open.session.id, {
        title: form.title,
        category: form.category || null,
        fields: { notes: form.notes },
      });
      setOpen({ ...open, session });
      setStatus('Draft saved.');
      load();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!open) return;
    setBusy(true);
    setStatus('');
    try {
      await captureApi.archive(open.session.id);
      setOpen(null);
      await load();
    } catch (err) {
      setStatus(err.message);
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  if (!sessions) {
    return (
      <div className="settings-panel">
        <div className="control-label">Capture</div>
        <div className="control-sublabel">{status || 'Loading capture sessions…'}</div>
      </div>
    );
  }

  if (open) {
    const editable = open.session.status === 'draft' || open.session.status === 'changes_requested';
    return (
      <div className="settings-panel">
        <div className="control-label">
          Capture draft
          <span className={`capture-status capture-status-${open.session.status}`}>
            {STATUS_LABELS[open.session.status] || open.session.status}
          </span>
        </div>
        <div className="control-sublabel">
          {CAPTURE_TYPES.find((t) => t.id === open.session.captureType)?.label || open.session.captureType}
          {' · '}started {new Date(open.session.createdAt).toLocaleString()}
        </div>

        <label className="field-label" htmlFor="capture-title">Product name / title</label>
        <input
          id="capture-title"
          type="text"
          className="control-select"
          value={form.title}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="e.g. Standing-seam panel, charcoal"
        />

        <label className="field-label" htmlFor="capture-category">Product category</label>
        <select
          id="capture-category"
          className="control-select"
          value={form.category}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="">Choose a category…</option>
          {CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>

        <label className="field-label" htmlFor="capture-notes">Notes</label>
        <textarea
          id="capture-notes"
          className="control-select"
          rows={4}
          value={form.notes}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Anything a reviewer should know — supplier, where it was seen, condition…"
        />

        <div className="export-buttons">
          {editable && (
            <button type="button" className="btn-primary" onClick={handleSave} disabled={busy}>
              Save Draft
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => { setOpen(null); setStatus(''); load(); }} disabled={busy}>
            Back to List
          </button>
          {open.session.status === 'draft' && (
            <button type="button" className="btn-secondary" onClick={handleArchive} disabled={busy}>
              Archive Draft
            </button>
          )}
        </div>
        {status && <div className="control-sublabel" role="status">{status}</div>}
      </div>
    );
  }

  return (
    <div className="settings-panel">
      <div className="control-label">Capture</div>
      <div className="control-sublabel">
        Digitize a product for review. Drafts save to your account — start on one device, resume on another.
      </div>
      <div className="export-buttons">
        {CAPTURE_TYPES.map(({ id, label }) => (
          <button key={id} type="button" className="btn-primary" onClick={() => handleCreate(id)} disabled={busy}>
            + {label}
          </button>
        ))}
      </div>
      {status && <div className="control-sublabel" role="status">{status}</div>}
      {sessions.length === 0 ? (
        <div className="control-sublabel">No captures yet.</div>
      ) : (
        <ul className="capture-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <button type="button" className="capture-item" onClick={() => openSession(session.id)} disabled={busy}>
                <span className="capture-item-title">{session.title || 'Untitled capture'}</span>
                <span className="control-sublabel">
                  {(CATEGORIES.find(([id]) => id === session.category)?.[1]) || 'No category'}
                  {' · '}{new Date(session.updatedAt).toLocaleString()}
                </span>
                <span className={`capture-status capture-status-${session.status}`}>
                  {STATUS_LABELS[session.status] || session.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
