import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCaptureService } from '../api/_lib/captureService.js';

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };

// A mutating call anywhere during a dry-run is a bug — throwing on every
// write-shaped method turns "side-effect-free" into something a test can
// actually enforce, not just assert about the return value.
function makeNoWriteStore(session, { assets = [], fields = [], measurements = [] } = {}) {
  const state = { session, assets, fields, measurements };
  const forbidden = (name) => async () => { throw new Error(`dry-run must never call ${name}`); };
  return {
    state,
    getSession: async () => state.session,
    listFields: async () => state.fields,
    listAssets: async () => state.assets,
    listMeasurements: async () => state.measurements,
    listClaudeAnalyses: async () => [],
    // Every mutating method a real Neon store exposes — all forbidden.
    createSession: forbidden('createSession'),
    updateSessionContent: forbidden('updateSessionContent'),
    updateSessionStatus: forbidden('updateSessionStatus'),
    updateMaterialReadiness: forbidden('updateMaterialReadiness'),
    insertAsset: forbidden('insertAsset'),
    deleteAssetWithDerivatives: forbidden('deleteAssetWithDerivatives'),
    markSuperseded: forbidden('markSuperseded'),
    insertMeasurement: forbidden('insertMeasurement'),
    deleteMeasurement: forbidden('deleteMeasurement'),
    insertClaudeAnalysis: forbidden('insertClaudeAnalysis'),
    upsertField: forbidden('upsertField'),
    appendAudit: forbidden('appendAudit'),
    publishRecord: forbidden('publishRecord'),
  };
}

const readySession = () => ({
  id: 's1', owner_id: 'user-a', status: 'draft', capture_type: 'profile_geometry', title: 'Panel',
  material_zone_state: { zones: [{ zoneId: 'main_visible_face', confirmed: true }] },
  texture_direction: 'along_run',
  studio_validation: { status: 'ready', issues: [] },
});

test('dryRunMaterialPackage never calls a mutating store method, even for a fully valid session', async () => {
  const store = makeNoWriteStore(readySession(), {
    fields: [{ field_key: 'calibration', value: { units: 'mm', rulerConfirmed: true, knownMeasurement: { feature: 'width', value: 450, unit: 'mm' } } }],
    assets: [
      { id: 'a1', session_id: 's1', purpose: 'left_end', classification: 'source', checksum: 'c1' },
      { id: 'a2', session_id: 's1', purpose: 'right_end', classification: 'source', checksum: 'c2' },
      { id: 'a3', session_id: 's1', purpose: 'front', classification: 'source', checksum: 'c3' },
      { id: 'a4', session_id: 's1', purpose: 'iso_front_left', classification: 'source', checksum: 'c4' },
      { id: 'a5', session_id: 's1', purpose: 'back', classification: 'source', checksum: 'c5' },
    ],
    measurements: [{ id: 'm1', feature: 'width', axis: 'width', value: 450, unit: 'mm', confirmed_at: 't', confirmed_by: 'user-a' }],
  });
  const { manifest, validation } = await createCaptureService({ store }).dryRunMaterialPackage(OWNER, 's1');
  assert.equal(manifest.identity.proposedReviewStatus, 'pending_review');
  assert.equal(manifest.identity.scope, 'tenant');
  assert.equal(manifest.identity.tenantId, 'user-a');
  assert.equal(manifest.identity.sourceType, 'capture');
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
});

test('dryRunMaterialPackage returns stable, actionable errors for an incomplete session — still no writes', async () => {
  const store = makeNoWriteStore(readySession(), {});
  const { validation } = await createCaptureService({ store }).dryRunMaterialPackage(OWNER, 's1');
  assert.equal(validation.valid, false);
  const codes = validation.errors.map((e) => e.code);
  assert.ok(codes.includes('CALIBRATION_REQUIRED'));
  assert.ok(codes.includes('SHOT_COVERAGE_INCOMPLETE'));
  assert.ok(codes.includes('MEASUREMENT_REQUIRED'));
});

test('dryRunMaterialPackage respects tenant isolation like every other read', async () => {
  const store = makeNoWriteStore(readySession());
  await assert.rejects(
    createCaptureService({ store }).dryRunMaterialPackage(OTHER, 's1'),
    { code: 'CAPTURE_SESSION_NOT_FOUND' },
  );
});

test('dryRunMaterialPackage does not require a draft/editable status — it is read-only for any visible session', async () => {
  const submitted = makeNoWriteStore({ ...readySession(), status: 'published' });
  const { manifest } = await createCaptureService({ store: submitted }).dryRunMaterialPackage(OWNER, 's1');
  assert.equal(manifest.identity.currentSessionStatus, 'published', 'the real status is reported, not overwritten or hidden');
});

test('materialPackage.dryRun is capability-mapped, rewritten (GET, ahead of the generic /:id rewrite), and smoke-guarded', async () => {
  const route = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(route, /'materialPackage\.dryRun': 'capture\.create'/);
  assert.match(route, /if \(action === 'materialPackage\.dryRun'\)[\s\S]{0,120}req\.method === 'GET'/);

  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions/:id/material-package/dry-run'));
  assert.ok(
    sources.indexOf('/api/capture/sessions/:id/material-package/dry-run') < sources.indexOf('/api/capture/sessions/:id'),
  );

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture material-package dry-run/);
});
