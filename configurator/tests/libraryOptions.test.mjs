import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { toTenantLibraryOptions } from '../src/lib/libraryOptions.js';
import { toTenantLibraryOptions as toServerTenantLibraryOptions } from '../api/_lib/libraryService.js';

test('tenant Library options include active global and tenant records but never private Library fields', () => {
  const records = [
    {
      id: 'global-roof', scope: 'global', record_type: 'product', active: true,
      name: 'Global Roof',
      source_credential: 'secret', created_at: 'private-audit', project_id: 'private-project',
    },
    {
      id: 'tenant-service', owner_id: 'tenant-1', type: 'custom-service', active: true,
      name: 'Tenant Service', unit: 'each', unit_price: 225,
      customer_id: 'private-customer', updated_at: 'private-audit',
    },
    { id: 'other-tenant', tenant_id: 'tenant-2', record_type: 'product', active: true, name: 'Private Roof' },
    { id: 'ownerless-private', scope: 'tenant', record_type: 'product', active: true, name: 'Ownerless Private Roof' },
    { id: 'unscoped-private-service', type: 'custom-service', active: true, name: 'Unscoped Private Service' },
    { id: 'inactive', scope: 'global', record_type: 'product', active: false, name: 'Inactive Roof' },
  ];
  const details = {
    materials: [], customServices: [],
    productDetails: {
      'global-roof': {
        unit: 'sq ft', price: 12.5,
        application_metadata: {
          colorIds: ['color-a'], profileLabel: 'Standing seam', trimKind: 'other_trims',
        },
      },
    },
  };

  const result = toTenantLibraryOptions(records, details, 'tenant-1');

  assert.deepEqual(Object.keys(result.products[0]).sort(), [
    'active', 'colorIds', 'id', 'kind', 'label', 'profileLabel', 'source', 'trimKind', 'unit', 'unitPrice',
  ]);
  assert.deepEqual(result.products.map((option) => option.id), ['global-roof']);
  assert.deepEqual(result.services.map((option) => option.id), ['tenant-service']);
  assert.deepEqual(result.products[0], {
    id: 'global-roof', source: 'library', kind: 'product', label: 'Global Roof', unit: 'sq ft',
    unitPrice: 12.5, colorIds: ['color-a'], profileLabel: 'Standing seam', trimKind: 'other_trims', active: true,
  });
});

test('server adapter rejects ownerless or unscoped records while retaining global and matching-tenant catalogs', () => {
  const result = toServerTenantLibraryOptions({
    ownerId: 'tenant-1',
    libraryRecords: [
      {
        id: 'global-product', scope: 'global', record_type: 'product', lifecycle_status: 'active',
        name: 'Global Panel', unit: 'sq ft', price: 17,
      },
      {
        id: 'library-product', scope: 'tenant', tenant_id: 'tenant-1', record_type: 'product',
        lifecycle_status: 'active', name: 'Tenant Panel', metadata: { privateToken: 'nope' },
        unit: 'sq ft', price: 18, application_metadata: { colorIds: ['color-1'], trimKind: 'gutters' },
      },
      {
        id: 'ownerless-library-product', scope: 'tenant', record_type: 'product', lifecycle_status: 'active',
        name: 'Ownerless Private Panel', unit: 'sq ft', price: 99,
      },
    ],
    materials: [
      { id: 'legacy-material', owner_id: 'tenant-1', name: 'Legacy Panel', kind: 'roof', price_per_sqft: 15, color_ids: ['color-2'] },
      { id: 'ownerless-material', name: 'Ownerless Material', kind: 'roof', price_per_sqft: 99 },
    ],
    customServices: [
      { id: 'legacy-service', owner_id: 'tenant-1', name: 'Install', unit: 'each', price: 99 },
      { id: 'unscoped-service', name: 'Unscoped Service', unit: 'each', price: 999 },
    ],
  });

  assert.deepEqual(result.products.map((item) => item.id), ['global-product', 'library-product', 'legacy-material']);
  assert.deepEqual(result.services.map((item) => item.id), ['legacy-service']);
  for (const item of [...result.products, ...result.services]) {
    assert.deepEqual(Object.keys(item).sort(), [
      'active', 'colorIds', 'id', 'kind', 'label', 'profileLabel', 'source', 'trimKind', 'unit', 'unitPrice',
    ]);
  }
});

