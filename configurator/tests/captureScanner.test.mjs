import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeCalibration,
  normalizeMeasurementInput,
  validateCompleteness,
  PROFILE_INITIAL_VIEWS,
  PROFILE_ADAPTIVE_VIEW,
  CAPTURE_TYPES,
  ASSET_PURPOSES,
} from '../api/_lib/capturePolicy.js';
import {
  evaluateProfileEvidence,
  buildProfilePreviewSvg,
  SHOT_GUIDES,
} from '../api/_lib/captureEvidence.js';
import { createCaptureService } from '../api/_lib/captureService.js';

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };

const validCalibration = (overrides = {}) => ({
  units: 'mm',
  knownMeasurement: { value: 450, feature: 'overall width' },
  rulerConfirmed: true,
  ...overrides,
});

const calibrationField = () => ({
  fieldKey: 'calibration',
  value: { schemaVersion: 1, units: 'mm', knownMeasurement: { feature: 'overall width', value: 450, unit: 'mm' }, rulerConfirmed: true },
});
const viewAssets = (views) => views.map((view, index) => ({ id: `a${index}`, purpose: view, classification: 'source' }));
const confirmedMeasurement = (overrides = {}) => ({
  id: 'm1', feature: 'overall width', axis: 'width', value: 450, unit: 'mm',
  method: 'ruler', confirmedAt: '2026-07-20T00:00:00Z', ...overrides,
});

test('scan types and shot views are additive to the existing vocabularies', () => {
  for (const legacy of ['guided_product', 'quick']) assert.ok(CAPTURE_TYPES.includes(legacy));
  assert.ok(CAPTURE_TYPES.includes('profile_geometry'));
  for (const view of [...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW]) {
    assert.ok(ASSET_PURPOSES.includes(view), `${view} must be a valid asset purpose`);
  }
});

test('calibration requires units, a known measurement, and ruler confirmation', () => {
  const calibration = normalizeCalibration(validCalibration());
  assert.equal(calibration.units, 'mm');
  assert.equal(calibration.knownMeasurement.value, 450);
  assert.equal(calibration.rulerConfirmed, true);
  assert.throws(() => normalizeCalibration(validCalibration({ units: 'furlong' })), { code: 'CAPTURE_CALIBRATION_INVALID' });
  assert.throws(() => normalizeCalibration(validCalibration({ knownMeasurement: { value: 0, feature: 'x' } })), { code: 'CAPTURE_CALIBRATION_INVALID' });
  assert.throws(() => normalizeCalibration(validCalibration({ knownMeasurement: { value: 450, feature: ' ' } })), { code: 'CAPTURE_CALIBRATION_INVALID' });
  assert.throws(() => normalizeCalibration(validCalibration({ rulerConfirmed: false })), { code: 'CAPTURE_CALIBRATION_INVALID' });
});

test('measurement input is validated: feature, value, unit, method, axis', () => {
  const measurement = normalizeMeasurementInput({ feature: 'rib height', axis: 'height', value: '25', unit: 'mm', method: 'ruler' });
  assert.equal(measurement.value, 25);
  assert.equal(measurement.method, 'ruler');
  assert.throws(() => normalizeMeasurementInput({ feature: '', value: 5, unit: 'mm' }), { code: 'CAPTURE_MEASUREMENT_INVALID' });
  assert.throws(() => normalizeMeasurementInput({ feature: 'x', value: -1, unit: 'mm' }), { code: 'CAPTURE_MEASUREMENT_INVALID' });
  assert.throws(() => normalizeMeasurementInput({ feature: 'x', value: 5, unit: 'parsec' }), { code: 'CAPTURE_MEASUREMENT_INVALID' });
  assert.throws(() => normalizeMeasurementInput({ feature: 'x', value: 5, unit: 'mm', method: 'guess' }), { code: 'CAPTURE_MEASUREMENT_INVALID' });
  assert.throws(() => normalizeMeasurementInput({ feature: 'x', value: 5, unit: 'mm', axis: 'diagonal' }), { code: 'CAPTURE_MEASUREMENT_INVALID' });
});

