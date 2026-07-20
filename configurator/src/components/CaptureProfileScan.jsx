import { useEffect, useRef, useState } from 'react';
import { captureApi } from '../lib/captureClient.js';
import { uploadCaptureImage, replaceCaptureImage } from '../lib/captureUpload.js';
import { createUploadQueue } from '../lib/captureUploadQueue.js';
import { createCaptureLocalStore, createIndexedDbDriver, createMemoryDriver } from '../lib/captureLocalStore.js';
// Shared with the server (D-021): the guidance shown is the guidance the
// submit gate enforces.
import { evaluateProfileEvidence, buildProfilePreviewSvg, SHOT_GUIDES } from '../../api/_lib/captureEvidence.js';
import { validateCompleteness, DIMENSION_UNITS } from '../../api/_lib/capturePolicy.js';
import CaptureCamera from './CaptureCamera.jsx';

// IndexedDB may be unavailable (locked-down browsing contexts, some test
// harnesses) — degrade to an in-memory driver rather than crash the scan.
// Local durability is a resilience layer, not the primary source of truth.
function createBrowserLocalStore() {
  try {
    return createCaptureLocalStore({ driver: createIndexedDbDriver() });
  } catch {
    return createCaptureLocalStore({ driver: createMemoryDriver() });
  }
}

const PHASES = [
  ['setup', 'Setup'],
  ['geometry', 'Geometry'],
  ['measurements', 'Measurements'],
  ['preview', 'Preview'],
  ['submit', 'Submit'],
];

// §15 synchronization vocabulary.
const SYNC_LABELS = {
  waiting: 'Waiting for connection',
  uploading: 'Uploading…',
  failed: 'Upload failed — tap Retry',
  done: 'Synced',
};

