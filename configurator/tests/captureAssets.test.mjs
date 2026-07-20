import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAssetInput, CAPTURE_IMAGE_TYPES, MAX_CAPTURE_IMAGE_BYTES } from '../api/_lib/capturePolicy.js';
import { createCaptureService } from '../api/_lib/captureService.js';

const BLOB_URL = 'https://abc123.public.blob.vercel-storage.com/capture-x7.jpg';
const validInput = (overrides = {}) => ({
  purpose: 'main',
  url: BLOB_URL,
  mimeType: 'image/jpeg',
  sizeBytes: 12345,
  checksum: 'deadbeef',
  width: 1200,
  height: 900,
  ...overrides,
});

test('asset input is validated: purpose, URL host, type, size, dimensions', () => {
  const asset = normalizeAssetInput(validInput());
  assert.equal(asset.classification, 'source');
  assert.equal(asset.url, BLOB_URL);

  assert.throws(() => normalizeAssetInput(validInput({ purpose: 'selfie' })), { code: 'CAPTURE_ASSET_PURPOSE_INVALID' });
  assert.throws(() => normalizeAssetInput(validInput({ url: 'https://evil.example/image.jpg' })), { code: 'CAPTURE_ASSET_URL_INVALID' });
  assert.throws(() => normalizeAssetInput(validInput({ url: 'http://abc.public.blob.vercel-storage.com/x.jpg' })), { code: 'CAPTURE_ASSET_URL_INVALID' });
  assert.throws(() => normalizeAssetInput(validInput({ mimeType: 'application/pdf' })), { code: 'CAPTURE_ASSET_TYPE_INVALID' });
  assert.throws(() => normalizeAssetInput(validInput({ sizeBytes: 0 })), { code: 'CAPTURE_ASSET_SIZE_INVALID' });
  assert.throws(() => normalizeAssetInput(validInput({ sizeBytes: MAX_CAPTURE_IMAGE_BYTES + 1 })), { code: 'CAPTURE_ASSET_SIZE_INVALID' });
  assert.throws(() => normalizeAssetInput(validInput({ width: -5 })), { code: 'CAPTURE_ASSET_DIMENSION_INVALID' });
});

test('derived assets must reference a source; sources must not', () => {
  assert.throws(() => normalizeAssetInput(validInput({ classification: 'derived' })), { code: 'CAPTURE_ASSET_SOURCE_REQUIRED' });
  assert.throws(() => normalizeAssetInput(validInput({ sourceAssetId: 'a1' })), { code: 'CAPTURE_ASSET_SOURCE_INVALID' });
  const derived = normalizeAssetInput(validInput({ classification: 'derived', sourceAssetId: 'a1' }));
  assert.equal(derived.sourceAssetId, 'a1');
});

function makeStore(session) {
  const state = {
    session: session === undefined
      ? { id: 's1', owner_id: 'user-a', status: 'draft', capture_type: 'guided_product' }
      : session,
    assets: [],
    inserted: [],
    deleted: [],
  };
  return {
    state,
    transaction: async (work) => work(),
    getSession: async () => state.session,
    listFields: async () => [],
    listAssets: async () => state.assets,
    listComments: async () => [],
    listMeasurements: async () => [],
    listClaudeAnalyses: async () => [],
    getAsset: async (id) => state.assets.find((asset) => asset.id === id) || null,
    insertAsset: async (change) => {
      const row = { ...change, session_id: change.sessionId, owner_id: change.ownerId };
      state.inserted.push(change);
      state.assets.push(row);
      return row;
    },
    deleteAssetWithDerivatives: async (id) => { state.deleted.push(id); },
    markSuperseded: async (assetId, supersededByAssetId) => {
      const asset = state.assets.find((a) => a.id === assetId);
      if (asset) asset.superseded_by = supersededByAssetId;
    },
    appendAudit: async () => {},
  };
}

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };

test('finalize records the asset for the session owner', async () => {
  const store = makeStore();
  const service = createCaptureService({ store, randomUUID: () => 'asset-1' });
  const { asset } = await service.addAsset(OWNER, 's1', validInput());
  assert.equal(asset.id, 'asset-1');
  assert.equal(store.state.inserted[0].ownerId, 'user-a');
  assert.equal(store.state.inserted[0].purpose, 'main');
});

