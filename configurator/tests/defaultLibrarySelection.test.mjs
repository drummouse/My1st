import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildNewProjectDesignSnapshot } from '../src/lib/newProjectDesignState.js';
import { calculateEstimate } from '../src/lib/pricingEngine.js';

process.env.PROJECTS_DATABASE_URL ||= 'postgres://test:test@localhost/test';
const { validateDefaultCatalogItems } = await import('../api/settings/index.js');

const trim = {
  optionId: 'library-gutter',
  source: 'library',
  kind: 'trim',
  trimKind: 'gutters',
  label: 'Heavy Gauge Eavestrough',
  quantity: 48,
  unit: 'LF',
  locked: true,
};
const service = {
  optionId: 'library-cleanup',
  source: 'custom-service',
  kind: 'service',
  label: 'Site Cleanup',
  quantity: 2,
  unit: 'each',
  locked: false,
};
const libraryOptions = {
  products: [{
    id: trim.optionId, source: 'library', kind: 'product', label: trim.label,
    unit: trim.unit, unitPrice: 12.5, colorIds: [], profileLabel: 'K-Style',
    trimKind: 'gutters', active: true,
  }],
  services: [{
    id: service.optionId, source: 'custom-service', kind: 'service', label: service.label,
    unit: service.unit, unitPrice: 225, colorIds: [], profileLabel: null, active: true,
  }],
};

test('new-project defaults instantiate every selected Library trim/service and omit removed hardcoded defaults', () => {
  const design = buildNewProjectDesignSnapshot({
    companySettings: {
      default_services: {
        roof: true,
        wall: false,
        snowRetention: true,
        capFlashing: true,
        garageDoorCapping: true,
      },
      default_catalog_items: [trim, service],
    },
    libraryOptions,
  });

  const selectedTrim = design.trimAccents.find((row) => row.sourceOptionId === trim.optionId);
  assert.equal(selectedTrim.productLabel, 'Heavy Gauge Eavestrough — K-Style');
  assert.equal(selectedTrim.source, 'library');
  assert.equal(selectedTrim.kind, 'gutters');
  assert.equal(selectedTrim.customLabel, undefined);
  assert.equal(selectedTrim.unit, 'LF');
  assert.equal(selectedTrim.unitPrice, 12.5);
  assert.equal(selectedTrim.quantity, 48);
  assert.equal(selectedTrim.locked, true);

  assert.deepEqual(design.customServiceLines, [{
    id: 'library-cleanup',
    sourceOptionId: 'library-cleanup',
    source: 'custom-service',
    name: 'Site Cleanup',
    unit: 'each',
    price: 225,
    unitPrice: 225,
    qty: 2,
    quantity: 2,
    description: '',
    pricingMethod: 'per_unit',
    selected: true,
    locked: false,
  }]);
  assert.deepEqual(design.services, { roof: true, wall: false });
  assert.equal(design.trimAccents.some((row) => row.kind === 'garage_doors'), false);
});

test('default catalog items use the exact persisted shape and reject malformed values', () => {
  assert.deepEqual(validateDefaultCatalogItems([trim, service]), [trim, service]);
  assert.throws(
    () => validateDefaultCatalogItems([{ ...trim, quantity: -1 }]),
    /quantity/i,
  );
  assert.throws(
    () => validateDefaultCatalogItems([{ ...service, kind: 'roof' }]),
    /kind/i,
  );
  assert.throws(
    () => validateDefaultCatalogItems([{ ...service, locked: 'yes' }]),
    /locked/i,
  );
  assert.deepEqual(validateDefaultCatalogItems(null), null);
});

test('Settings validation preserves explicit trim kinds and deduplicates source-option identities', () => {
  const duplicate = { ...trim, quantity: 999, label: 'Stale duplicate label' };

  assert.deepEqual(validateDefaultCatalogItems([trim, duplicate, service, { ...service }]), [trim, service]);
  assert.throws(
    () => validateDefaultCatalogItems([{ ...trim, trimKind: 'roof' }]),
    /trimKind/i,
  );
});

