import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDesignRuntime,
  resolveSharedDesignPayload,
} from '../src/lib/designRuntime.js';
import { projectResponseWithRuntime } from '../api/_lib/projectRuntime.js';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('shared runtime carries only a validated company unit system', () => {
  assert.deepEqual(createDesignRuntime('metric'), { unitSystem: 'metric' });
  assert.deepEqual(createDesignRuntime('imperial'), { unitSystem: 'imperial' });
  assert.deepEqual(createDesignRuntime('unexpected'), { unitSystem: 'imperial' });
});

test('shared URL envelopes keep runtime metadata outside canonical design state', () => {
  const design = { version: 2, house: { jobNumber: 'METRIC-6' } };

  assert.deepEqual(resolveSharedDesignPayload({
    design,
    runtime: { unitSystem: 'metric', secretSetting: 'must-not-pass-through' },
  }), {
    design,
    runtime: { unitSystem: 'metric' },
  });
  assert.deepEqual(resolveSharedDesignPayload(design), { design, runtime: null });
});

test('public project responses project only safe unit runtime metadata', () => {
  const row = {
    id: 'project-6',
    owner_id: 'owner-6',
    design: {
      version: 2,
      manualDiscount: 250,
      lockedServices: { roof: true },
      pricingSettings: { gstRate: 0.05 },
      trimAccents: [{
        id: 'gutters', kind: 'gutters', productId: 'five-inch', profile: 'K-style',
        colorId: 'graphite', quantity: 20, canonicalUnit: 'linear_feet', selected: true,
        locked: true, unitPrice: 42, internalNote: 'trim-secret',
      }],
      catalogSnapshot: {
        version: 1,
        materials: [{
          id: 'private-roof', name: 'Private roof', kind: 'roof', pricePerSqft: 42,
          profiles: [], colorIds: [], owner_id: 'material-secret',
        }],
        colors: [{ id: 'graphite', name: 'Graphite', hex: '#555a60', internalNote: 'color-secret' }],
      },
    },
    runtime_unit_system: 'metric',
  };

  const response = projectResponseWithRuntime(row);
  assert.equal(response.id, 'project-6');
  assert.equal(response.design.version, 2);
  assert.equal(response.approved_at, null);
  assert.deepEqual(response.runtime, { unitSystem: 'metric' });
  assert.equal(Object.hasOwn(response, 'owner_id'), false);
  assert.deepEqual(Object.keys(response.runtime), ['unitSystem']);
  assert.equal(Object.hasOwn(response.design, 'manualDiscount'), false);
  assert.equal(Object.hasOwn(response.design, 'lockedServices'), false);
  assert.equal(Object.hasOwn(response.design, 'pricingSettings'), false);
  assert.equal(JSON.stringify(response.design).includes('secret'), false);
  assert.equal(Object.hasOwn(response.design.trimAccents[0], 'locked'), false);
  assert.equal(Object.hasOwn(response.design.trimAccents[0], 'unitPrice'), false);
  assert.equal(Object.hasOwn(response.design.catalogSnapshot.materials[0], 'pricePerSqft'), false);

  const ownerResponse = projectResponseWithRuntime(row, null, { includePrivateDesign: true });
  assert.deepEqual(ownerResponse.design, row.design);
});