// Guided Profile Geometry scan (Slice R1): calibration → guided initial
// views → one adaptive follow-up shot → confirmed measurements → measured
// SVG preview + confidence → submit. Camera-first, one primary action per
// screen, large touch targets; deterministic evidence, no CV claims.
export default function CaptureProfileScan({ detail, onDetailChange, onExit }) {
  const [phase, setPhase] = useState('setup');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraFor, setCameraFor] = useState(null); // view id | null
  const [replaceAssetId, setReplaceAssetId] = useState(null); // set when cameraFor is a replacement shot
  const [queueItems, setQueueItems] = useState([]);
  const [calibrationForm, setCalibrationForm] = useState({
    units: 'mm', knownValue: '', knownFeature: 'overall width', rulerConfirmed: false,
  });
  const [title, setTitle] = useState(detail.session.title || '');
  const [measureForm, setMeasureForm] = useState({ feature: '', axis: 'width', value: '' });
  const [submitted, setSubmitted] = useState(null);
  const detailRef = useRef(detail);
  detailRef.current = detail;

  const session = detail.session;
  const editable = session.status === 'draft' || session.status === 'changes_requested';
  const evidence = evaluateProfileEvidence(detail);
  const completeness = validateCompleteness(detail);
  const previewSvg = buildProfilePreviewSvg(detail.measurements || []);
  const calibration = detail.fields.find((f) => f.fieldKey === 'calibration')?.value;

  const refresh = async () => {
    const next = await captureApi.get(session.id);
    onDetailChange(next);
    return next;
  };

  const localStoreRef = useRef(null);
  if (!localStoreRef.current) localStoreRef.current = createBrowserLocalStore();

  const queueRef = useRef(null);
  if (!queueRef.current) {
    queueRef.current = createUploadQueue({
      performUpload: (job) => (job.replaceAssetId
        ? replaceCaptureImage(job)
        : uploadCaptureImage(job)),
      onChange: (items) => {
        setQueueItems(items);
        // Local durability tracks the SAME status the upload queue reports
        // (R2.2): a reload rehydrates from this, not from memory. Local
        // evidence is pruned only on 'done' — a server-confirmed finalize —
        // never on 'failed' or optimistically (confirmation-before-prune).
        items.forEach((item) => {
          if (!item.job.localId) return;
          localStoreRef.current.saveQueueEntry({
            id: item.job.localId, sessionId: item.job.sessionId, status: item.status,
            attempts: item.attempts, lastError: item.error,
          }).catch(() => {});
          if (item.status === 'done') {
            localStoreRef.current.confirmSynced(item.job.sessionId, item.job.localId, {
              serverAssetId: item.result?.asset?.id,
            }).catch(() => {});
          }
        });
        if (items.some((item) => item.status === 'done' && item.job.sessionId === detailRef.current.session.id)) {
          captureApi.get(detailRef.current.session.id).then(onDetailChange).catch(() => {});
        }
      },
    });
  }

  useEffect(() => {
    if (calibration && phase === 'setup') setPhase('geometry');
    // Resume anything interrupted by a reload/close: normalize stuck
    // "uploading" rows back to "waiting" and re-enqueue every resumable
    // pending photo from durable storage, exactly as it was accepted.
    (async () => {
      const resumable = await localStoreRef.current.rehydrateQueue(session.id).catch(() => []);
      for (const entry of resumable) {
        // eslint-disable-next-line no-await-in-loop
        const pending = await localStoreRef.current.getPendingAsset(entry.id).catch(() => null);
        if (!pending) continue;
        queueRef.current.enqueue({
          sessionId: pending.sessionId,
          purpose: pending.purpose,
          file: pending.blob,
          requestedPose: pending.requestedPose || null,
          replaceAssetId: pending.replaceAssetId || null,
          oldAssetId: pending.replaceAssetId || undefined,
          localId: pending.id,
          priorHashes: [],
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Non-superseded, non-derived accepted photos' perceptual hashes, so a
  // new accept can be compared against everything already captured in this
  // session (R2.2 near-duplicate indication).
  const priorHashesFor = () => (detail.assets || [])
    .filter((a) => a.classification === 'source' && !a.supersededBy && a.captureMetadata?.perceptualHash)
    .map((a) => ({ hash: a.captureMetadata.perceptualHash }));

  // Write-through to durable local storage BEFORE enqueueing the network
  // upload — "Saved on device" must be true the instant the user accepts a
  // photo, not once the upload finishes (R2.2/R2.1).
  const acceptPhoto = async (file, view, oldAssetId) => {
    const localId = (crypto.randomUUID ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const requestedPose = SHOT_GUIDES[view] || null;
    await localStoreRef.current.savePendingAsset({
      id: localId, sessionId: session.id, purpose: view, blob: file, requestedPose, replaceAssetId: oldAssetId || null,
    });
    await localStoreRef.current.enqueueForSync({ pendingAssetId: localId, sessionId: session.id });
    queueRef.current.enqueue({
      sessionId: session.id, purpose: view, file, requestedPose,
      replaceAssetId: oldAssetId || null, oldAssetId, localId, priorHashes: priorHashesFor(),
    });
  };

  const act = async (work) => {
    setBusy(true);
    setStatus('');
    try {
      await work();
    } catch (err) {
      setStatus(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCalibration = () => act(async () => {
    if (title.trim() && title !== session.title) {
      await captureApi.update(session.id, { title });
    }
    await captureApi.saveCalibration(session.id, {
      units: calibrationForm.units,
      knownMeasurement: { value: Number(calibrationForm.knownValue), feature: calibrationForm.knownFeature },
      rulerConfirmed: calibrationForm.rulerConfirmed,
    });
    await refresh();
    setPhase('geometry');
  });

  const handleAddMeasurement = () => act(async () => {
    await captureApi.addMeasurement(session.id, {
      feature: measureForm.feature || measureForm.axis,
      axis: measureForm.axis,
      value: Number(measureForm.value),
      unit: calibration?.units || 'mm',
      method: 'ruler',
    });
    setMeasureForm({ feature: '', axis: 'width', value: '' });
    await refresh();
  });

  const handleSubmit = () => act(async () => {
    const { session: updated, completeness: result } = await captureApi.submit(session.id);
    onDetailChange({ ...detail, session: updated });
    setSubmitted(result);
  });

  const pendingFor = (view) => queueItems.find((item) => item.job.sessionId === session.id
    && item.job.purpose === view && item.status !== 'done');
  // A superseded (replaced) source asset no longer counts as "the" photo
  // for its view — only the current, non-superseded one does (R2.2).
  const currentSourceFor = (view) => (detail.assets || [])
    .find((a) => a.purpose === view && a.classification === 'source' && !a.supersededBy);
  const shotDone = (view) => Boolean(currentSourceFor(view));
  const thumbFor = (view) => {
    const source = currentSourceFor(view);
    const thumb = source && (detail.assets || []).find((a) => a.classification === 'derived' && a.sourceAssetId === source.id);
    return (thumb || source)?.url || null;
  };

  const pendingCount = queueItems.filter((i) => i.job.sessionId === session.id && i.status !== 'done').length;
  const failedItem = queueItems.find((i) => i.job.sessionId === session.id && i.status === 'failed');
  const syncLabel = failedItem ? SYNC_LABELS.failed
    : pendingCount > 0 ? `Uploading ${queueItems.filter((i) => i.status === 'done').length + 1} of ${queueItems.length}`
      : queueItems.length > 0 ? SYNC_LABELS.done : 'Saved on device';

  const shotCard = (guide) => (
    <div className="capture-photo-slot" key={guide.view}>
      <div className="capture-photo-slot-title">{guide.title}</div>
      {shotDone(guide.view) ? (
        <>
          <img className="capture-photo-thumb" src={thumbFor(guide.view)} alt={`${guide.title} — captured`} />
          {editable && (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => { setReplaceAssetId(currentSourceFor(guide.view).id); setCameraFor(guide.view); }}
            >
              Replace This Photo
            </button>
          )}
        </>
      ) : pendingFor(guide.view) ? (
        <div className="control-sublabel" role="status">
          {SYNC_LABELS[pendingFor(guide.view).status] || pendingFor(guide.view).status}
          {pendingFor(guide.view).status === 'failed' && (
            <button type="button" className="btn-secondary" onClick={() => queueRef.current.retry(pendingFor(guide.view).id)}>
              Retry
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="control-sublabel">
            {guide.position}. {guide.angle}. {guide.distance}.
            {guide.rulerVisible ? ' Keep the ruler visible.' : ''}
          </div>
          <div className="control-sublabel">Why: {guide.reason}</div>
          {editable && (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => setCameraFor(guide.view)}>
              Capture This View
            </button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="settings-panel">
      <div className="control-label">
        Profile Geometry Scan
        <span className="capture-status">{session.status}</span>
      </div>
      <div className="control-sublabel" role="status">
        {PHASES.map(([id, label]) => (phase === id ? `● ${label}` : label)).join(' · ')} — {syncLabel}
      </div>

      {phase === 'setup' && (
        <>
          <label className="field-label" htmlFor="scan-title">Profile name</label>
          <input
            id="scan-title"
            type="text"
            className="control-select"
            placeholder="e.g. Standing-seam panel 450"
            value={title}
            disabled={busy || !editable}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="field-label">Calibration</div>
          <div className="control-sublabel">
            Place the sample on the calibration board with the ruler beside or touching it, then
            confirm one measurement you know.
          </div>
          <label className="field-label" htmlFor="cal-units">Units</label>
          <select
            id="cal-units"
            className="control-select"
            value={calibrationForm.units}
            disabled={busy}
            onChange={(e) => setCalibrationForm({ ...calibrationForm, units: e.target.value })}
          >
            {DIMENSION_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
          <label className="field-label" htmlFor="cal-feature">Known measurement — which feature?</label>
          <input
            id="cal-feature"
            type="text"
            className="control-select"
            value={calibrationForm.knownFeature}
            disabled={busy}
            onChange={(e) => setCalibrationForm({ ...calibrationForm, knownFeature: e.target.value })}
          />
          <label className="field-label" htmlFor="cal-value">Known value ({calibrationForm.units})</label>
          <input
            id="cal-value"
            type="number"
            min="0"
            step="any"
            className="control-select"
            value={calibrationForm.knownValue}
            disabled={busy}
            onChange={(e) => setCalibrationForm({ ...calibrationForm, knownValue: e.target.value })}
          />
          <label className="capture-confirm-row">
            <input
              type="checkbox"
              checked={calibrationForm.rulerConfirmed}
              disabled={busy}
              onChange={(e) => setCalibrationForm({ ...calibrationForm, rulerConfirmed: e.target.checked })}
            />
            The ruler is beside or touching the sample
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !editable || !calibrationForm.rulerConfirmed || !Number(calibrationForm.knownValue)}
            onClick={handleCalibration}
          >
            Save Calibration &amp; Start Shooting
          </button>
        </>
      )}

      {phase === 'geometry' && (
        <>
          <div className="field-label">
            {evidence.phase === 'adaptive' ? 'One more view needed' : 'Guided views'}
          </div>
          {evidence.needsCalibration && (
            <div className="control-sublabel">Calibration missing — go back to Setup first.</div>
          )}
          {evidence.phase === 'adaptive' && (
            <div className="control-sublabel" role="status">
              Coverage check: the back of the profile is not visible in any captured view.
            </div>
          )}
          <div className="capture-photo-grid">
            {evidence.complete
              ? Object.values(SHOT_GUIDES).filter((g) => shotDone(g.view)).map(shotCard)
              : evidence.shotRequests.map(shotCard)}
          </div>
          {evidence.qualitySummary.issueCount > 0 && (
            <div className="control-sublabel" role="status">
              {evidence.qualitySummary.issueCount} deterministic quality note{evidence.qualitySummary.issueCount === 1 ? '' : 's'}
              {evidence.qualitySummary.hasPossibleDuplicates ? ' — including a possible duplicate view' : ''} — estimates only, not blocking.
            </div>
          )}
          {evidence.complete && (
            <div className="control-sublabel" role="status">All required views captured.</div>
          )}
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('setup')} disabled={busy}>
              Back to Setup
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setPhase('measurements')}
              disabled={busy || !evidence.complete}
            >
              Continue to Measurements
            </button>
          </div>
        </>
      )}

      {cameraFor && (
        <CaptureCamera
          purposeLabel={SHOT_GUIDES[cameraFor]?.title || cameraFor}
          onAccept={(file) => {
            const oldAssetId = replaceAssetId;
            setCameraFor(null);
            setReplaceAssetId(null);
            acceptPhoto(file, cameraFor, oldAssetId).catch((err) => setStatus(err.message));
          }}
          onClose={() => { setCameraFor(null); setReplaceAssetId(null); }}
        />
      )}

      {phase === 'measurements' && (
        <>
          <div className="field-label">Confirmed measurements ({calibration?.units || 'mm'})</div>
          <ul className="capture-list">
            {(detail.measurements || []).map((m) => (
              <li key={m.id} className="capture-item">
                <span className="capture-item-title">{m.feature}{m.axis ? ` (${m.axis})` : ''}</span>
                <span className="control-sublabel">{m.value} {m.unit} · {m.method}</span>
                {editable && (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => act(async () => { await captureApi.removeMeasurement(session.id, m.id); await refresh(); })}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {editable && (
            <>
              <label className="field-label" htmlFor="m-axis">Axis</label>
              <select
                id="m-axis"
                className="control-select"
                value={measureForm.axis}
                disabled={busy}
                onChange={(e) => setMeasureForm({ ...measureForm, axis: e.target.value })}
              >
                {['width', 'height', 'depth', 'length'].map((axis) => <option key={axis} value={axis}>{axis}</option>)}
              </select>
              <label className="field-label" htmlFor="m-feature">Feature (optional)</label>
              <input
                id="m-feature"
                type="text"
                className="control-select"
                placeholder="e.g. overall width, rib height"
                value={measureForm.feature}
                disabled={busy}
                onChange={(e) => setMeasureForm({ ...measureForm, feature: e.target.value })}
              />
              <label className="field-label" htmlFor="m-value">Value ({calibration?.units || 'mm'})</label>
              <input
                id="m-value"
                type="number"
                min="0"
                step="any"
                className="control-select"
                value={measureForm.value}
                disabled={busy}
                onChange={(e) => setMeasureForm({ ...measureForm, value: e.target.value })}
              />
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || !Number(measureForm.value)}
                onClick={handleAddMeasurement}
              >
                Add Measurement
              </button>
            </>
          )}
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('geometry')} disabled={busy}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setPhase('preview')}
              disabled={busy || (detail.measurements || []).length === 0}
            >
              Continue to Preview
            </button>
          </div>
        </>
      )}

      {phase === 'preview' && (
        <>
          <div className="field-label">Measured cross-section (schematic)</div>
          {previewSvg ? (
            // eslint-disable-next-line react/no-danger
            <div className="capture-preview-svg" dangerouslySetInnerHTML={{ __html: previewSvg }} />
          ) : (
            <div className="control-sublabel">
              Add a width and a height/depth measurement to see the measured outline.
            </div>
          )}
          <div className="control-sublabel">
            Schematic from your confirmed measurements — not a photographic reconstruction.
            Evidence confidence: {(evidence.confidence * 100).toFixed(0)}%.
          </div>
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('measurements')} disabled={busy}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={() => setPhase('submit')} disabled={busy}>
              Continue to Submit
            </button>
          </div>
        </>
      )}

      {phase === 'submit' && (
        <>
          <div className="field-label">Review &amp; submit</div>
          {submitted ? (
            <div className="control-sublabel" role="status">
              Submitted for review — tenant-private, pending review
              {submitted.warnings.length ? ` with ${submitted.warnings.length} warning(s).` : '.'}
            </div>
          ) : (
            <>
              {completeness.errors.length > 0 && (
                <ul className="capture-check-list capture-check-errors">
                  {completeness.errors.map((item) => <li key={item.code}>{item.message}</li>)}
                </ul>
              )}
              {completeness.warnings.length > 0 && (
                <ul className="capture-check-list">
                  {completeness.warnings.map((item) => <li key={item.code}>{item.message}</li>)}
                </ul>
              )}
              <div className="control-sublabel">
                Completeness {completeness.score}% · visibility: private to your company.
              </div>
              {editable && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || completeness.errors.length > 0 || pendingCount > 0}
                  onClick={handleSubmit}
                >
                  Submit for Review
                </button>
              )}
            </>
          )}
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('preview')} disabled={busy}>
              Back
            </button>
          </div>
        </>
      )}

      {status && <div className="control-sublabel" role="status">{status}</div>}
      <div className="export-buttons">
        <button type="button" className="btn-secondary" onClick={onExit} disabled={busy}>
          Back to List
        </button>
      </div>
    </div>
  );
}
