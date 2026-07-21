import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  toPublicColor,
  toPublicMaterial,
} from '../api/_lib/publicProjectCatalog.js';
import { loadPublicProject } from '../src/lib/publicProjectLoader.js';
import { calculatePublicProjectQuote } from '../api/_lib/publicProjectQuote.js';

test('public project catalogs expose only customer-safe allowlisted fields', () => {
  assert.deepEqual(toPublicColor({
    id: 'color-1', owner_id: 'tenant-secret', name: 'Graphite', code: 'RAL 7024',
    hex: '#555a60', series: 'Wrinkle', thumbnail_url: '/graphite.jpg',
    created_at: 'private-audit-time', folderIds: ['private-folder'],
  }), {
    id: 'color-1', name: 'Graphite', code: 'RAL 7024', hex: '#555a60',
    series: 'Wrinkle', thumbnail: '/graphite.jpg',
  });
  assert.deepEqual(toPublicMaterial({
    id: 'material-1', owner_id: 'tenant-secret', name: 'Standing seam', kind: 'roof',
    price_per_sqft: 19.75, profiles: ['Narrow rib'], color_ids: ['color-1'],
    folder_id: 'private-folder', created_at: 'private-audit-time',
  }), {
    id: 'material-1', name: 'Standing seam', kind: 'roof',
    profiles: ['Narrow rib'], colorIds: ['color-1'],
  });
});

test('public project loading binds the catalog request to the project token and applies catalogs first', async () => {
  const calls = [];
  const fetchJson = async (url) => {
    calls.push(`fetch:${url}`);
    if (url.endsWith('/catalog')) return { colors: [{ id: 'custom-color' }], materials: [] };
    return { id: 'shared-project', design: { version: 2, roofColorId: 'custom-color' } };
  };

  const result = await loadPublicProject('shared-project', {
    fetchJson,
    applyCatalogs: (catalog) => calls.push(`catalog:${catalog.colors[0].id}`),
    applyProject: (project) => calls.push(`project:${project.design.roofColorId}`),
  });

  assert.deepEqual(calls, [
    'fetch:/api/projects/shared-project',
    'fetch:/api/projects/shared-project/catalog',
    'catalog:custom-color',
    'project:custom-color',
  ]);
  assert.equal(result.project.id, 'shared-project');
});

test('legacy public projects keep custom material pricing server-side without exposing unit rates', () => {
  const quote = calculatePublicProjectQuote({
    design: {
      version: 2,
      house: { layers: [{ id: 'roof-layer', visible: true }] },
      measurements: {},
      services: { roof: true },
      trimAccents: [],
      roofProductId: 'tenant-roof',
      wallProductId: 'metal-siding',
      facetOverrides: {},
      customServiceLines: [],
      pricingSettings: { gstRate: 0.05 },
    },
    materialRows: [{ id: 'tenant-roof', name: 'Tenant roof', kind: 'roof', price_per_sqft: 20 }],
    parseLayers: () => [{
      id: 'roof-layer', visible: true,
      parsed: { faces: [{ id: 'r1', type: 'Roof', sizeSf: 100 }] },
    }],
  });

  assert.deepEqual(quote, { total: 2100, currency: 'CAD' });
  assert.equal(Object.hasOwn(toPublicMaterial({
    id: 'tenant-roof', name: 'Tenant roof', kind: 'roof', price_per_sqft: 20,
  }), 'pricePerSqft'), false);
});

const realRoofXml = `<?xml version="1.0"?>
<REPORT>
  <POINT id="P1" data="0,0,0" />
  <POINT id="P2" data="10,0,0" />
  <POINT id="P3" data="10,10,0" />
  <POINT id="P4" data="0,10,0" />
  <LINE id="L1" path="P1,P2" length="10" />
  <LINE id="L2" path="P2,P3" length="10" />
  <LINE id="L3" path="P3,P4" length="10" />
  <LINE id="L4" path="P4,P1" length="10" />
  <FACE id="F1"><POLYGON path="L1,L2,L3,L4" size="100" type="Roof" /></FACE>
</REPORT>`;