test('evidence gates in order: calibration, initial views, adaptive view, complete', () => {
  const uncalibrated = evaluateProfileEvidence({ fields: [], assets: [], measurements: [] });
  assert.equal(uncalibrated.phase, 'calibration');
  assert.equal(uncalibrated.needsCalibration, true);
  assert.equal(uncalibrated.complete, false);

  const noShots = evaluateProfileEvidence({ fields: [calibrationField()], assets: [], measurements: [] });
  assert.equal(noShots.phase, 'initial_views');
  assert.deepEqual(noShots.shotRequests.map((r) => r.view), [...PROFILE_INITIAL_VIEWS]);

  const partial = evaluateProfileEvidence({
    fields: [calibrationField()],
    assets: viewAssets(['left_end', 'front']),
    measurements: [],
  });
  assert.deepEqual(partial.shotRequests.map((r) => r.view), ['right_end', 'iso_front_left']);

  const initialDone = evaluateProfileEvidence({
    fields: [calibrationField()],
    assets: viewAssets([...PROFILE_INITIAL_VIEWS]),
    measurements: [],
  });
  assert.equal(initialDone.phase, 'adaptive');
  assert.equal(initialDone.shotRequests.length, 1);
  assert.equal(initialDone.shotRequests[0].view, PROFILE_ADAPTIVE_VIEW);

  const done = evaluateProfileEvidence({
    fields: [calibrationField()],
    assets: viewAssets([...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW]),
    measurements: [confirmedMeasurement()],
  });
  assert.equal(done.phase, 'complete');
  assert.equal(done.complete, true);
  assert.deepEqual(done.shotRequests, []);
});

test('R2.2: a superseded (replaced) source asset no longer satisfies its view', () => {
  const supersededLeftEnd = { id: 'a0', purpose: 'left_end', classification: 'source', supersededBy: 'a-new' };
  const currentLeftEndReplacement = { id: 'a-new', purpose: 'left_end', classification: 'source' };

  // Only the superseded asset exists — the view still reads as missing.
  const withOnlySuperseded = evaluateProfileEvidence({
    fields: [calibrationField()],
    assets: [supersededLeftEnd, ...viewAssets(['right_end', 'front', 'iso_front_left'])],
    measurements: [],
  });
  assert.ok(withOnlySuperseded.shotRequests.some((r) => r.view === 'left_end'), 'a superseded asset must not count as satisfying the view');

  // The current replacement satisfies it again.
  const withReplacement = evaluateProfileEvidence({
    fields: [calibrationField()],
    assets: [supersededLeftEnd, currentLeftEndReplacement, ...viewAssets(['right_end', 'front', 'iso_front_left'])],
    measurements: [],
  });
  assert.ok(!withReplacement.shotRequests.some((r) => r.view === 'left_end'), 'the current (non-superseded) replacement satisfies the view');
});

test('every shot request carries the full prompt contract', () => {
  for (const guide of Object.values(SHOT_GUIDES)) {
    for (const key of ['view', 'title', 'position', 'angle', 'distance', 'orientation', 'requiredFeature', 'reason']) {
      assert.ok(guide[key], `${guide.view} guide missing ${key}`);
    }
    assert.equal(typeof guide.rulerVisible, 'boolean');
  }
});

test('evidence confidence is deterministic and bounded', () => {
  const done = evaluateProfileEvidence({
    fields: [calibrationField()],
    assets: viewAssets([...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW]),
    measurements: [confirmedMeasurement(), confirmedMeasurement({ id: 'm2', axis: 'height' })],
  });
  assert.equal(done.confidence, 1);
  const empty = evaluateProfileEvidence({ fields: [], assets: [], measurements: [] });
  assert.equal(empty.confidence, 0);
});

test('profile_geometry completeness requires calibration, all views, and a measurement — not category', () => {
  const session = { captureType: 'profile_geometry', title: 'Standing seam 450', category: null };
  const incomplete = validateCompleteness({ session, fields: [], assets: [], measurements: [] });
  const codes = incomplete.errors.map((e) => e.code);
  assert.ok(codes.includes('CALIBRATION_REQUIRED'));
  assert.ok(codes.includes('SHOT_COVERAGE_INCOMPLETE'));
  assert.ok(codes.includes('MEASUREMENT_REQUIRED'));
  assert.ok(!codes.includes('CATEGORY_REQUIRED'), 'flexible classification: no hard category requirement');

  const complete = validateCompleteness({
    session,
    fields: [calibrationField(), { fieldKey: 'description', value: 'Roll-formed panel' }],
    assets: viewAssets([...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW]),
    measurements: [confirmedMeasurement()],
  });
  assert.deepEqual(complete.errors, []);
  assert.equal(complete.score, 100);
});

test('R2.2: completeness treats a superseded source asset as not covering its view', () => {
  const session = { captureType: 'profile_geometry', title: 'Standing seam 450', category: null };
  const assets = viewAssets([...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW]);
  assets[0] = { ...assets[0], supersededBy: 'replacement-id' }; // left_end is now superseded, no replacement present
  const result = validateCompleteness({
    session,
    fields: [calibrationField()],
    assets,
    measurements: [confirmedMeasurement()],
  });
  assert.ok(result.errors.some((e) => e.code === 'SHOT_COVERAGE_INCOMPLETE'));
});

