import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCaptureService } from '../api/_lib/captureService.js';
import { evaluateProfileEvidence } from '../api/_lib/captureEvidence.js';

test('claude.guidance is capability-mapped, rewritten, smoke-guarded, and schema-backed', async () => {
  const route = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(route, /'claude\.guidance': 'capture\.create'/);

  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions/:id/claude-guidance'));

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture claude-guidance/);

  for (const source of [
    await readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8'),
    await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
  ]) {
    assert.match(source, /create table if not exists capture_claude_analyses/);
    assert.match(source, /'advisory','disabled','unavailable','configuration_error','no_images_available','timeout','error','invalid'/);
  }
});

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };

function makeStore(session, { assets = [], fields = [] } = {}) {
  const state = {
    session: session === undefined
      ? { id: 's1', owner_id: 'user-a', status: 'draft', capture_type: 'profile_geometry' }
      : session,
    assets,
    fields,
    inserted: [],
  };
  return {
    state,
    getSession: async () => state.session,
    listFields: async () => state.fields,
    listAssets: async () => state.assets,
    listMeasurements: async () => [],
    insertClaudeAnalysis: async (change) => {
      const row = { ...change, session_id: change.sessionId, owner_id: change.ownerId };
      state.inserted.push(row);
      return row;
    },
  };
}

const calibrationField = () => ({
  field_key: 'calibration',
  value: { schemaVersion: 1, units: 'mm', knownMeasurement: { feature: 'overall width', value: 450, unit: 'mm' }, rulerConfirmed: true },
});

const sourceAsset = (overrides = {}) => ({
  id: 'a1', session_id: 's1', owner_id: 'user-a', purpose: 'left_end', classification: 'source',
  url: 'https://abc.public.blob.vercel-storage.com/left.jpg', ...overrides,
});
const thumbAsset = (sourceId, overrides = {}) => ({
  id: `${sourceId}-thumb`, session_id: 's1', owner_id: 'user-a', purpose: 'left_end', classification: 'derived',
  source_asset_id: sourceId, url: `https://abc.public.blob.vercel-storage.com/${sourceId}-thumb.jpg`, mime_type: 'image/jpeg',
  ...overrides,
});

test('cross-tenant and locked sessions are refused before any Claude call is attempted', async () => {
  let calls = 0;
  const requestClaudeGuidance = async () => { calls += 1; return { ok: false, reason: 'disabled' }; };

  await assert.rejects(
    createCaptureService({ store: makeStore(), requestClaudeGuidance }).requestGuidance(OTHER, 's1'),
    { code: 'CAPTURE_SESSION_NOT_FOUND' },
  );
  const locked = makeStore({ id: 's1', owner_id: 'user-a', status: 'in_review', capture_type: 'profile_geometry' });
  await assert.rejects(
    createCaptureService({ store: locked, requestClaudeGuidance }).requestGuidance(OWNER, 's1'),
    { code: 'CAPTURE_SESSION_LOCKED' },
  );
  assert.equal(calls, 0, 'no Claude call for a request that never should have reached it');
});

test('a disabled/unavailable/configuration_error/timeout/error outcome is recorded verbatim, with no findings', async () => {
  for (const reason of ['disabled', 'unavailable', 'configuration_error', 'no_images_available', 'timeout', 'error']) {
    const store = makeStore(undefined, { assets: [sourceAsset()], fields: [calibrationField()] });
    const requestClaudeGuidance = async () => ({ ok: false, reason, error: reason === 'error' ? 'boom' : undefined });
    const { analysis } = await createCaptureService({ store, requestClaudeGuidance, randomUUID: () => 'analysis-1' })
      .requestGuidance(OWNER, 's1');
    assert.equal(analysis.status, reason);
    assert.equal(analysis.findings, null);
    assert.equal(analysis.sourceAssetIds.length, 1);
    assert.equal(store.state.inserted.length, 1, 'every attempt is recorded, even failures');
  }
});