test('App resolves project, URL, and standalone runtime units without persisting them', async () => {
  const [app, projectsRoute, designState] = await Promise.all([
    readSource('../src/App.jsx'),
    readSource('../api/projects/index.js'),
    readSource('../src/lib/designState.js'),
  ]);

  assert.match(app, /window\.__IRONWRAP_RUNTIME__/);
  assert.match(app, /loadPublicDesignEntry\(entry,/);
  assert.match(app, /setDesignRuntime\(loaded\.runtime \? createDesignRuntime\(loaded\.runtime\.unitSystem\) : null\)/);
  assert.match(app, /designRuntime\?\.unitSystem \|\| companySettings\?\.unit_system \|\| 'imperial'/);
  assert.match(app, /window\.__IRONWRAP_RUNTIME__ = \$\{runtimeJson\}/);
  assert.match(projectsRoute, /left join settings s on s\.owner_id = p\.owner_id/);
  assert.match(projectsRoute, /s\.unit_system as runtime_unit_system/);
  assert.match(projectsRoute, /projectResponseWithRuntime\(row, quote, \{ includePrivateDesign \}\)/);
  assert.match(app, /resolveShowroomShareTarget\(\{[\s\S]*?standalone: Boolean\(window\.__IRONWRAP_DESIGN__\)/);
  const showroomShareHandler = app.match(/const handleShowroomShare = async \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(showroomShareHandler, 'Showroom share handler should remain explicit');
  assert.doesNotMatch(showroomShareHandler, /window\.location\.href|file:/);
  assert.match(app, /shareUnavailableReason: isCustomerView \? showroomShareTarget\.unavailableReason : undefined/);
  assert.doesNotMatch(designState, /unitSystem|unit_system/);
});

test('standalone share payload embeds only a safe catalog, frozen quote, and application URL', async () => {
  const {
    buildStandaloneSharePayload,
    buildPublicProjectUrl,
    resolveShowroomShareTarget,
  } = await import('../src/lib/publicShare.js');
  const payload = buildStandaloneSharePayload({
    applicationUrl: 'https://app.example.test/configurator/index.html',
    projectId: 'project 7',
    design: {
      version: 2,
      house: { jobNumber: 'SHARE-7', layers: [] },
      roofProductId: 'tenant-roof',
      wallProductId: 'metal-siding',
      manualDiscount: 500,
      lockedServices: { roof: true },
      pricingSettings: { gstRate: 0.05 },
    },
    colors: [{ id: 'color-1', name: 'Graphite', hex: '#555a60', owner_id: 'secret' }],
    materials: [{
      id: 'tenant-roof', name: 'Tenant roof', kind: 'roof', price_per_sqft: 22,
      profiles: ['Narrow', { secret: 'nested-profile' }],
      colorIds: ['color-1', { secret: 'nested-color-id' }], owner_id: 'secret',
    }],
    total: 9876.54,
    runtime: { unitSystem: 'metric', secret: true },
  });

  assert.deepEqual(payload.quote, { total: 9876.54, currency: 'CAD' });
  assert.deepEqual(payload.runtime, { unitSystem: 'metric' });
  assert.equal(payload.applicationUrl, 'https://app.example.test/configurator/index.html');
  assert.equal(Object.hasOwn(payload.design, 'manualDiscount'), false);
  assert.equal(Object.hasOwn(payload.design, 'pricingSettings'), false);
  assert.equal(Object.hasOwn(payload.design, 'lockedServices'), false);
  assert.deepEqual(payload.catalog.materials, [{
    id: 'tenant-roof', name: 'Tenant roof', kind: 'roof', profiles: ['Narrow'], colorIds: ['color-1'],
  }]);
  assert.equal(JSON.stringify(payload.catalog).includes('secret'), false);
  assert.equal(JSON.stringify(payload.catalog).includes('price'), false);
  assert.equal(
    buildPublicProjectUrl(payload.applicationUrl, 'project 7'),
    'https://app.example.test/configurator/index.html?p=project+7',
  );

  assert.deepEqual(resolveShowroomShareTarget({
    applicationUrl: payload.applicationUrl,
    projectId: 'project 7',
    currentUrl: 'file:///downloads/IronWrap_Design_SHARE-7.html',
    standalone: true,
  }), {
    url: 'https://app.example.test/configurator/index.html?p=project+7',
    unavailableReason: null,
  });

  const unsavedStandalone = resolveShowroomShareTarget({
    applicationUrl: payload.applicationUrl,
    projectId: null,
    currentUrl: 'file:///downloads/IronWrap_Design_SHARE-7.html',
    standalone: true,
  });
  assert.equal(unsavedStandalone.url, null);
  assert.match(unsavedStandalone.unavailableReason, /not saved.*cannot be shared/i);
  assert.equal(JSON.stringify(unsavedStandalone).includes('file:'), false);
});
