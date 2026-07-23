import { useRef, useState } from 'react';
import { captureApi, captureAssetBlobUrl } from '../lib/captureClient.js';
import { uploadCaptureImage } from '../lib/captureUpload.js';
import { createUploadQueue } from '../lib/captureUploadQueue.js';
// Shared with the server (D-021): the completeness the user sees is
// exactly what the submit gate enforces.
import { validateCompleteness, DIMENSION_UNITS, TEXTURE_DIRECTIONS } from '../../api/_lib/capturePolicy.js';
import CaptureCamera from './CaptureCamera.jsx';
import CaptureFlatWallPreview from './CaptureFlatWallPreview.jsx';

const MM_PER_UNIT = { mm: 1, cm: 10, in: 25.4, ft: 304.8 };
const toMm = (measurement) => (measurement ? Number(measurement.value) * (MM_PER_UNIT[measurement.unit] || 1) : null);

const DIRECTION_LABELS = {
  along_run: 'Along installation run',
  across_coverage: 'Across coverage width',
  custom: 'Custom direction',
  not_applicable: 'Not applicable',
};

// Texture scan (first vertical slice of that scan type): a flat-surface
// source photo, physical scale via the same calibration evidence Profile
// Geometry uses, the same material-zone/texture-direction confirmation R2.5
// built for its flat-wall technical-compatibility proof — except here those
// ARE the scan's core evidence, not an optional extra. Ships albedo (the
// source photo) + scale + direction only; perspective-corrected cropping
// and normal/roughness/metallic/AO/height derivatives are staged for a
// later slice, per the spec's own MVP framing for this scan type.
export default function CaptureTextureScan({ detail, onDetailChange, onExit }) {
  const session = detail.session;
  const editable = session.status === 'draft' || session.status === 'changes_requested';

  const [title, setTitle] = useState(session.title || '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [queueItems, setQueueItems] = useState([]);
  const calibration = detail.fields.find((f) => f.fieldKey === 'calibration')?.value;
  const [calibrationForm, setCalibrationForm] = useState({
    units: 'mm', knownValue: '', knownFeature: 'overall width', rulerConfirmed: false,
  });
  const widthMeasurement = (detail.measurements || []).find((m) => m.axis === 'width');
  const heightMeasurement = (detail.measurements || []).find((m) => m.axis === 'height');
  const [widthValue, setWidthValue] = useState(widthMeasurement?.value ?? '');
  const [heightValue, setHeightValue] = useState(heightMeasurement?.value ?? '');

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
  const materialZoneConfirmed = session.materialZoneState?.zones?.[0]?.confirmed === true;

  const refresh = async () => {
    const next = await captureApi.get(session.id);
    onDetailChange(next);
    return next;
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

  const handleSave = () => act(async () => {
    if (title.trim() && title !== session.title) await captureApi.update(session.id, { title });
    await refresh();
    setStatus('Draft saved.');
  });

  const handleSaveCalibration = () => act(async () => {
    await captureApi.saveCalibration(session.id, {
      units: calibrationForm.units,
      knownMeasurement: { value: Number(calibrationForm.knownValue), feature: calibrationForm.knownFeature },
      rulerConfirmed: calibrationForm.rulerConfirmed,
    });
    await refresh();
  });

  const handleSaveDimensions = () => act(async () => {
    const unit = calibration?.units || 'mm';
    if (Number(widthValue) > 0) {
      await captureApi.addMeasurement(session.id, { feature: 'width', axis: 'width', value: Number(widthValue), unit, method: 'ruler' });
    }
    if (Number(heightValue) > 0) {
      await captureApi.addMeasurement(session.id, { feature: 'height', axis: 'height', value: Number(heightValue), unit, method: 'ruler' });
    }
    await refresh();
  });

  const handleConfirmMaterialZone = () => act(async () => {
    await captureApi.saveMaterialZone(session.id, { mainVisibleFaceConfirmed: true });
    await refresh();
  });

  const handleTextureDirection = (value) => act(async () => {
    await captureApi.saveTextureDirection(session.id, value);
    await refresh();
  });

  const handleRunValidation = () => act(async () => {
    await captureApi.evaluateStudioValidation(session.id);
    await refresh();
  });

  const handleSubmit = () => act(async () => {
    if (title.trim() && title !== session.title) await captureApi.update(session.id, { title });
    const { completeness: result } = await captureApi.submit(session.id);
    setStatus(`Submitted for review${result.warnings.length
      ? ` with ${result.warnings.length} warning(s) the reviewer will see.` : '.'}`);
    await refresh();
  });

  return (
    <div className="settings-panel">
      <div className="control-label">Texture scan</div>
      <div className="control-sublabel">
        Capture a flat, square-on surface, confirm its real-world scale and direction, and submit a
        reusable texture asset — not a product record.
      </div>

      <label className="field-label" htmlFor="texture-scan-title">Name</label>
      <input
        id="texture-scan-title"
        type="text"
        className="control-select"
        value={title}
        disabled={!editable || busy}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Driftwood woodgrain texture"
      />

      <div className="control-label" style={{ marginTop: '0.75rem' }}>Source photo</div>
      {mainAsset ? (
        <img
          src={captureAssetBlobUrl(session.id, mainAsset.id)}
          alt="Flat-surface texture source"
          className="capture-color-sample-photo"
        />
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
          purposeLabel="Flat-surface texture source"
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

      <div className="field-label">Calibration (physical scale)</div>
      <div className="control-sublabel">
        Place a ruler beside or touching the surface, then confirm one measurement you know.
      </div>
      <label className="field-label" htmlFor="texture-cal-units">Units</label>
      <select
        id="texture-cal-units"
        className="control-select"
        value={calibrationForm.units}
        disabled={!editable || busy}
        onChange={(e) => setCalibrationForm({ ...calibrationForm, units: e.target.value })}
      >
        {DIMENSION_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
      </select>
      <label className="field-label" htmlFor="texture-cal-feature">Known measurement — which feature?</label>
      <input
        id="texture-cal-feature"
        type="text"
        className="control-select"
        value={calibrationForm.knownFeature}
        disabled={!editable || busy}
        onChange={(e) => setCalibrationForm({ ...calibrationForm, knownFeature: e.target.value })}
      />
      <label className="field-label" htmlFor="texture-cal-value">Known value ({calibrationForm.units})</label>
      <input
        id="texture-cal-value"
        type="number"
        min="0"
        step="any"
        className="control-select"
        value={calibrationForm.knownValue}
        disabled={!editable || busy}
        onChange={(e) => setCalibrationForm({ ...calibrationForm, knownValue: e.target.value })}
      />
      <label className="capture-confirm-row">
        <input
          type="checkbox"
          checked={calibrationForm.rulerConfirmed}
          disabled={!editable || busy}
          onChange={(e) => setCalibrationForm({ ...calibrationForm, rulerConfirmed: e.target.checked })}
        />
        The ruler is beside or touching the surface
      </label>
      {calibration ? (
        <div className="control-sublabel" role="status">
          Calibrated: {calibration.knownMeasurement.feature} = {calibration.knownMeasurement.value} {calibration.units}
        </div>
      ) : editable && (
        <button
          type="button"
          className="btn-secondary"
          disabled={busy || !calibrationForm.rulerConfirmed || !Number(calibrationForm.knownValue)}
          onClick={handleSaveCalibration}
        >
          Save Calibration
        </button>
      )}

      <div className="field-label">Width &amp; height ({calibration?.units || 'mm'})</div>
      <div className="capture-dims-row">
        <input
          type="number"
          min="0"
          step="any"
          className="control-select"
          placeholder="Width"
          value={widthValue}
          disabled={!editable || busy}
          onChange={(e) => setWidthValue(e.target.value)}
        />
        <input
          type="number"
          min="0"
          step="any"
          className="control-select"
          placeholder="Height"
          value={heightValue}
          disabled={!editable || busy}
          onChange={(e) => setHeightValue(e.target.value)}
        />
      </div>
      {editable && (
        <button type="button" className="btn-secondary" onClick={handleSaveDimensions} disabled={busy}>
          Save Width &amp; Height
        </button>
      )}

      <div className="field-label">Material zone</div>
      {materialZoneConfirmed ? (
        <div className="control-sublabel" role="status">Main visible face confirmed.</div>
      ) : editable && (
        <button type="button" className="btn-secondary" disabled={busy} onClick={handleConfirmMaterialZone}>
          Confirm Main Visible Face
        </button>
      )}

      <label className="field-label" htmlFor="texture-direction">Texture direction</label>
      <select
        id="texture-direction"
        className="control-select"
        value={session.textureDirection || ''}
        disabled={!editable || busy}
        onChange={(e) => e.target.value && handleTextureDirection(e.target.value)}
      >
        <option value="" disabled>Choose a direction…</option>
        {TEXTURE_DIRECTIONS.map((id) => <option key={id} value={id}>{DIRECTION_LABELS[id] || id}</option>)}
      </select>

      <div className="field-label">Repeat / technical compatibility preview</div>
      {session.studioValidation ? (
        <>
          <div className="control-sublabel" role="status">
            Status: {session.studioValidation.status === 'ready' ? 'Ready' : 'Needs attention'}
          </div>
          {session.studioValidation.issues.length > 0 && (
            <ul className="capture-check-list">
              {session.studioValidation.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}
            </ul>
          )}
          {session.studioValidation.status === 'ready' && (
            <CaptureFlatWallPreview
              widthMm={toMm(widthMeasurement)}
              heightMm={toMm(heightMeasurement)}
              textureDirection={session.textureDirection}
            />
          )}
        </>
      ) : (
        <div className="control-sublabel">Not yet checked.</div>
      )}
      {editable && (
        <button type="button" className="btn-secondary" disabled={busy} onClick={handleRunValidation}>
          Run Technical Compatibility Check
        </button>
      )}

      <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
        Ships the source photo, its real-world scale, and direction only — perspective-corrected cropping
        and normal/roughness/metallic/AO/height derivatives are a later slice.
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