test('the measured preview SVG appears only with width and height and carries real values', () => {
  assert.equal(buildProfilePreviewSvg([confirmedMeasurement()]), null);
  const svg = buildProfilePreviewSvg([
    confirmedMeasurement(),
    confirmedMeasurement({ id: 'm2', feature: 'rib height', axis: 'height', value: 38 }),
  ]);
  assert.match(svg, /^<svg /);
  assert.match(svg, /450 mm/);
  assert.match(svg, /38 mm/);
});

function makeStore(session) {
  const state = {
    session: session === undefined
      ? { id: 's1', owner_id: 'user-a', status: 'draft', capture_type: 'profile_geometry', title: 'Panel' }
      : session,
    fields: [],
    measurements: [],
    audits: [],
  };
  return {
    state,
    transaction: async (work) => work(),
    getSession: async () => state.session,
    listFields: async () => state.fields,
    listAssets: async () => [],
    listComments: async () => [],
    listMeasurements: async () => state.measurements,
    upsertField: async (id, fieldKey, value) => { state.fields.push({ field_key: fieldKey, value }); },
    insertMeasurement: async (change) => { state.measurements.push(change); return { ...change, confirmed_at: 'now' }; },
    getMeasurement: async (id) => state.measurements.find((m) => m.id === id) || null,
    deleteMeasurement: async (id) => { state.measurements = state.measurements.filter((m) => m.id !== id); },
    appendAudit: async (event) => { state.audits.push(event); },
  };
}

test('saving calibration stores the evidence field and the known measurement together', async () => {
  const store = makeStore();
  const service = createCaptureService({ store, randomUUID: () => 'm-cal' });
  const { calibration } = await service.saveCalibration(OWNER, 's1', validCalibration());
  assert.equal(calibration.units, 'mm');
  assert.equal(store.state.fields[0].field_key, 'calibration');
  assert.equal(store.state.measurements.length, 1);
  assert.equal(store.state.measurements[0].method, 'ruler');
  assert.equal(store.state.measurements[0].confirmedBy, 'user-a');
});

test('measurements are owner-scoped, confirmed by their author, and locked with the session', async () => {
  const store = makeStore();
  const service = createCaptureService({ store, randomUUID: () => 'm1' });
  const { measurement } = await service.addMeasurement(OWNER, 's1', {
    feature: 'overall width', axis: 'width', value: 450, unit: 'mm', method: 'ruler',
  });
  assert.equal(measurement.confirmedBy, 'user-a');
  await service.removeMeasurement(OWNER, 's1', 'm1');
  assert.equal(store.state.measurements.length, 0);

  await assert.rejects(service.addMeasurement(OTHER, 's1', { feature: 'x', value: 1, unit: 'mm' }),
    { code: 'CAPTURE_SESSION_NOT_FOUND' });
  await assert.rejects(service.removeMeasurement(OWNER, 's1', 'missing'), { code: 'CAPTURE_MEASUREMENT_NOT_FOUND' });

  const locked = makeStore({ id: 's1', owner_id: 'user-a', status: 'submitted', capture_type: 'profile_geometry' });
  const lockedService = createCaptureService({ store: locked });
  await assert.rejects(lockedService.addMeasurement(OWNER, 's1', { feature: 'x', value: 1, unit: 'mm' }),
    { code: 'CAPTURE_SESSION_LOCKED' });
  await assert.rejects(lockedService.saveCalibration(OWNER, 's1', validCalibration()),
    { code: 'CAPTURE_SESSION_LOCKED' });
});

test('scanner routes are capability-mapped, rewritten, smoke-guarded, and schema-backed', async () => {
  const route = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  for (const action of ['calibration', 'measurements', 'measurement', 'evidence']) {
    assert.match(route, new RegExp(`${action}: 'capture\\.create'`));
  }

  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  for (const path of [
    '/api/capture/sessions/:id/calibration',
    '/api/capture/sessions/:id/measurements',
    '/api/capture/sessions/:id/measurements/:measurementId',
    '/api/capture/sessions/:id/evidence',
  ]) {
    assert.ok(sources.includes(path), `missing rewrite for ${path}`);
    assert.ok(sources.indexOf(path) < sources.indexOf('/api/capture/sessions/:id'),
      `${path} must precede the generic /:id rewrite`);
  }

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture evidence/);

  for (const source of [
    await readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8'),
    await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
  ]) {
    assert.match(source, /create table if not exists capture_measurements/);
    assert.match(source, /'profile_geometry','color_finish'/);
  }
  // The widening must drop-and-re-add the constraints for existing tables.
  const runtime = await readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  assert.match(runtime, /drop constraint if exists capture_sessions_capture_type_check/);
  assert.match(runtime, /drop constraint if exists capture_assets_purpose_check/);

  // The scan UI must bundle the same evidence module the server enforces.
  const scan = await readFile(new URL('../src/components/CaptureProfileScan.jsx', import.meta.url), 'utf8');
  assert.match(scan, /from '\.\.\/\.\.\/api\/_lib\/captureEvidence\.js'/);
});