test('gutter and downspout defaults materialize into their canonical rows while invalid products are ignored', () => {
  const downspoutDefault = {
    optionId: 'library-downspout', source: 'library', kind: 'trim', trimKind: 'downspouts',
    label: 'Round Leader', quantity: 18, unit: 'LF', locked: false,
  };
  const invalidRoofDefault = {
    optionId: 'library-roof', source: 'material', kind: 'trim', trimKind: null,
    label: 'Roof Panel', quantity: 25, unit: 'sq ft', locked: false,
  };
  const design = buildNewProjectDesignSnapshot({
    companySettings: {
      default_catalog_items: [trim, { ...trim }, downspoutDefault, invalidRoofDefault],
    },
    libraryOptions: {
      products: [
        libraryOptions.products[0],
        {
          id: downspoutDefault.optionId, source: 'library', kind: 'product',
          label: downspoutDefault.label, unit: 'LF', unitPrice: 4.5, colorIds: [],
          profileLabel: 'Round', trimKind: 'downspouts', active: true,
        },
        {
          id: invalidRoofDefault.optionId, source: 'material', kind: 'product',
          label: invalidRoofDefault.label, unit: 'sq ft', unitPrice: 14, colorIds: [],
          profileLabel: 'Standing Seam', trimKind: null, active: true,
        },
      ],
      services: [],
    },
  });

  const selected = design.trimAccents.filter((row) => row.sourceOptionId);
  assert.deepEqual(selected.map(({ kind, sourceOptionId }) => ({ kind, sourceOptionId })), [
    { kind: 'gutters', sourceOptionId: trim.optionId },
    { kind: 'downspouts', sourceOptionId: downspoutDefault.optionId },
  ]);
  assert.equal(design.trimAccents.filter((row) => row.sourceOptionId === trim.optionId).length, 1);
  assert.equal(design.trimAccents.some((row) => row.sourceOptionId === invalidRoofDefault.optionId), false);
});

test('an unpriced Library default preserves a nullable price snapshot', () => {
  const unpriced = { ...service, optionId: 'unpriced-service', label: 'Inspection' };
  const design = buildNewProjectDesignSnapshot({
    companySettings: { default_catalog_items: [unpriced] },
    libraryOptions: {
      products: [],
      services: [{
        id: unpriced.optionId, source: 'library', kind: 'service', label: unpriced.label,
        unit: 'each', unitPrice: null, colorIds: [], profileLabel: null, active: true,
      }],
    },
  });

  assert.equal(design.customServiceLines[0].price, null);
  assert.equal(design.customServiceLines[0].unitPrice, null);
});

test('Library trim estimates use the frozen price snapshot, including a true zero', () => {
  const changingLibraryOptions = structuredClone(libraryOptions);
  const pricedDesign = buildNewProjectDesignSnapshot({
    companySettings: { default_catalog_items: [trim] },
    libraryOptions: changingLibraryOptions,
  });
  const pricedTrim = pricedDesign.trimAccents.find((row) => row.sourceOptionId === trim.optionId);
  changingLibraryOptions.products[0].unitPrice = 99;
  const pricedEstimate = calculateEstimate({}, {
    services: {}, trimAccents: [pricedTrim], customServiceLines: [], manualDiscount: 0, gstRate: 0,
  });

  assert.equal(pricedEstimate.lineItems[0].rate, 12.5);
  assert.equal(pricedEstimate.lineItems[0].total, 600);
  assert.equal(pricedTrim.unitPrice, 12.5);

  const zeroDesign = buildNewProjectDesignSnapshot({
    companySettings: { default_catalog_items: [{ ...trim, optionId: 'free-trim' }] },
    libraryOptions: {
      products: [{ ...changingLibraryOptions.products[0], id: 'free-trim', unitPrice: 0 }],
      services: [],
    },
  });
  const zeroTrim = zeroDesign.trimAccents.find((row) => row.sourceOptionId === 'free-trim');
  const zeroEstimate = calculateEstimate({}, {
    services: {}, trimAccents: [zeroTrim], customServiceLines: [], manualDiscount: 0, gstRate: 0,
  });

  assert.equal(zeroEstimate.lineItems[0].rate, 0);
  assert.equal(zeroEstimate.lineItems[0].total, 0);
});

test('settings and schema persist the Library default collection without removing legacy columns', async () => {
  const [settings, db, schema, features] = await Promise.all([
    readFile(new URL('../api/settings/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../api/_lib/tenantFeatures.js', import.meta.url), 'utf8'),
  ]);

  for (const source of [settings, db, schema, features]) assert.match(source, /default_catalog_items/);
  for (const legacy of ['default_services', 'default_custom_service_ids']) {
    assert.match(settings, new RegExp(legacy));
    assert.match(schema, new RegExp(legacy));
  }
});

test('Settings defaults expose Library Add Product/Add Service actions, not fixed specialty switches', async () => {
  const source = await readFile(new URL('../src/components/SettingsPanel.jsx', import.meta.url), 'utf8');

  assert.match(source, /LibraryOptionPicker/);
  assert.match(source, /appendUniqueDefaultCatalogItem/);
  assert.match(source, /isLibraryTrimOption/);
  assert.match(source, />\s*Add Product\s*</);
  assert.match(source, />\s*Add Service\s*</);
  assert.doesNotMatch(source, /key: 'snowRetention'|key: 'capFlashing'|key: 'garageDoorCapping'/);
});

test('App waits for authenticated Library options before freezing account defaults', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(source, /const \[libraryOptionsSettled, setLibraryOptionsSettled\] = useState\(false\)/);
  assert.match(source, /!libraryOptionsSettled/);
  assert.match(source, /fetchJson\('\/api\/custom-services\?action=library-options'\)[\s\S]*?\.finally\(\(\) => setLibraryOptionsSettled\(true\)\)/);
});
