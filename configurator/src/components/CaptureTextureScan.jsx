import { useEffect, useRef, useState } from 'react';
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

const PHASES = [
  ['photo', 'Photo'],
  ['scale', 'Scale'],
  ['size', 'Size'],
  ['orientation', 'Orientation'],
  ['preview', 'Preview'],
  ['review', 'Review & submit'],
];

// Texture scan: a phased, camera-first flow — one screen, one action at a
// time, matching the Profile Geometry scan's pattern — rather than a single
// form with every field visible at once. Ships albedo (the source photo) +
// scale + direction only; perspective-corrected cropping and normal/
// roughness/metallic/AO/height derivatives are staged for a later slice.
export default function CaptureTextureScan({ detail, onDetailChange, onExit }) {
  const session = detail.session;
  const editable = session.status === 'draft' || session.status === 'changes_requested';

  const [phase, setPhase] = useState('photo');
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
  // Completeness must reflect what Submit is about to save, not the
  // last-persisted session -- the title only exists in local state until
  // Save Draft/Submit, so the server-shaped `detail` alone is stale.
  const completeness = validateCompleteness({ ...detail, session: { ...session, title } });
  const materialZoneConfirmed = session.materialZoneState?.zones?.[0]?.confirmed === true;
  const photoUploading = queueItems.some((item) => item.status !== 'done');

  useEffect(() => {
    if (phase === 'photo' && mainAsset && !photoUploading) setPhase('scale');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainAsset, photoUploading]);

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
      <div className="control-label">
        Texture scan
        <span className="capture-status">{session.status}</span>
      </div>
      <div className="control-sublabel" role="status">
        {PHASES.map(([id, label]) => (phase === id ? `● ${label}` : label)).join(' · ')}
      </div>

      {phase === 'photo' && (
        <>
          <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
            Point your camera at a flat, square-on surface.
          </div>
          {mainAsset ? (
            <img
              src={captureAssetBlobUrl(session.id, mainAsset.id)}
              alt="Flat-surface texture source"
              className="capture-color-sample-photo"
            />
          ) : null}
          {photoUploading && <div className="control-sublabel">Uploading photo…</div>}
          {editable && (
            <button type="button" className="btn-primary" onClick={() => setCameraOpen(true)} disabled={busy}>
              {mainAsset ? 'Retake Photo' : 'Take Photo'}
            </button>
          )}
          {mainAsset && !photoUploading && editable && (
            <div className="export-buttons">
              <button type="button" className="btn-primary" onClick={() => setPhase('scale')}>Continue</button>
            </div>
          )}
        </>
      )}

      {phase === 'scale' && (
        <>
          <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
            Place a ruler beside or touching the surface, then tell us one measurement you know
            (e.g. a plank's width) so we can work out its real-world scale.
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
          <label className="field-label" htmlFor="texture-cal-feature">Which feature?</label>
          <input
            id="texture-cal-feature"
            type="text"
            className="control-select"
            value={calibrationForm.knownFeature}
            disabled={!editable || busy}
            onChange={(e) => setCalibrationForm({ ...calibrationForm, knownFeature: e.target.value })}
          />
          <label className="field-label" htmlFor="texture-cal-value">Its measurement ({calibrationForm.units})</label>
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
              Set: {calibration.knownMeasurement.feature} = {calibration.knownMeasurement.value} {calibration.units}
            </div>
          ) : editable && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || !calibrationForm.rulerConfirmed || !Number(calibrationForm.knownValue)}
              onClick={handleSaveCalibration}
            >
              Save
            </button>
          )}
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('photo')} disabled={busy}>Back</button>
            <button type="button" className="btn-primary" onClick={() => setPhase('size')} disabled={!calibration}>
              Continue
            </button>
          </div>
        </>
      )}

      {phase === 'size' && (
        <>
          <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
            What's the overall width and height of the surface ({calibration?.units || 'mm'})?
          </div>
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
            <button type="button" className="btn-primary" onClick={handleSaveDimensions} disabled={busy}>
              Save
            </button>
          )}
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('scale')} disabled={busy}>Back</button>
            <button type="button" className="btn-primary" onClick={() => setPhase('orientation')}>Continue</button>
          </div>
        </>
      )}

      {phase === 'orientation' && (
        <>
          <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
            Confirm this photo shows the visible, install-facing side.
          </div>
          {materialZoneConfirmed ? (
            <div className="control-sublabel" role="status">Confirmed.</div>
          ) : editable && (
            <button type="button" className="btn-primary" disabled={busy} onClick={handleConfirmMaterialZone}>
              Yes, this is the visible face
            </button>
          )}

          <label className="field-label" htmlFor="texture-direction">Which way does the pattern run?</label>
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

          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('size')} disabled={busy}>Back</button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setPhase('preview')}
              disabled={!materialZoneConfirmed || !session.textureDirection}
            >
              Continue
            </button>
          </div>
        </>
      )}

      {phase === 'preview' && (
        <>
          <div className="control-sublabel" style={{ marginTop: '0.5rem' }}>
            See how this will look once installed — a rough proof, not a finished render.
          </div>
          {session.studioValidation ? (
            <>
              <div className="control-sublabel" role="status">
                {session.studioValidation.status === 'ready' ? 'Preview ready.' : 'Needs attention:'}
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
            <button type="button" className="btn-primary" disabled={busy} onClick={handleRunValidation}>
              Show Preview
            </button>
          )}
          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('orientation')} disabled={busy}>Back</button>
            <button type="button" className="btn-primary" onClick={() => setPhase('review')}>Continue</button>
          </div>
        </>
      )}

      {phase === 'review' && (
        <>
          <label className="field-label" htmlFor="texture-scan-title">Name this texture</label>
          <input
            id="texture-scan-title"
            type="text"
            className="control-select"
            value={title}
            disabled={!editable || busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Driftwood woodgrain texture"
          />

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

          <div className="export-buttons">
            <button type="button" className="btn-secondary" onClick={() => setPhase('preview')} disabled={busy}>Back</button>
            {editable && (
              <>
                <button type="button" className="btn-secondary" onClick={handleSave} disabled={busy}>Save Draft</button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={busy || completeness.errors.length > 0}
                >
                  Submit for review
                </button>
              </>
            )}
          </div>
        </>
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

      <button type="button" className="btn-secondary" onClick={onExit} style={{ marginTop: '0.75rem' }}>
        Back to captures
      </button>
    </div>
  );
}
