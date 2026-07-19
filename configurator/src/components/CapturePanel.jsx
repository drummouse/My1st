import { useEffect, useRef, useState } from 'react';
import { captureApi, newClientRef } from '../lib/captureClient.js';
import { uploadCaptureImage } from '../lib/captureUpload.js';
import { createUploadQueue } from '../lib/captureUploadQueue.js';
import CaptureCamera from './CaptureCamera.jsx';

const PHOTO_PURPOSES = [
  { id: 'main', label: 'Main photo', hint: 'The whole product, straight on' },
  { id: 'surface', label: 'Surface close-up', hint: 'Fill the frame with the finish/texture' },
  { id: 'label', label: 'Label / packaging', hint: 'SKU, barcode, and manufacturer text readable' },
];

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
  const [open, setOpen] = useState(null); // { session, fields, assets } | null
  const [form, setForm] = useState({ title: '', category: '', notes: '' });
  const [cameraFor, setCameraFor] = useState(null); // purpose id | null
  const [queueItems, setQueueItems] = useState([]);
  const openRef = useRef(null);
  openRef.current = open;

  // One serial upload queue for the panel's lifetime. When an item lands
  // (or fails), refresh the open session so its assets reflect the truth on
  // the server rather than optimistic client state.
  const queueRef = useRef(null);
  if (!queueRef.current) {
    queueRef.current = createUploadQueue({
      performUpload: (job) => uploadCaptureImage(job),
      onChange: (items) => {
        setQueueItems(items);
        const current = openRef.current;
        if (current && items.some((item) => item.status === 'done' && item.job.sessionId === current.session.id)) {
          captureApi.get(current.session.id)
            .then((detail) => { if (openRef.current?.session.id === detail.session.id) setOpen(detail); })
            .catch(() => {});
        }
      },
    });
  }

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

        <div className="field-label">Photos</div>
        <div className="capture-photo-grid">
          {PHOTO_PURPOSES.map(({ id, label, hint }) => {
            const source = (open.assets || []).find((a) => a.purpose === id && a.classification === 'source');
            const thumb = source && (open.assets || []).find((a) => a.classification === 'derived' && a.sourceAssetId === source.id);
            const pending = queueItems.find((item) => item.job.sessionId === open.session.id
              && item.job.purpose === id && item.status !== 'done');
            const lowRes = source?.captureMetadata?.qualityWarnings?.includes('low_resolution');
            return (
              <div className="capture-photo-slot" key={id}>
                <div className="capture-photo-slot-title">{label}</div>
                {source ? (
                  <>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      <img className="capture-photo-thumb" src={(thumb || source).url} alt={`${label} — opens full size`} />
                    </a>
                    {lowRes && <div className="control-sublabel">⚠ Low resolution — consider retaking closer or in better light.</div>}
                    {editable && (
                      <div className="export-buttons">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy || Boolean(pending)}
                          onClick={async () => {
                            try {
                              await captureApi.removeAsset(open.session.id, source.id);
                              const detail = await captureApi.get(open.session.id);
                              setOpen(detail);
                              setCameraFor(id);
                            } catch (err) { setStatus(err.message); }
                          }}
                        >
                          Retake
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy || Boolean(pending)}
                          onClick={async () => {
                            try {
                              await captureApi.removeAsset(open.session.id, source.id);
                              setOpen(await captureApi.get(open.session.id));
                            } catch (err) { setStatus(err.message); }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                ) : pending ? (
                  <div className="control-sublabel" role="status">
                    {pending.status === 'uploading' && 'Uploading…'}
                    {pending.status === 'waiting' && 'Waiting to upload…'}
                    {pending.status === 'failed' && (
                      <>
                        Upload failed: {pending.error}{' '}
                        <button type="button" className="btn-secondary" onClick={() => queueRef.current.retry(pending.id)}>
                          Retry
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="control-sublabel">{hint}</div>
                    {editable && (
                      <button type="button" className="btn-secondary" disabled={busy} onClick={() => setCameraFor(id)}>
                        Add Photo
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {cameraFor && (
          <CaptureCamera
            purposeLabel={PHOTO_PURPOSES.find((p) => p.id === cameraFor)?.label || cameraFor}
            onAccept={(file) => queueRef.current.enqueue({ sessionId: open.session.id, purpose: cameraFor, file })}
            onClose={() => setCameraFor(null)}
          />
        )}

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