test('Library option pricing preserves nullish values and accepts only finite numbers', () => {
  const cases = [
    ['null-price', null, null],
    ['undefined-price', undefined, null],
    ['zero-price', 0, 0],
    ['number-price', 19.5, 19.5],
    ['string-price', '20.25', 20.25],
    ['invalid-price', 'not-a-price', null],
  ];
  const browserRecords = cases.map(([id]) => ({
    id, scope: 'global', record_type: 'product', active: true, name: id,
  }));
  const productDetails = Object.fromEntries(cases.map(([id, price]) => [id, { unit: 'sq ft', price }]));
  const serverRecords = cases.map(([id, price]) => ({
    id, scope: 'global', record_type: 'product', lifecycle_status: 'active', name: id,
    unit: 'sq ft', price,
  }));

  const browser = toTenantLibraryOptions(browserRecords, { productDetails }, 'tenant-1');
  const server = toServerTenantLibraryOptions({ ownerId: 'tenant-1', libraryRecords: serverRecords });
  const expected = cases.map(([, , price]) => price);

  assert.deepEqual(browser.products.map((item) => item.unitPrice), expected);
  assert.deepEqual(server.products.map((item) => item.unitPrice), expected);
});

test('App hydrates Library options only for authenticated workspaces and keeps them out of public showroom view models', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(source, /const \[libraryOptions, setLibraryOptions\] = useState\(\{ products: \[\], services: \[\] \}\)/);
  assert.match(source, /if \(!currentUser \|\| initialPublicEntryRef\.current\.kind\) return;/);
  assert.match(source, /fetchJson\('\/api\/custom-services\?action=library-options'\)\.then\(setLibraryOptions\)/);
  assert.match(source, /<SettingsPanel[^>]*libraryOptions=\{libraryOptions\}/s);
  assert.match(source, /<TrimsPanel[\s\S]*?libraryOptions=\{libraryOptions\.products\}/);
  assert.match(source, /<ExtrasServicesPanel[\s\S]*?libraryOptions=\{libraryOptions\.services\}/);
  assert.match(source, /presentationEditable \? \{ presentationControls: showroomViewModel\.presentationControls \} : \{\}/);
  assert.doesNotMatch(source, /authenticatedPresentation \? \{ libraryOptions \} : \{\}/);
  assert.match(source, /presentationControls: presentationEditable \? \{/);
});

function responseRecorder() {
  return {
    statusCode: null, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

test('library-options requires the active owner and returns only the safe option DTO', async () => {
  process.env.PROJECTS_DATABASE_URL ||= 'postgres://test:test@localhost/test';
  const { createCustomServicesHandler } = await import('../api/custom-services/index.js');
  let mutationAttempted = false;
  const handler = createCustomServicesHandler({
    requireAuthenticatedUserId: async () => 'tenant-1',
    ensureDatabaseSchema: async () => {},
    listTenantLibraryOptions: async (ownerId) => {
      assert.equal(ownerId, 'tenant-1');
      return {
        products: [{
          id: 'product-1', source: 'library', kind: 'product', label: 'Panel', unit: 'sq ft',
          unitPrice: 12, colorIds: [], profileLabel: null, trimKind: 'fascia', active: true,
        }],
        services: [],
      };
    },
    database: async () => { mutationAttempted = true; return []; },
  });
  const response = responseRecorder();

  await handler({ method: 'GET', query: { action: 'library-options' }, headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(mutationAttempted, false);
  assert.deepEqual(response.body, {
    products: [{
      id: 'product-1', source: 'library', kind: 'product', label: 'Panel', unit: 'sq ft',
      unitPrice: 12, colorIds: [], profileLabel: null, trimKind: 'fascia', active: true,
    }],
    services: [],
  });
});

test('library-options rejects non-GET requests before any catalog mutation', async () => {
  process.env.PROJECTS_DATABASE_URL ||= 'postgres://test:test@localhost/test';
  const { createCustomServicesHandler } = await import('../api/custom-services/index.js');
  let listed = false;
  const handler = createCustomServicesHandler({
    requireAuthenticatedUserId: async () => 'tenant-1',
    ensureDatabaseSchema: async () => {},
    listTenantLibraryOptions: async () => { listed = true; return {}; },
  });
  const response = responseRecorder();

  await handler({ method: 'POST', query: { action: 'library-options' }, headers: {} }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(listed, false);
  assert.equal(response.headers.Allow, 'GET');
});
