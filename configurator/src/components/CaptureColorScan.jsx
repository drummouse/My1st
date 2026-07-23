import { useEffect, useRef, useState } from 'react';
import { captureApi, captureAssetBlobUrl } from '../lib/captureClient.js';
import { uploadCaptureImage } from '../lib/captureUpload.js';
import { createUploadQueue } from '../lib/captureUploadQueue.js';
// Shared with the server (D-021): the hex/lab/confidence a contributor sees
// is exactly what the submit gate validates and stores.
import { normalizeColorSample, FINISH_TYPES } from '../../api/_lib/captureColor.js';
import { validateCompleteness } from '../../api/_lib/capturePolicy.js';
import CaptureCamera from './CaptureCamera.jsx';

const FINISH_LABELS = {
  matte: 'Matte',
  satin: 'Satin',
  gloss: 'Gloss',
  semi_gloss: 'Semi-gloss',
  metallic: 'Metallic',
  textured: 'Textured',
};

// Color & Finish scan (first vertical slice of that scan type): one source
// photo, a tap-to-sample RGB reading off it, a finish classification, and
// optional manufacturer identity — producing a reusable color sample,
// never a full product record. Deliberately simpler than the Profile
// Geometry scan's multi-phase flow: a single photo and a short form, no
// calibration/coverage gate needed for a color/finish sample.
export default function CaptureColorScan({ detail, onDetailChange, onExit }) {
  const session = detail.session;
  const editable = session.status === 'draft' || session.status === 'changes_requested';
  const existingColor = detail.fields.find((f) => f.fieldKey === 'color')?.value || null;

  const [title, setTitle] = useState(session.title || '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [queueItems, setQueueItems] = useState([]);
  const [rgb, setRgb] = useState(existingColor?.rgb || null);
  const [finish, setFinish] = useState(existingColor?.finish || '');
  const [manufacturerName, setManufacturerName] = useState(existingColor?.manufacturerName || '');
  const [manufacturerCode, setManufacturerCode] = useState(existingColor?.manufacturerCode || '');

  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const queueRef = useRef(null);
  if (!queueRef.current) {
    queueRef.current = createUploadQueue({
      performUpload: (job) => uploadCaptureImage(job),
      onChange: (items) => {
        setQueueItems(items);
        if (items.some((item) => item.status === 'done' && item.job.sessionId === detailRef.current.session.id)) {
          captureApi.get(detailRef.current.session.id).then(onDetailChange).catch(() => {});
        }
      },
    });
  }

  const mainAsset = detail.assets.find((a) => a.purpose === 'main'
    && (a.classification || 'source') === 'source'
    && !(a.supersededBy ?? a.superseded_by));
  const completeness = validateCompleteness(detail);
  const sample = rgb && finish ? normalizeColorSample({ rgb, finish, manufacturerName, manufacturerCode }) : null;

  const handleSampleClick = (event) => {
    if (!editable) return;
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.min(img.naturalWidth - 1, Math.max(0, Math.round((event.clientX - rect.left) * scaleX)));
    const y = Math.min(img.naturalHeight - 1, Math.max(0, Math.round((event.clientY - rect.top) * scaleY)));
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    try {
      const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
      setRgb({ r, g, b });
    } catch (err) {
      setStatus('Could not sample that photo — reload and try again.');
    }
  };

  const saveDraft = async () => {
    const patch = { title: title || null };
    if (sample) patch.fields = { color: sample };
    const { session: updated } = await captureApi.update(session.id, patch);
    const next = await captureApi.get(updated.id);
    onDetailChange(next);
    return next;
  };

  const handleSave = async () => {
    setBusy(true);
    setStatus('');
    try {
      await saveDraft();
      setStatus('Draft saved.');
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    setBusy(true);
    setStatus('');
    try {
      await saveDraft();
      const { completeness: result } = await captureApi.submit(session.id);
      setStatus(`Submitted for review${result.warnings.length
        ? ` with ${result.warnings.length} warning(s) the reviewer will see.` : '.'}`);
      const next = await captureApi.get(session.id);
      onDetailChange(next);
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setTitle(session.title || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  return (
    <div className="settings-panel">
      <div className="control-label">Color &amp; Finish scan</div>
      <div className="control-sublabel">
        Sample a color straight off a source photo and record its finish. Produces a reusable color sample —
        not a product record.
      </div>

      <label className="field-label" htmlFor="color-scan-title">Name</label>
      <input
        id="color-scan-title"
        type="text"
        className="control-select"
        value={title}
        disabled={!editable}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Driftwood — manufacturer sample"
      />

      <div className="control-label" style={{ marginTop: '0.75rem' }}>Source photo</div>
      {mainAsset ? (
        <>
          <img
            ref={imgRef}
            src={captureAssetBlobUrl(session.id, mainAsset.id)}
            alt="Source for color sampling"
            className="capture-color-sample-photo"
            onClick={handleSampleClick}
          />
          <div className="control-sublabel">Tap or click anywhere on the photo to sample its color.</div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
      ) : (
        <div className="control-sublabel">No source photo yet.</div>
      )}
      {editable && (
        <button type="button" className="btn-secondary" onClick={() => setCameraOpen(true)} disabled={busy}>
          {mainAsset ? 'Retake photo' : 'Take photo'}
        </button>
      )}
      {cameraOpen && (
        <CaptureCamera
          purposeLabel="Source photo"
          onAccept={(file) => {
            queueRef.current.enqueue({ sessionId: session.id, purpose: 'main', file });
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
      {queueItems.some((item) => item.status !== 'done') && (
        <div className="control-sublabel">Uploading photo…</div>
      )}

      {rgb && (
        <div className="capture-color-sample-result">
          <span className="capture-color-swatch" style={{ background: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` }} />
          <div>
            <div>{sample?.hex}</div>
            <div className="control-sublabel">
              RGB {rgb.r}, {rgb.g}, {rgb.b}
              {sample && ` — LAB ${sample.lab.l}, ${sample.lab.a}, ${sample.lab.b}`}
            </div>
          </div>
        </div>
      )}

      <label className="field-label" htmlFor="color-scan-finish">Finish</label>
      <select
        id="color-scan-finish"
        className="control-select"
        value={finish}
        disabled={!editable}
        onChange={(e) => setFinish(e.target.value)}
      >
        <option value="">Choose a finish</option>
        {FINISH_TYPES.map((id) => <option key={id} value={id}>{FINISH_LABELS[id] || id}</option>)}
      </select>

      <label className="field-label" htmlFor="color-scan-manufacturer-name">Manufacturer name</label>
      <input
        id="color-scan-manufacturer-name"
        type="text"
        className="control-select"
        value={manufacturerName}
        disabled={!editable}
        onChange={(e) => setManufacturerName(e.target.value)}
      />

      <label className="field-label" htmlFor="color-scan-manufacturer-code">Manufacturer color code</label>
      <input
        id="color-scan-manufacturer-code"
        type="text"
        className="control-select"
        value={manufacturerCode}
        disabled={!editable}
        onChange={(e) => setManufacturerCode(e.target.value)}
      />

      <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
        Visual-grade estimate only — phone cameras and screens are not color-accurate. A reviewer should confirm
        the final color against manufacturer references before it's treated as more than approximate.
      </div>

      {completeness.errors.length > 0 && (
        <ul className="capture-check-list capture-check-errors">
          {completeness.errors.map((e) => <li key={e.code}>{e.message}</li>)}
        </ul>
      )}
      {completeness.warnings.length > 0 && (
        <ul className="capture-check-list">
          {completeness.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
        </ul>
      )}

      {status && <div className="control-sublabel" role="status">{status}</div>}

      {editable && (
        <div className="export-buttons">
          <button type="button" className="btn-secondary" onClick={handleSave} disabled={busy}>Save Draft</button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={busy || completeness.errors.length > 0}
          >
            Submit for review
          </button>
        </div>
      )}
      <button type="button" className="btn-secondary" onClick={onExit}>Back to captures</button>
    </div>
  );
}
