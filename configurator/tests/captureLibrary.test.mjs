import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildLibraryPublication,
  captureExternalReference,
  toStudioProduct,
  buildPinReference,
  resolvePinnedReference,
  SCANNER_SCHEMA_VERSION,
} from '../api/_lib/capturePublish.js';
import { createCaptureService } from '../api/_lib/captureService.js';
import { capabilitiesForRole } from '../api/_lib/superadminPolicy.js';

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };
const SUPER = { id: 'admin', role: 'superadmin' };

const sessionDto = (overrides = {}) => ({
  id: 'sess-1', ownerId: 'user-a', captureType: 'guided_product', title: 'Standing Seam Panel',
  category: 'roofing', completeness: 100, submittedAt: '2026-07-19T10:00:00Z', ...overrides,
});
const fieldsDto = () => [
  { fieldKey: 'sku', value: 'SS-450' },
  { fieldKey: 'manufacturer', value: 'Schlebach' },
  { fieldKey: 'description', value: 'Concealed-fastener panel' },
  { fieldKey: 'dimensions', value: { unit: 'mm', width: 450, thickness: 0.5 } },
  { fieldKey: 'coverage', value: { exposure: 430 } },
  { fieldKey: 'color', value: { mode: 'manual', name: 'Charcoal', hex: '#333333' } },
];
const assetsDto = () => [
  { id: 'a1', purpose: 'main', classification: 'source', url: 'https://x.blob.vercel-storage.com/main.jpg', checksum: 'c1' },
  { id: 'a2', purpose: 'main', classification: 'derived', sourceAssetId: 'a1', url: 'https://x.blob.vercel-storage.com/thumb.jpg' },
  { id: 'a3', purpose: 'label', classification: 'source', url: 'https://x.blob.vercel-storage.com/label.jpg' },
];

test('publication mapping follows the Capture/Library handoff contract', () => {
  const { record, details } = buildLibraryPublication({
    session: sessionDto(), fields: fieldsDto(), assets: assetsDto(),
  });
  assert.equal(record.recordType, 'product');
  assert.equal(record.scope, 'tenant');
  assert.equal(record.tenantId, 'user-a');
  assert.equal(record.reviewStatus, 'approved');
  assert.equal(record.sourceType, 'capture');
  assert.equal(record.code, 'SS-450');
  assert.equal(record.externalReference, 'capture:sess-1');
  assert.equal(record.thumbnailUrl, 'https://x.blob.vercel-storage.com/thumb.jpg', 'derived thumbnail preferred');
  assert.equal(record.metadata.scanner.schemaVersion, SCANNER_SCHEMA_VERSION);
  assert.equal(record.metadata.scanner.captureSessionId, 'sess-1');
  assert.equal(record.metadata.capture.manufacturer, 'Schlebach');
  assert.equal(record.metadata.capture.assets.length, 3);
  assert.equal(details.unit, 'mm');
  assert.deepEqual(details.applicationMetadata.coverage, { exposure: 430 });
  assert.equal(captureExternalReference('x'), 'capture:x');
});

test('publication refuses a capture without title or category', () => {
  assert.throws(
    () => buildLibraryPublication({ session: sessionDto({ category: null }), fields: [], assets: [] }),
    { code: 'CAPTURE_PUBLISH_INVALID' },
  );
});

function makeStore(session) {
  const state = {
    session: session === undefined
      ? { id: 'sess-1', owner_id: 'user-a', status: 'approved', capture_type: 'guided_product', title: 'Standing Seam Panel', category: 'roofing', completeness: 100 }
      : session,
    record: null,
    insertedRecords: [],
    statusWrites: [],
    publishedWrites: [],
    audits: [],
    productFilters: null,
  };
  return {
    state,
    transaction: async (work) => work(),
    getSession: async () => state.session,
    listFields: async () => fieldsDto().map((f) => ({ field_key: f.fieldKey, value: f.value })),
    listAssets: async () => assetsDto().map((a) => ({ ...a, session_id: 'sess-1', size_bytes: 10 })),
    listComments: async () => [],
    updateSessionStatus: async (id, from, to) => {
      state.statusWrites.push({ from, to });
      state.session = { ...state.session, status: to };
      return state.session;
    },
    findLibraryRecordByReference: async () => state.record,
    insertLibraryPublication: async (change, details) => {
      state.insertedRecords.push({ change, details });
      state.record = { ...change, details };
      return state.record;
    },
    updateSessionPublished: async (id, recordId, version) => {
      state.publishedWrites.push({ id, recordId, version });
      state.session = { ...state.session, status: 'published', published_record_id: recordId, published_version: version };
      return state.session;
    },
    listPublishedLibraryProducts: async (filters) => { state.productFilters = filters; return []; },
    appendAudit: async (event) => { state.audits.push(event); },
  };
}

test('publishing an approved capture creates the record, pins the session, and audits both steps', async () => {
  const store = makeStore();
  const service = createCaptureService({ store, randomUUID: () => 'rec-1' });
  const { session, product, alreadyPublished } = await service.publishSession(OWNER, 'sess-1');
  assert.equal(alreadyPublished, false);
  assert.equal(session.status, 'published');
  assert.equal(session.publishedRecordId, 'rec-1');
  assert.equal(session.publishedVersion, 1);
  assert.equal(product.productId, 'rec-1');
  assert.equal(product.version, 1);
  assert.equal(product.name, 'Standing Seam Panel');
  assert.equal(store.state.insertedRecords.length, 1);
  assert.deepEqual(store.state.statusWrites, [{ from: 'approved', to: 'publishing' }]);
  assert.deepEqual(store.state.audits.map((a) => a.action),
    ['capture.session.publishing', 'capture.session.published']);
  assert.equal(store.state.audits[1].metadata.recordId, 'rec-1');
});