// Required test 6: a missing CAPTURE_CLAUDE_MODEL must never block the
// Capture workflow — the session's normal evidence/completeness/submission
// path is completely untouched by requestGuidance's outcome, success or
// not. requestGuidance itself never throws for this case (matching every
// other non-ok outcome), so the caller (the API route, then the client)
// always gets a normal response to fall back to deterministic guidance with.
test('6. a configuration_error (missing model) does not throw and does not block the capture workflow', async () => {
  const store = makeStore(undefined, { assets: [sourceAsset()], fields: [calibrationField()] });
  const requestClaudeGuidance = async () => ({ ok: false, reason: 'configuration_error', error: 'CAPTURE_CLAUDE_MODEL is not set' });
  const service = createCaptureService({ store, requestClaudeGuidance, randomUUID: () => 'analysis-cfg' });

  const { analysis } = await service.requestGuidance(OWNER, 's1');
  assert.equal(analysis.status, 'configuration_error');
  assert.equal(analysis.findings, null);

  // The session itself is completely unaffected — still draft, still
  // editable — and a second call doesn't throw either (never wedges the
  // session into some error state).
  assert.equal(store.state.session.status, 'draft');
  await assert.doesNotReject(service.requestGuidance(OWNER, 's1'));
  const evidence = evaluateProfileEvidence({
    fields: store.state.fields.map((f) => ({ fieldKey: f.field_key, value: f.value })),
    assets: store.state.assets, measurements: [],
  });
  assert.ok(evidence.phase, 'deterministic evidence evaluation is entirely unaffected by the Claude outcome');
});

test('a valid Claude response is validated, persisted as status "advisory", and returned', async () => {
  const store = makeStore(undefined, {
    assets: [sourceAsset(), thumbAsset('a1')],
    fields: [calibrationField()],
  });
  const requestClaudeGuidance = async (request, { assetThumbnails }) => {
    assert.equal(assetThumbnails.length, 1, 'only assets with a thumbnail are sent');
    assert.equal(assetThumbnails[0].url, 'https://abc.public.blob.vercel-storage.com/a1-thumb.jpg');
    return {
      ok: true,
      model: 'claude-sonnet-5',
      imageCount: 1,
      raw: {
        confidence: 0.6,
        unclearFeatures: [{ feature: 'hem', explanation: 'not visible' }],
        shotRequest: {
          position: 'lower-left', angle: '20 degrees', distance: '30cm', orientation: 'unchanged',
          requiredFeature: 'hem', rulerVisible: true, reason: 'unclear from existing views',
        },
      },
    };
  };
  const { analysis } = await createCaptureService({ store, requestClaudeGuidance, randomUUID: () => 'analysis-2' })
    .requestGuidance(OWNER, 's1');
  assert.equal(analysis.status, 'advisory');
  assert.equal(analysis.model, 'claude-sonnet-5');
  assert.equal(analysis.findings.confidence, 0.6);
  assert.equal(analysis.findings.shotRequest.position, 'lower-left');
  assert.deepEqual(analysis.sourceAssetIds, ['a1']);
});

test('a response that fails policy validation is recorded as "invalid" and never persists the raw output', async () => {
  const store = makeStore(undefined, { assets: [sourceAsset(), thumbAsset('a1')], fields: [calibrationField()] });
  const requestClaudeGuidance = async () => ({
    ok: true,
    model: 'claude-sonnet-5',
    imageCount: 1,
    raw: { confidence: 0.5, measurement: { value: 450 } }, // forbidden field
  });
  const { analysis } = await createCaptureService({ store, requestClaudeGuidance, randomUUID: () => 'analysis-3' })
    .requestGuidance(OWNER, 's1');
  assert.equal(analysis.status, 'invalid');
  assert.equal(analysis.findings, null, 'unvalidated Claude output is never persisted');
  assert.equal(analysis.diagnostic.code, 'CLAUDE_RESPONSE_FORBIDDEN_FIELD');
});

test('a superseded source asset is excluded from the request entirely', async () => {
  const store = makeStore(undefined, {
    assets: [sourceAsset({ superseded_by: 'newer' }), sourceAsset({ id: 'a2' }), thumbAsset('a2')],
    fields: [calibrationField()],
  });
  let seenAssetIds;
  const requestClaudeGuidance = async (request) => {
    seenAssetIds = request.acceptedAssets.map((a) => a.assetId);
    return { ok: false, reason: 'disabled' };
  };
  await createCaptureService({ store, requestClaudeGuidance }).requestGuidance(OWNER, 's1');
  assert.deepEqual(seenAssetIds, ['a2'], 'the superseded asset a1 must not be sent to Claude');
});
