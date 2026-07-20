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
    getAsset: async (id) => state.assets.find((asset) => asset.id === id) || null,
    insertAsset: async (change) => { state.inserted.push(change); return change; },
    deleteAssetWithDerivatives: async (id) => { state.deleted.push(id); },
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