test('cross-tenant finalize and locked sessions are refused', async () => {
  await assert.rejects(
    createCaptureService({ store: makeStore() }).addAsset(OTHER, 's1', validInput()),
    { code: 'CAPTURE_SESSION_NOT_FOUND' },
  );
  const locked = makeStore({ id: 's1', owner_id: 'user-a', status: 'submitted', capture_type: 'quick' });
  await assert.rejects(
    createCaptureService({ store: locked }).addAsset(OWNER, 's1', validInput()),
    { code: 'CAPTURE_SESSION_LOCKED' },
  );
  assert.equal(locked.state.inserted.length, 0);
});

test('a derived asset must point at a source in the same session', async () => {
  const store = makeStore();
  store.state.assets = [{ id: 'foreign', session_id: 'other-session', purpose: 'main', classification: 'source' }];
  const service = createCaptureService({ store });
  await assert.rejects(
    service.addAsset(OWNER, 's1', validInput({ classification: 'derived', sourceAssetId: 'foreign' })),
    { code: 'CAPTURE_ASSET_SOURCE_INVALID' },
  );
  await assert.rejects(
    service.addAsset(OWNER, 's1', validInput({ classification: 'derived', sourceAssetId: 'missing' })),
    { code: 'CAPTURE_ASSET_SOURCE_INVALID' },
  );
});

test('removing a source asset takes its derivatives with it; locked sessions refuse', async () => {
  const store = makeStore();
  store.state.assets = [{ id: 'a1', session_id: 's1', purpose: 'main', classification: 'source' }];
  const service = createCaptureService({ store });
  await service.removeAsset(OWNER, 's1', 'a1');
  assert.deepEqual(store.state.deleted, ['a1']);
  await assert.rejects(service.removeAsset(OWNER, 's1', 'missing'), { code: 'CAPTURE_ASSET_NOT_FOUND' });

  const locked = makeStore({ id: 's1', owner_id: 'user-a', status: 'in_review', capture_type: 'quick' });
  locked.state.assets = [{ id: 'a1', session_id: 's1', purpose: 'main', classification: 'source' }];
  await assert.rejects(
    createCaptureService({ store: locked }).removeAsset(OWNER, 's1', 'a1'),
    { code: 'CAPTURE_SESSION_LOCKED' },
  );
});

test('R2.2: requested-pose lineage is normalized and bounded onto capture_metadata', () => {
  const pose = {
    position: 'Stand at the left end', angle: 'Camera level', distance: '30-50 cm',
    orientation: 'Sample on the board', requiredFeature: 'Full cross-section', rulerVisible: true,
    reason: 'Defines the cross-section geometry',
  };
  const asset = normalizeAssetInput(validInput({ requestedPose: pose }));
  assert.deepEqual(asset.captureMetadata.requestedPose, pose);

  // Bounded: absurdly long text is truncated, not rejected outright.
  const longPose = normalizeAssetInput(validInput({ requestedPose: { position: 'x'.repeat(5000) } }));
  assert.ok(longPose.captureMetadata.requestedPose.position.length <= 300);

  // Empty/garbage pose input is simply omitted, not stored as noise.
  const noPose = normalizeAssetInput(validInput());
  assert.equal('requestedPose' in noPose.captureMetadata, false);
  const emptyPose = normalizeAssetInput(validInput({ requestedPose: {} }));
  assert.equal('requestedPose' in emptyPose.captureMetadata, false);

  // Existing captureMetadata keys survive alongside the pose.
  const withOtherMetadata = normalizeAssetInput(validInput({
    requestedPose: pose,
    captureMetadata: { originalFileName: 'left.jpg', capturedAt: '2026-07-20T00:00:00Z' },
  }));
  assert.equal(withOtherMetadata.captureMetadata.originalFileName, 'left.jpg');
  assert.deepEqual(withOtherMetadata.captureMetadata.requestedPose, pose);
});

test('R2.2: a finalize retry with the same checksum returns the existing source asset, not a duplicate row', async () => {
  const store = makeStore();
  const service = createCaptureService({ store, randomUUID: () => 'asset-1' });
  const first = await service.addAsset(OWNER, 's1', validInput({ checksum: 'same-checksum' }));
  assert.equal(first.duplicate, false);
  assert.equal(store.state.inserted.length, 1);

  const retryService = createCaptureService({ store, randomUUID: () => 'asset-2' });
  const second = await retryService.addAsset(OWNER, 's1', validInput({ checksum: 'same-checksum' }));
  assert.equal(second.duplicate, true);
  assert.equal(second.asset.id, first.asset.id, 'the retry resolves to the SAME asset');
  assert.equal(store.state.inserted.length, 1, 'no second row was inserted');
});