test('a stuck publishing session retries safely and reuses the existing record', async () => {
  const store = makeStore({ id: 'sess-1', owner_id: 'user-a', status: 'publishing', capture_type: 'guided_product', title: 'Panel', category: 'roofing' });
  store.state.record = { id: 'rec-existing', version: 2, name: 'Panel', scope: 'tenant', tenant_id: 'user-a', metadata: {}, details: {} };
  const service = createCaptureService({ store });
  const { session, product } = await service.publishSession(OWNER, 'sess-1');
  assert.equal(store.state.insertedRecords.length, 0, 'no duplicate record on retry');
  assert.equal(session.publishedRecordId, 'rec-existing');
  assert.equal(product.version, 2);
  assert.equal(store.state.audits[0].action, 'capture.session.publish_retried');
});

test('publishing a published capture is an idempotent no-op returning the product', async () => {
  const store = makeStore({ id: 'sess-1', owner_id: 'user-a', status: 'published', capture_type: 'guided_product', title: 'Panel', category: 'roofing' });
  store.state.record = { id: 'rec-1', version: 1, name: 'Panel', scope: 'tenant', tenant_id: 'user-a', metadata: {}, details: {} };
  const { alreadyPublished, product } = await createCaptureService({ store }).publishSession(OWNER, 'sess-1');
  assert.equal(alreadyPublished, true);
  assert.equal(product.productId, 'rec-1');
  assert.equal(store.state.statusWrites.length, 0);
  assert.equal(store.state.audits.length, 0);
});

test('unpublishable states and other tenants are refused', async () => {
  const draft = makeStore({ id: 'sess-1', owner_id: 'user-a', status: 'in_review', capture_type: 'quick', title: 'x', category: 'other' });
  await assert.rejects(
    createCaptureService({ store: draft }).publishSession(OWNER, 'sess-1'),
    { code: 'CAPTURE_TRANSITION_INVALID' },
  );
  await assert.rejects(
    createCaptureService({ store: makeStore() }).publishSession(OTHER, 'sess-1'),
    { code: 'CAPTURE_SESSION_NOT_FOUND' },
  );
});

test('Studio product list is tenant-scoped for owners, platform-wide for superadmin', async () => {
  const ownerStore = makeStore();
  await createCaptureService({ store: ownerStore }).listPublishedProducts(OWNER, {});
  assert.equal(ownerStore.state.productFilters.tenantId, 'user-a');
  assert.equal(ownerStore.state.productFilters.includeAllTenants, false);

  const superStore = makeStore();
  await createCaptureService({ store: superStore }).listPublishedProducts(SUPER, {});
  assert.equal(superStore.state.productFilters.includeAllTenants, true);
});

test('the Studio DTO carries stable identity, version, and material references', () => {
  const product = toStudioProduct({
    id: 'rec-1', version: 3, name: 'Panel', code: 'SS-450', scope: 'tenant', tenant_id: 't1',
    thumbnail_url: 'https://t.jpg', texture_url: null, geometry_url: null,
    lifecycle_status: 'active', source_type: 'capture',
    metadata: { capture: { manufacturer: 'Schlebach', category: 'roofing' } },
  }, { unit: 'mm', application_metadata: { category: 'roofing', dimensions: { unit: 'mm', width: 450 }, color: { hex: '#333333' } } });
  assert.equal(product.productId, 'rec-1');
  assert.equal(product.version, 3);
  assert.equal(product.category, 'roofing');
  assert.equal(product.manufacturer, 'Schlebach');
  assert.deepEqual(product.dimensions, { unit: 'mm', width: 450 });
  assert.equal(product.color.hex, '#333333');
});

test('pinning is explicit: a pin never mutates, upgrades are offered not applied', () => {
  const product = { productId: 'rec-1', version: 1 };
  const pin = buildPinReference(product);
  assert.equal(pin.productId, 'rec-1');
  assert.equal(pin.version, 1);

  const unchanged = resolvePinnedReference(pin, { productId: 'rec-1', version: 1 });
  assert.deepEqual(
    { found: unchanged.found, pinnedMatches: unchanged.pinnedMatches, upgradeAvailable: unchanged.upgradeAvailable },
    { found: true, pinnedMatches: true, upgradeAvailable: false },
  );

  const upgraded = resolvePinnedReference(pin, { productId: 'rec-1', version: 2 });
  assert.equal(upgraded.pinnedMatches, false);
  assert.equal(upgraded.upgradeAvailable, true);
  assert.equal(upgraded.currentVersion, 2);
  assert.equal(pin.version, 1, 'the stored pin itself is never rewritten');

  const missing = resolvePinnedReference(pin, null);
  assert.equal(missing.found, false);
});

test('publish/library routes are wired, capability-mapped, and smoke-guarded', async () => {
  const source = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(source, /'review\.publish': 'capture\.publish\.tenant'/);
  assert.match(source, /'library\.products': 'library\.read'/);

  for (const role of ['owner', 'superadmin']) {
    assert.ok(capabilitiesForRole(role).includes('library.read'), `${role} needs library.read`);
  }
  assert.ok(!capabilitiesForRole('reseller').includes('library.read'));

  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/library/products'));
  assert.ok(sources.includes('/api/capture/review/:id/publish'));

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/library\/products/);
  assert.match(smoke, /auth guard \/api\/capture publish/);
});