const publicProjectDesign = {
  version: 2,
  house: {
    jobNumber: 'PUBLIC-GET-1',
    customerName: 'Shared Customer',
    address: '1 Shared Way',
    layers: [{ id: 'roof-layer', name: 'Roof', visible: true, xml: realRoofXml }],
  },
  measurements: {},
  services: { roof: true },
  lockedServices: { roof: true },
  roofProductId: 'tenant-roof',
  wallProductId: 'metal-siding',
  facetOverrides: {},
  customServiceLines: [],
  manualDiscount: 125,
  pricingSettings: { gstRate: 0, municipalTaxRate: 0, taxLabel: 'GST' },
};

test('public project quote parses real XML on the server without an injected parser', () => {
  const quote = calculatePublicProjectQuote({
    design: publicProjectDesign,
    materialRows: [{ id: 'tenant-roof', name: 'Frozen tenant roof', kind: 'roof', price_per_sqft: 20 }],
  });

  assert.deepEqual(quote, { total: 1875, currency: 'CAD' });
});

test('saved custom material snapshot wins after its library row changes or disappears', () => {
  const design = {
    ...publicProjectDesign,
    manualDiscount: 0,
    catalogSnapshot: {
      version: 1,
      materials: [{
        id: 'tenant-roof', name: 'Frozen tenant roof', kind: 'roof', pricePerSqft: 20,
        profiles: ['Original'], colorIds: ['original-color'],
      }],
      colors: [],
    },
  };
  const changedRowQuote = calculatePublicProjectQuote({
    design,
    materialRows: [{ id: 'tenant-roof', name: 'Changed roof', kind: 'roof', price_per_sqft: 99 }],
  });
  const deletedRowQuote = calculatePublicProjectQuote({ design, materialRows: [] });

  assert.deepEqual(changedRowQuote, { total: 2000, currency: 'CAD' });
  assert.deepEqual(deletedRowQuote, changedRowQuote);
});