test('R2.2: a different checksum for the same purpose is not treated as a duplicate', async () => {
  const store = makeStore();
  const service = createCaptureService({ store, randomUUID: () => 'asset-1' });
  await service.addAsset(OWNER, 's1', validInput({ checksum: 'checksum-a' }));
  const second = await createCaptureService({ store, randomUUID: () => 'asset-2' })
    .addAsset(OWNER, 's1', validInput({ checksum: 'checksum-b' }));
  assert.equal(second.duplicate, false);
  assert.equal(store.state.inserted.length, 2);
});

test('R2.2: replaceAsset preserves the prior accepted image and links lineage, never deleting it', async () => {
  const store = makeStore();
  store.state.assets = [{
    id: 'a1', session_id: 's1', owner_id: 'user-a', purpose: 'left_end', classification: 'source',
    url: BLOB_URL, checksum: 'old-checksum', capture_metadata: { originalFileName: 'first.jpg' }, created_at: 't0',
  }];
  const service = createCaptureService({ store, randomUUID: () => 'asset-2' });
  const { asset, supersededAssetId } = await service.replaceAsset(OWNER, 's1', 'a1', validInput({ checksum: 'new-checksum' }));

  assert.equal(supersededAssetId, 'a1');
  assert.equal(asset.id, 'asset-2');
  assert.equal(asset.purpose, 'left_end', 'the replacement is forced onto the same view as the original');
  assert.equal(asset.captureMetadata.supersedesAssetId, 'a1');
  assert.equal(store.state.deleted.length, 0, 'the prior asset is never deleted');

  const priorRow = store.state.assets.find((a) => a.id === 'a1');
  assert.equal(priorRow.superseded_by, 'asset-2', 'the ONLY change to the prior row is the lineage pointer');
  assert.equal(priorRow.checksum, 'old-checksum', 'the prior checksum is untouched');
  assert.equal(priorRow.url, BLOB_URL, 'the prior url is untouched');
  assert.deepEqual(priorRow.capture_metadata, { originalFileName: 'first.jpg' }, 'the prior metadata is untouched');
});

test('R2.2: replaceAsset rejects a derived asset, an already-superseded asset, and a locked session', async () => {
  const store = makeStore();
  store.state.assets = [
    { id: 'a1', session_id: 's1', owner_id: 'user-a', purpose: 'front', classification: 'source', url: BLOB_URL, checksum: 'c1' },
    { id: 'd1', session_id: 's1', owner_id: 'user-a', purpose: 'front', classification: 'derived', source_asset_id: 'a1', url: BLOB_URL },
    { id: 'a2', session_id: 's1', owner_id: 'user-a', purpose: 'back', classification: 'source', url: BLOB_URL, checksum: 'c2', superseded_by: 'already-replaced' },
  ];
  const service = createCaptureService({ store });
  await assert.rejects(service.replaceAsset(OWNER, 's1', 'd1', validInput()), { code: 'CAPTURE_ASSET_NOT_REPLACEABLE' });
  await assert.rejects(service.replaceAsset(OWNER, 's1', 'a2', validInput()), { code: 'CAPTURE_ASSET_ALREADY_SUPERSEDED' });
  await assert.rejects(service.replaceAsset(OWNER, 's1', 'missing', validInput()), { code: 'CAPTURE_ASSET_NOT_FOUND' });

  const locked = makeStore({ id: 's1', owner_id: 'user-a', status: 'in_review', capture_type: 'profile_geometry' });
  locked.state.assets = [{ id: 'a1', session_id: 's1', owner_id: 'user-a', purpose: 'front', classification: 'source', url: BLOB_URL, checksum: 'c1' }];
  await assert.rejects(
    createCaptureService({ store: locked }).replaceAsset(OWNER, 's1', 'a1', validInput()),
    { code: 'CAPTURE_SESSION_LOCKED' },
  );
});

test('session detail includes assets alongside fields', async () => {
  const store = makeStore();
  store.state.assets = [{ id: 'a1', session_id: 's1', purpose: 'main', classification: 'source', url: BLOB_URL, size_bytes: 5 }];
  const detail = await createCaptureService({ store }).getSession(OWNER, 's1');
  assert.equal(detail.assets.length, 1);
  assert.equal(detail.assets[0].purpose, 'main');
});

