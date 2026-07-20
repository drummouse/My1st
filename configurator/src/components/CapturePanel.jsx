import { useEffect, useRef, useState } from 'react';
import { captureApi, captureAssetBlobUrl, newClientRef } from '../lib/captureClient.js';
import { uploadCaptureImage } from '../lib/captureUpload.js';
import { createUploadQueue } from '../lib/captureUploadQueue.js';
// Shared verbatim with the server's submit gate (pure ESM, D-021) — the
// completeness the user sees is the completeness the server enforces.
import { validateCompleteness, DIMENSION_UNITS, EXPOSURE_CATEGORIES } from '../../api/_lib/capturePolicy.js';
import CaptureCamera from './CaptureCamera.jsx';
import CaptureReview from './CaptureReview.jsx';
import CaptureProfileScan from './CaptureProfileScan.jsx';

const PHOTO_PURPOSES = [
  { id: 'main', label: 'Main photo', hint: 'The whole product, straight on' },
  { id: 'surface', label: 'Surface close-up', hint: 'Fill the frame with the finish/texture' },
  { id: 'label', label: 'Label / packaging', hint: 'SKU, barcode, and manufacturer text readable' },
];

const CAPTURE_TYPES = [
  { id: 'profile_geometry', label: 'Profile Geometry scan' },
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

const numberOrNull = (value) => (value === '' || value == null ? null : Number(value));

const formFromDetail = (detail) => {
  const field = (key) => detail.fields.find((f) => f.fieldKey === key)?.value;
  const dims = field('dimensions') || {};
  const coverage = field('coverage') || {};
  const color = field('color') || {};
  return {
    title: detail.session.title || '',
    category: detail.session.category || '',
    description: field('description') || '',
    manufacturer: field('manufacturer') || '',
    supplier: field('supplier') || '',
    sku: field('sku') || '',
    barcode: field('barcode') || '',
    notes: field('notes') || '',
    dimUnit: dims.unit || 'mm',
    dimWidth: dims.width ?? '',
    dimLength: dims.length ?? '',
    dimThickness: dims.thickness ?? '',
    exposure: coverage.exposure ?? '',
    colorName: color.name || '',
    colorHex: color.hex || '',
  };
};

const patchFromForm = (form) => ({
  title: form.title,
  category: form.category || null,
  fields: {
    description: form.description,
    manufacturer: form.manufacturer,
    supplier: form.supplier,
    sku: form.sku,
    barcode: form.barcode,
    notes: form.notes,
    dimensions: {
      unit: form.dimUnit,
      width: numberOrNull(form.dimWidth),
      length: numberOrNull(form.dimLength),
      thickness: numberOrNull(form.dimThickness),
    },
    coverage: { exposure: numberOrNull(form.exposure) },
    color: form.colorName || form.colorHex
      ? { mode: 'manual', name: form.colorName || null, hex: form.colorHex || null }
      : null,
  },
});

// Live completeness against the CURRENT form (including unsaved edits) —
// synthesized into the same shape the server validates after save.
const completenessFromForm = (open, form) => validateCompleteness({
  session: { ...open.session, title: form.title, category: form.category || null },
  fields: Object.entries(patchFromForm(form).fields).map(([fieldKey, value]) => ({ fieldKey, value })),
  assets: open.assets || [],
});

// Minimal Studio-readable consumer of the published Library (Stage 5): the
// same /api/library/products DTO a Studio selector will use, showing each
// product's stable ID and immutable version. Selecting in Studio stores
// this DTO snapshot + {productId, version} — the pin contract.
function LibraryProducts() {
  const [products, setProducts] = useState(null);
  useEffect(() => {
    captureApi.libraryProducts()
      .then(({ products: rows }) => setProducts(rows))
      .catch((err) => { console.error('Library products error:', err); setProducts([]); });
  }, []);
  if (!products) return <div className="control-sublabel">Loading published Library products…</div>;
  return (
    <div>
      <div className="field-label">Published Library (Studio-readable)</div>
      {products.length === 0 ? (
        <div className="control-sublabel">Nothing published yet — approve and publish a capture first.</div>
      ) : (
        <ul className="capture-list">
          {products.map((product) => (
            <li key={product.productId} className="capture-item">
              <span className="capture-item-title">
                {product.thumbnailUrl && (
                  <img className="capture-library-thumb" src={product.thumbnailUrl} alt="" aria-hidden="true" />
                )}
                {product.name}
                <span className="capture-status">v{product.version}</span>
              </span>
              <span className="control-sublabel">
                {product.category || 'no category'}
                {product.manufacturer ? ` · ${product.manufacturer}` : ''}
                {product.sku ? ` · ${product.sku}` : ''}
                {' · '}id {product.productId.slice(0, 8)}…
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Stage 1–3 Capture workspace: recoverable drafts, main/surface/label
// photos with upload sync states, guided product metadata, shared
// completeness validation, and submit/resubmit. Review arrives Stage 4.
export default function CapturePanel({ canReview = false }) {
  const [mode, setMode] = useState('mine'); // 'mine' | 'review'
  const [sessions, setSessions] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null); // { session, fields, assets } | null
  const [form, setForm] = useState(null);
  const [submitErrors, setSubmitErrors] = useState(null);
  const [cameraFor, setCameraFor] = useState(null); // purpose id | null
  const [queueItems, setQueueItems] = useState([]);
  const openRef = useRef(null);
  openRef.current = open;

  const load = () =>
    captureApi.list()
      .then(({ sessions: rows }) => setSessions(rows))
      .catch((err) => {
        console.error('Capture API error:', err);
        setStatus('Could not reach the Capture service.');
        setSessions([]);
      });

  useEffect(() => { load(); }, []);

  // One serial upload queue for the panel's lifetime. When an item lands,
  // refresh the open session so assets reflect the server's truth.
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

  const openSession = async (id) => {
    setBusy(true);
    setStatus('');
    setSubmitErrors(null);
    try {
      const detail = await captureApi.get(id);
      setOpen(detail);
      setForm(formFromDetail(detail));
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

  const saveDraft = async () => {
    const { session } = await captureApi.update(open.session.id, patchFromForm(form));
    const detail = await captureApi.get(session.id);
    setOpen(detail);
    return detail;
  };

  const handleSave = async () => {
    if (!open) return;
    setBusy(true);
    setStatus('');
    try {
      await saveDraft();
      setStatus('Draft saved.');
      load();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!open) return;
    setBusy(true);
    setStatus('');
    setSubmitErrors(null);
    try {
      await saveDraft();
      const { session, completeness } = await captureApi.submit(open.session.id);
      setOpen({ ...open, session });
      setStatus(`Submitted for review${completeness.warnings.length
        ? ` with ${completeness.warnings.length} warning(s) the reviewer will see.` : '.'}`);
      load();
    } catch (err) {
      if (err.code === 'CAPTURE_INCOMPLETE') {
        setSubmitErrors(err.details?.errors || []);
        setStatus('Not complete enough to submit yet.');
      } else {
        setStatus(err.message);
      }
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
      setForm(null);
      await load();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const modeToggle = canReview ? (
    <div className="export-buttons" role="tablist" aria-label="Capture workspace mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'mine'}
        className={mode === 'mine' ? 'btn-primary' : 'btn-secondary'}
        onClick={() => setMode('mine')}
      >
        My Captures
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'review'}
        className={mode === 'review' ? 'btn-primary' : 'btn-secondary'}
        onClick={() => setMode('review')}
      >
        Review Queue
      </button>
    </div>
  ) : null;

  if (mode === 'review' && canReview) {
    return (
      <div className="settings-panel">
        <div className="control-label">Capture</div>
        {modeToggle}
        <CaptureReview />
        <LibraryProducts />
      </div>
    );
  }

  if (!sessions) {
    return (
      <div className="settings-panel">
        <div className="control-label">Capture</div>
        <div className="control-sublabel">{status || 'Loading capture sessions…'}</div>
      </div>
    );
  }

  // Profile Geometry scans use the phase-based Scanner flow (Slice R1);
  // everything else keeps the guided-product editor below.
  if (open && open.session.captureType === 'profile_geometry') {
    return (
      <CaptureProfileScan
        detail={open}
        onDetailChange={setOpen}
        onExit={() => { setOpen(null); setForm(null); setStatus(''); load(); }}
      />
    );
  }

  if (open && form) {
    const editable = open.session.status === 'draft' || open.session.status === 'changes_requested';
    const completeness = completenessFromForm(open, form);
    const showExposure = EXPOSURE_CATEGORIES.includes(form.category);
    const text = (key, label, placeholder = '') => (
      <>
        <label className="field-label" htmlFor={`capture-${key}`}>{label}</label>
        <input
          id={`capture-${key}`}
          type="text"
          className="control-select"
          value={form[key]}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          placeholder={placeholder}
        />
      </>
    );

    return (
      <div className="settings-panel">
        <div className="control-label">
          {editable ? 'Capture draft' : 'Capture'}
          <span className={`capture-status capture-status-${open.session.status}`}>
            {STATUS_LABELS[open.session.status] || open.session.status}
          </span>
        </div>
        <div className="control-sublabel">
          {CAPTURE_TYPES.find((t) => t.id === open.session.captureType)?.label || open.session.captureType}
          {' · '}started {new Date(open.session.createdAt).toLocaleString()}
        </div>
        {open.session.status === 'changes_requested' && (
          <div className="control-sublabel" role="status">
            The reviewer returned this capture. Update it below and submit again.
          </div>
        )}

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
                    <a href={captureAssetBlobUrl(open.session.id, source.id)} target="_blank" rel="noreferrer">
                      <img className="capture-photo-thumb" src={captureAssetBlobUrl(open.session.id, (thumb || source).id)} alt={`${label} — opens full size`} />
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
                              setOpen(await captureApi.get(open.session.id));
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

        <div className="field-label">Product identity</div>
        {text('title', 'Product name / title', 'e.g. Standing-seam panel, charcoal')}
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
        <label className="field-label" htmlFor="capture-description">Description</label>
        <textarea
          id="capture-description"
          className="control-select"
          rows={3}
          value={form.description}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What is it, where is it used, anything notable"
        />
        {text('manufacturer', 'Manufacturer')}
        {text('supplier', 'Supplier')}
        {text('sku', 'SKU / product code')}
        {text('barcode', 'Barcode (manual entry)')}

        <div className="field-label">Measurements</div>
        <label className="field-label" htmlFor="capture-dim-unit">Unit</label>
        <select
          id="capture-dim-unit"
          className="control-select"
          value={form.dimUnit}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, dimUnit: e.target.value })}
        >
          {DIMENSION_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
        </select>
        <div className="capture-dims-row">
          {[['dimWidth', 'Width'], ['dimLength', 'Length'], ['dimThickness', 'Thickness']].map(([key, label]) => (
            <div key={key}>
              <label className="field-label" htmlFor={`capture-${key}`}>{label}</label>
              <input
                id={`capture-${key}`}
                type="number"
                min="0"
                step="any"
                className="control-select"
                value={form[key]}
                disabled={!editable || busy}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
        {showExposure && (
          <>
            <label className="field-label" htmlFor="capture-exposure">
              Exposure (visible width per course, {form.dimUnit})
            </label>
            <input
              id="capture-exposure"
              type="number"
              min="0"
              step="any"
              className="control-select"
              value={form.exposure}
              disabled={!editable || busy}
              onChange={(e) => setForm({ ...form, exposure: e.target.value })}
            />
          </>
        )}

        <div className="field-label">Color sample</div>
        <div className="control-sublabel">
          Approximate only — phone cameras and screens are not color-accurate. A reviewer confirms
          final color against manufacturer references.
        </div>
        {text('colorName', 'Color name', 'e.g. Charcoal RAL 7024')}
        <label className="field-label" htmlFor="capture-colorHex">Approximate color</label>
        <input
          id="capture-colorHex"
          type="color"
          className="capture-color-input"
          value={/^#[0-9a-fA-F]{6}$/.test(form.colorHex) ? form.colorHex : '#888888'}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, colorHex: e.target.value })}
        />

        <label className="field-label" htmlFor="capture-notes">Notes for the reviewer</label>
        <textarea
          id="capture-notes"
          className="control-select"
          rows={3}
          value={form.notes}
          disabled={!editable || busy}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Supplier yard, condition, anything the reviewer should know"
        />

        {(open.comments || []).length > 0 && (
          <>
            <div className="field-label">Reviewer comments</div>
            <ul className="capture-comment-list">
              {open.comments.map((c) => (
                <li key={c.id}>
                  <span className="capture-comment-author">{c.authorLabel || 'Reviewer'}</span>
                  {' · '}{new Date(c.createdAt).toLocaleString()}
                  <div>{c.body}</div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="field-label">Review &amp; submit</div>
        <div className="control-sublabel">
          Completeness: {completeness.score}% · Visibility: private to your company until reviewed.
        </div>
        {(submitErrors || completeness.errors).length > 0 && (
          <ul className="capture-check-list capture-check-errors">
            {(submitErrors || completeness.errors).map((item) => <li key={item.code}>{item.message}</li>)}
          </ul>
        )}
        {completeness.warnings.length > 0 && (
          <ul className="capture-check-list">
            {completeness.warnings.map((item) => <li key={item.code}>{item.message}</li>)}
          </ul>
        )}

        <div className="export-buttons">
          {editable && (
            <>
              <button type="button" className="btn-secondary" onClick={handleSave} disabled={busy}>
                Save Draft
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={busy || completeness.errors.length > 0}
              >
                {open.session.status === 'changes_requested' ? 'Resubmit for Review' : 'Submit for Review'}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setOpen(null); setForm(null); setStatus(''); load(); }}
            disabled={busy}
          >
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
      {modeToggle}
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