test('actual public project GET handler uses the production parser and returns a safe design', async () => {
  process.env.PROJECTS_DATABASE_URL ||= 'postgresql://test:test@localhost/test';
  const projectsApi = await import('../api/projects/index.js');
  assert.equal(typeof projectsApi.createProjectsHandler, 'function');
  const queries = [];
  const database = async (strings) => {
    const query = strings.join(' ');
    queries.push(query);
    if (/select p\.id, p\.owner_id/.test(query)) {
      return [{ id: 'shared-project', owner_id: 'tenant-secret', owner_status: 'active', design: publicProjectDesign }];
    }
    if (/select p\.\*, s\.unit_system/.test(query)) {
      return [{
        id: 'shared-project', owner_id: 'tenant-secret', approved_at: null,
        runtime_unit_system: 'metric', design: publicProjectDesign,
      }];
    }
    if (/select m\.id, m\.name, m\.kind, m\.price_per_sqft/.test(query)) {
      return [{ id: 'tenant-roof', name: 'Frozen tenant roof', kind: 'roof', price_per_sqft: 20 }];
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  const handler = projectsApi.createProjectsHandler({
    database,
    ensureDatabaseSchema: async () => {},
    getRequester: async () => ({ user: null }),
  });
  const response = {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };

  await handler({ method: 'GET', query: { id: 'shared-project' }, headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.quote.total, 1875);
  assert.equal(response.body.runtime.unitSystem, 'metric');
  assert.equal(response.body.design.house.jobNumber, 'PUBLIC-GET-1');
  for (const privateField of ['pricingSettings', 'manualDiscount', 'lockedServices']) {
    assert.equal(Object.hasOwn(response.body.design, privateField), false);
  }
  assert.ok(queries.some((query) => /price_per_sqft/.test(query)));
});

test('authenticated ownerless project open preserves the full design through claim and public reads stay sanitized', async () => {
  process.env.PROJECTS_DATABASE_URL ||= 'postgresql://test:test@localhost/test';
  const { createProjectsHandler } = await import('../api/projects/index.js');
  const privateDesign = {
    ...publicProjectDesign,
    lockedServices: { roof: true },
    manualDiscount: 275,
    customServiceLines: [{ id: 'private-service', name: 'Private work', price: 800, qty: 1 }],
    pricingSettings: { gstRate: 0.05, internalMargin: 0.35 },
  };
  const persisted = { ownerId: null, design: privateDesign };
  const database = async (strings, ...values) => {
    const query = strings.join(' ');
    if (/select p\.id, p\.owner_id/.test(query)) {
      return [{
        id: 'legacy-ownerless',
        owner_id: persisted.ownerId,
        owner_status: persisted.ownerId ? 'active' : null,
        design: persisted.design,
      }];
    }
    if (/select p\.\*, s\.unit_system/.test(query)) {
      return [{
        id: 'legacy-ownerless', owner_id: persisted.ownerId, approved_at: null,
        runtime_unit_system: 'imperial', design: persisted.design,
      }];
    }
    if (/select owner_id from projects/.test(query)) return [{ owner_id: persisted.ownerId }];
    if (/update projects/.test(query)) {
      persisted.design = JSON.parse(values[3]);
      persisted.ownerId = values[4];
      return [{ id: 'legacy-ownerless' }];
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  const handler = createProjectsHandler({
    database,
    ensureDatabaseSchema: async () => {},
    getRequester: async (req) => ({ user: req.requesterId ? { id: req.requesterId } : null }),
    requireAuthenticatedUserId: async () => 'claiming-user',
    buildQuote: async () => ({ total: 999, currency: 'CAD' }),
  });
  const makeResponse = () => ({
    statusCode: null,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  });

  const assertSanitized = (response) => {
    assert.deepEqual(response.body.quote, { total: 999, currency: 'CAD' });
    for (const privateField of ['lockedServices', 'manualDiscount', 'customServiceLines', 'pricingSettings']) {
      assert.equal(Object.hasOwn(response.body.design, privateField), false);
    }
  };

  const ownerlessPublicRead = makeResponse();
  await handler({
    method: 'GET', query: { id: 'legacy-ownerless' }, headers: {}, requesterId: null,
  }, ownerlessPublicRead);
  assert.equal(ownerlessPublicRead.statusCode, 200);
  assertSanitized(ownerlessPublicRead);

  const opened = makeResponse();
  await handler({
    method: 'GET', query: { id: 'legacy-ownerless' }, headers: {}, requesterId: 'claiming-user',
  }, opened);
  assert.equal(opened.statusCode, 200);
  assert.deepEqual(opened.body.design, privateDesign);
  assert.equal(Object.hasOwn(opened.body, 'quote'), false);

  const claimed = makeResponse();
  await handler({
    method: 'PUT',
    query: { id: 'legacy-ownerless' },
    headers: {},
    body: {
      jobNumber: opened.body.design.house.jobNumber,
      customerName: opened.body.design.house.customerName,
      address: opened.body.design.house.address,
      design: opened.body.design,
    },
  }, claimed);
  assert.equal(claimed.statusCode, 200);
  assert.equal(persisted.ownerId, 'claiming-user');
  assert.deepEqual(persisted.design, privateDesign);

  const publicRead = makeResponse();
  await handler({
    method: 'GET', query: { id: 'legacy-ownerless' }, headers: {}, requesterId: 'different-user',
  }, publicRead);
  assert.equal(publicRead.statusCode, 200);
  assertSanitized(publicRead);
});

test('anonymous catalog access is project-bound and no longer accepts tenant ids', async () => {
  const [app, projects, colors, materials, vercel] = await Promise.all([
    readFile(new URL('../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../api/projects/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/colors/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/materials/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  ]);

  assert.match(projects, /sub === 'catalog'/);
  assert.match(projects, /buildPublicProjectCatalog/);
  assert.match(vercel, /\/api\/projects\/:id\/catalog/);
  assert.doesNotMatch(app, /ownerId=/);
  assert.doesNotMatch(colors, /req\.query\.ownerId|requirePublicTenant/);
  assert.doesNotMatch(materials, /req\.query\.ownerId|requirePublicTenant/);
});