test('upload token route shares the capture constraints and validates the session first', async () => {
  const source = await readFile(new URL('../api/upload.js', import.meta.url), 'utf8');
  assert.match(source, /CAPTURE_IMAGE_TYPES, MAX_CAPTURE_IMAGE_BYTES, EDITABLE_STATUSES/);
  assert.match(source, /capture: \{\s*allowedContentTypes: \[\.\.\.CAPTURE_IMAGE_TYPES\],\s*maximumSizeInBytes: MAX_CAPTURE_IMAGE_BYTES,/);
  const guard = source.indexOf('assertCaptureUploadAllowed(userId, sessionId)');
  const tokenReturn = source.indexOf('addRandomSuffix: true');
  assert.ok(guard > -1 && guard < tokenReturn, 'capture session must be validated before the token is issued');
  assert.equal(CAPTURE_IMAGE_TYPES.includes('image/jpeg'), true);
});

test('asset routes are rewritten onto the consolidated function and smoke-guarded', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions/:id/assets'));
  assert.ok(sources.includes('/api/capture/sessions/:id/assets/:assetId'));
  // The more specific asset rewrites must precede the generic /:id rule.
  assert.ok(sources.indexOf('/api/capture/sessions/:id/assets') < sources.indexOf('/api/capture/sessions/:id'));
  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture asset finalize/);
});

test('D-051: getAssetBlob streams a private asset for its owner, refuses cross-tenant/missing/foreign-session access', async () => {
  const store = makeStore();
  store.state.assets = [{ id: 'a1', session_id: 's1', owner_id: 'user-a', purpose: 'main', classification: 'source', url: BLOB_URL }];
  const fakeStream = { locked: false };
  let seenUrl;
  const getPrivateBlob = async (url) => {
    seenUrl = url;
    return { stream: fakeStream, blob: { contentType: 'image/jpeg' } };
  };
  const service = createCaptureService({ store, getPrivateBlob });

  const result = await service.getAssetBlob(OWNER, 's1', 'a1');
  assert.equal(result.stream, fakeStream);
  assert.equal(result.contentType, 'image/jpeg');
  assert.equal(seenUrl, BLOB_URL, 'the exact stored asset URL is passed through to the private-blob read');

  await assert.rejects(service.getAssetBlob(OTHER, 's1', 'a1'), { code: 'CAPTURE_SESSION_NOT_FOUND' });
  await assert.rejects(service.getAssetBlob(OWNER, 's1', 'missing'), { code: 'CAPTURE_ASSET_NOT_FOUND' });

  // An asset id that exists but belongs to a DIFFERENT session must not be
  // servable through this session's URL, even for the same owner.
  store.state.assets.push({ id: 'a2', session_id: 'other-session', owner_id: 'user-a', purpose: 'main', classification: 'source', url: BLOB_URL });
  await assert.rejects(service.getAssetBlob(OWNER, 's1', 'a2'), { code: 'CAPTURE_ASSET_NOT_FOUND' });

  // A blob the store token can't find (e.g. deleted at the provider) is a
  // clean 404, not a crash.
  const missingBlobService = createCaptureService({ store, getPrivateBlob: async () => null });
  await assert.rejects(missingBlobService.getAssetBlob(OWNER, 's1', 'a1'), { code: 'CAPTURE_ASSET_NOT_FOUND' });
});

test('D-051: the asset.blob route is capability-mapped, rewritten ahead of the generic asset rewrite, and smoke-guarded', async () => {
  const route = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(route, /'asset\.blob': 'capture\.create'/);
  assert.match(route, /getAssetBlob/);

  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions/:id/assets/:assetId/blob'));
  assert.ok(
    sources.indexOf('/api/capture/sessions/:id/assets/:assetId/blob')
      < sources.indexOf('/api/capture/sessions/:id/assets/:assetId'),
    'the /blob rewrite must precede the generic /:assetId rewrite',
  );

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture asset blob/);
});

test('D-051: capture uploads request private access — the connected Blob store has no public-access mode', async () => {
  const source = await readFile(new URL('../src/lib/captureUpload.js', import.meta.url), 'utf8');
  assert.match(source, /access:\s*'private'/);
  assert.doesNotMatch(source, /access:\s*'public'/);
});

test('R2.2: asset.replace is capability-mapped, precedes the generic asset rewrite, and is smoke-guarded', async () => {
  const route = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(route, /'asset\.replace': 'capture\.create'/);

  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions/:id/assets/:assetId/replace'));
  assert.ok(
    sources.indexOf('/api/capture/sessions/:id/assets/:assetId/replace')
      < sources.indexOf('/api/capture/sessions/:id/assets/:assetId'),
    'the /replace rewrite must precede the generic /:assetId rewrite',
  );

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture asset replace/);
});
