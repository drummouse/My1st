import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTrimServiceKey,
  normalizeTrimServiceBoundary,
  projectExtrasOnly,
} from '../src/lib/trimServiceBoundary.js';
import * as trimAccentsModule from '../src/lib/trimAccents.js';
import { captureDesignState, normalizeDesignState } from '../src/lib/designState.js';
import { calculateEstimate } from '../src/lib/pricingEngine.js';

const { selectLibraryTrimProduct } = trimAccentsModule;

test('legacy trim service flags normalize to trims and are excluded from extras', () => {
  const result = normalizeTrimServiceBoundary({
    services: { soffit: true, gutters: true, chimneyCaps: true },
    measurements: { soffitSqft: 100, gutterLf: 40 },
  });

  assert.deepEqual(result.extraServices, { chimneyCaps: true });
  assert.equal(result.trimAccents.find((row) => row.kind === 'soffit').quantity, 100);
  assert.equal(result.trimAccents.find((row) => row.kind === 'gutters').quantity, 40);
  assert.equal(result.compatibility.trimSourceByService.soffit, 'legacy');
  assert.equal(result.compatibility.trimSourceByService.gutters, 'legacy');
});

test('legacy trim-owned service lines migrate to trims and survive capture and reopen untouched', () => {
  const legacySoffit = {
    id: 'legacy-soffit-line', serviceKey: 'soffit', name: 'Vented Aluminum Soffit',
    unit: 'sqft', price: 12.5, unitPrice: 12.5, qty: 80, quantity: 80,
    selected: true, locked: true, legacyMetadata: { source: 'saved-v1' },
  };
  const legacyCapFlashing = {
    id: 'legacy-cap-line', serviceKey: 'capFlashing', name: 'Window Cap Flashing',
    unit: 'LF', price: 9, unitPrice: 9, qty: 24, quantity: 24,
    selected: true, locked: false, legacyMetadata: { source: 'saved-v1' },
  };
  const state = {
    version: 2,
    brandId: 'ironwrap',
    house: { jobNumber: 'LEGACY-LINE', customerName: 'Legacy', address: '', layers: [] },
    layerOffsets: {},
    roofProductId: '', roofProfile: '', roofColorId: '',
    wallProductId: '', wallProfile: '', wallColorId: '',
    services: {}, lockedServices: {}, measurements: {}, accessoryColors: {},
    gutterOptionId: '', downspoutOptionId: '', manualDiscount: 0,
    uniformFinish: true, facetOverrides: {}, catalogSnapshot: null,
    trimAccents: [], customServiceLines: [legacySoffit, legacyCapFlashing], pricingSettings: null,
  };

  const boundary = normalizeTrimServiceBoundary(state);
  const migrated = boundary.trimAccents.find((row) => row.kind === 'soffit');
  assert.equal(migrated.productLabel, 'Vented Aluminum Soffit');
  assert.equal(migrated.quantity, 80);
  assert.equal(migrated.unitPrice, 12.5);
  assert.equal(migrated.locked, true);
  const migratedCap = boundary.trimAccents.find((row) => (
    row.kind === 'other_trims' && row.customLabel === undefined
  ));
  assert.equal(migratedCap.productLabel, 'Window Cap Flashing');
  assert.equal(migratedCap.quantity, 24);
  assert.equal(migratedCap.unitPrice, 9);

  const captured = captureDesignState(state);
  const reopened = normalizeDesignState(captured, captured);
  assert.deepEqual(captured.customServiceLines, [legacySoffit, legacyCapFlashing]);
  assert.deepEqual(reopened.customServiceLines, [legacySoffit, legacyCapFlashing]);
  assert.equal(reopened.trimAccents.find((row) => row.kind === 'soffit').quantity, 80);
  assert.equal(reopened.trimAccents.find((row) => row.id === 'other_trims').quantity, 24);
});

test('canonical trims override legacy duplicates and each trim key is excluded from extras', () => {
  const result = normalizeTrimServiceBoundary({
    services: { soffit: true, gutters: true, snowRetention: true },
    measurements: { soffitSqft: 500, gutterLf: 400 },
    trimAccents: [{
      id: 'soffit', kind: 'soffit', productId: '', profile: '', colorId: '',
      quantity: 120, canonicalUnit: 'square_feet', locked: false,
    }],
  });

  assert.deepEqual(result.extraServices, { snowRetention: true });
  assert.equal(result.trimAccents.find((row) => row.kind === 'soffit').quantity, 120);
  assert.equal(result.compatibility.trimSourceByService.soffit, 'canonical');
  assert.equal(result.compatibility.trimSourceByService.gutters, 'legacy');
  assert.equal(isTrimServiceKey('garageDoorCapping'), true);
  assert.equal(isTrimServiceKey('snowRetention'), false);
  assert.deepEqual(projectExtrasOnly({ fascia: true, travel: true }), { travel: true });
});

test('legacy trim pricing survives normalization and canonical duplicates are counted once', () => {
  const measurements = { soffitSqft: 100, gutterLf: 40 };
  const legacySelections = {
    services: { soffit: true, gutters: true },
    gutterOption: '5in-kstyle',
    manualDiscount: 0,
    gstRate: 0.05,
  };
  const legacyEstimate = calculateEstimate(measurements, legacySelections);
  const boundary = normalizeTrimServiceBoundary({
    ...legacySelections,
    measurements,
  });
  const normalizedEstimate = calculateEstimate(measurements, {
    ...legacySelections,
    services: boundary.extraServices,
    trimAccents: boundary.trimAccents,
  });

  assert.equal(normalizedEstimate.total, legacyEstimate.total);
  assert.deepEqual(normalizedEstimate.lineItems.map((line) => line.key), ['soffit', 'gutters']);

  const canonicalEstimate = calculateEstimate(measurements, {
    ...legacySelections,
    trimAccents: boundary.trimAccents.map((row) => (
      row.kind === 'soffit' ? { ...row, quantity: 120 } : row
    )),
  });
  const soffit = canonicalEstimate.lineItems.find((line) => line.key === 'soffit');

  assert.equal(soffit.qty, 120);
  assert.equal(canonicalEstimate.lineItems.filter((line) => line.key === 'soffit').length, 1);
});

test('disabled legacy trims retain quantities but stay out of totals and package activation', () => {
  const estimate = calculateEstimate({ soffitSqft: 100, fasciaLf: 10 }, {
    services: { soffit: false, fascia: true },
    manualDiscount: 0,
    gstRate: 0,
  });

  assert.deepEqual(estimate.lineItems.map((line) => line.key), ['fascia']);
  assert.equal(estimate.subtotal, 100);
  assert.deepEqual(estimate.appliedDiscounts, []);
});

test('enabled zero-quantity legacy trims still activate their package rule', () => {
  const estimate = calculateEstimate({ soffitSqft: 0, fasciaLf: 10 }, {
    services: { soffit: true, fascia: true },
    manualDiscount: 0,
    gstRate: 0,
  });

  assert.equal(estimate.subtotal, 50);
  assert.equal(estimate.appliedDiscounts[0].serviceKey, 'fascia');
});

test('canonical selected state controls a live trim total independently of stale legacy flags', () => {
  const base = {
    services: { soffit: false },
    measurements: { soffitSqft: 999 },
    trimAccents: [{
      id: 'soffit', kind: 'soffit', productId: '', profile: '', colorId: '',
      quantity: 120, canonicalUnit: 'square_feet', selected: false, locked: false,
    }],
    manualDiscount: 0,
    gstRate: 0,
  };
  const disabled = calculateEstimate(base.measurements, base);
  const enabled = calculateEstimate(base.measurements, {
    ...base,
    trimAccents: [{ ...base.trimAccents[0], selected: true }],
  });

  assert.equal(disabled.total, 0);
  assert.equal(enabled.total, 1200);
});

test('gutter and downspout canonical edits override stale legacy quantities in estimates', () => {
  const estimate = calculateEstimate({ gutterLf: 1, downspoutLf: 1 }, {
    services: { gutters: false, downspouts: false },
    gutterOption: '5in-kstyle',
    downspoutOption: '3in-round',
    trimAccents: [
      {
        id: 'gutters', kind: 'gutters', productId: '', profile: '', colorId: '',
        quantity: 40, canonicalUnit: 'linear_feet', selected: true, locked: false,
      },
      {
        id: 'downspouts', kind: 'downspouts', productId: '', profile: '', colorId: '',
        quantity: 12, canonicalUnit: 'linear_feet', selected: true, locked: false,
      },
    ],
    manualDiscount: 0,
    gstRate: 0,
  });

  assert.deepEqual(estimate.lineItems.map(({ key, qty }) => ({ key, qty })), [
    { key: 'gutters', qty: 40 },
    { key: 'downspouts', qty: 12 },
  ]);
  assert.equal(estimate.total, 400, 'downspouts are free under the existing package deal');
});

test('custom trim additions use one canonical pricing line', () => {
  const estimate = calculateEstimate({}, {
    services: { capFlashing: false },
    trimAccents: [{
      id: 'trim-window-cap', kind: 'other_trims', customLabel: 'Window Cap', productId: '', profile: '', colorId: '',
      quantity: 10, canonicalUnit: 'linear_feet', selected: true, locked: false,
    }],
    manualDiscount: 0,
    gstRate: 0,
  });

  assert.deepEqual(estimate.lineItems.map(({ key, label, qty, total }) => ({ key, label, qty, total })), [
    { key: 'trim-trim-window-cap', label: 'Window Cap', qty: 10, total: 70 },
  ]);
});

test('Door and Gutter Library selections quote from frozen finite prices including zero', () => {
  assert.equal(typeof selectLibraryTrimProduct, 'function');
  const baseRecords = [
    {
      id: 'gutters', kind: 'gutters', productId: '', profile: '', colorId: '', quantity: 10,
      canonicalUnit: 'linear_feet', selected: false, locked: false,
    },
    {
      id: 'garage_doors', kind: 'garage_doors', productId: '', profile: '', colorId: '', quantity: 8,
      canonicalUnit: 'linear_feet', selected: false, locked: false,
    },
  ];
  const withGutter = selectLibraryTrimProduct(baseRecords, {
    id: 'library-gutter', label: 'Architectural Eaves', kind: 'product', trimKind: 'gutters',
    source: 'library', unit: 'LF', unitPrice: 4.5, colorIds: [], profileLabel: 'Box', active: true,
  });
  const withDoor = selectLibraryTrimProduct(baseRecords, {
    id: 'library-door', label: 'Garage Perimeter', kind: 'product', trimKind: 'garage_doors',
    source: 'library', unit: 'LF', unitPrice: 0, colorIds: [], profileLabel: null, active: true,
  });
  const gutterEstimate = calculateEstimate({}, {
    services: {}, trimAccents: withGutter, gutterOption: '5in-kstyle', manualDiscount: 0, gstRate: 0,
  });
  const doorEstimate = calculateEstimate({}, {
    services: {}, trimAccents: withDoor, manualDiscount: 0, gstRate: 0,
  });

  assert.deepEqual(gutterEstimate.lineItems.map(({ key, rate, total }) => ({ key, rate, total })), [
    { key: 'gutters', rate: 4.5, total: 45 },
  ]);
  assert.deepEqual(doorEstimate.lineItems.map(({ key, rate, total }) => ({ key, rate, total })), [
    { key: 'garageDoorCapping', rate: 0, total: 0 },
  ]);
});

test('null canonical prices use established fallbacks and downspout metadata targets downspouts only', () => {
  assert.equal(typeof selectLibraryTrimProduct, 'function');
  const baseRecords = [
    {
      id: 'gutters', kind: 'gutters', productId: 'keep-gutter', profile: '', colorId: '', quantity: 10,
      canonicalUnit: 'linear_feet', selected: true, locked: false,
    },
    {
      id: 'downspouts', kind: 'downspouts', productId: '', profile: '', colorId: '', quantity: 6,
      canonicalUnit: 'linear_feet', selected: false, locked: false,
    },
  ];
  const withDownspout = selectLibraryTrimProduct(baseRecords, {
    id: 'library-downspout', label: 'Rain Leader', kind: 'product', trimKind: 'downspouts',
    source: 'library', unit: 'LF', unitPrice: 6, colorIds: [], profileLabel: 'Round', active: true,
  });
  const nullPricedGutter = selectLibraryTrimProduct(baseRecords, {
    id: 'unpriced-gutter', label: 'Unpriced Eaves', kind: 'product', trimKind: 'gutters',
    source: 'library', unit: 'LF', unitPrice: null, colorIds: [], profileLabel: null, active: true,
  });
  const downspoutEstimate = calculateEstimate({}, {
    services: {}, trimAccents: withDownspout, downspoutOption: '3in-round',
    discountRules: [], gutterDownspoutFree: false, manualDiscount: 0, gstRate: 0,
  });
  const fallbackEstimate = calculateEstimate({}, {
    services: {}, trimAccents: nullPricedGutter, gutterOption: '5in-kstyle',
    discountRules: [], gutterDownspoutFree: false, manualDiscount: 0, gstRate: 0,
  });

  assert.equal(withDownspout.find((record) => record.kind === 'gutters').productId, 'keep-gutter');
  assert.equal(withDownspout.find((record) => record.kind === 'downspouts').productId, 'library-downspout');
  assert.equal(downspoutEstimate.lineItems.find((line) => line.key === 'downspouts').rate, 6);
  assert.equal(fallbackEstimate.lineItems.find((line) => line.key === 'gutters').rate, 10);
});

test('every canonical Library trim kind quotes from its frozen finite price including zero', () => {
  const cases = [
    { id: 'soffit', kind: 'soffit', unit: 'square_feet', quantity: 2, unitPrice: 1.25, key: 'soffit' },
    { id: 'fascia', kind: 'fascia', unit: 'linear_feet', quantity: 3, unitPrice: 0, key: 'fascia' },
    { id: 'gutters', kind: 'gutters', unit: 'linear_feet', quantity: 4, unitPrice: 3, key: 'gutters' },
    { id: 'downspouts', kind: 'downspouts', unit: 'linear_feet', quantity: 5, unitPrice: 4, key: 'downspouts' },
    { id: 'garage_doors', kind: 'garage_doors', unit: 'linear_feet', quantity: 6, unitPrice: 5, key: 'garageDoorCapping' },
    { id: 'other_trims', kind: 'other_trims', unit: 'linear_feet', quantity: 7, unitPrice: 6, key: 'capFlashing' },
    {
      id: 'trim-library-other', kind: 'other_trims', unit: 'linear_feet', quantity: 8,
      unitPrice: 7, key: 'trim-trim-library-other', customLabel: 'Library Other Trim',
    },
  ];

  for (const fixture of cases) {
    const record = {
      id: fixture.id,
      kind: fixture.kind,
      productId: `library-${fixture.kind}`,
      profile: '',
      colorId: '',
      quantity: fixture.quantity,
      canonicalUnit: fixture.unit,
      selected: true,
      locked: false,
      unitPrice: fixture.unitPrice,
      ...(fixture.customLabel === undefined ? {} : { customLabel: fixture.customLabel }),
    };
    const estimate = calculateEstimate({}, {
      services: {},
      trimAccents: [record],
      gutterDownspoutFree: false,
      manualDiscount: 0,
      gstRate: 0,
    });
    const line = estimate.lineItems.find((item) => item.key === fixture.key);

    assert.ok(line, `${fixture.kind} should produce its canonical line`);
    assert.equal(line.rate, fixture.unitPrice, `${fixture.kind} should retain the Library rate`);
    assert.equal(line.total, fixture.quantity * fixture.unitPrice);
  }
});

test('null and invalid canonical trim prices alone use established hardcoded fallbacks', () => {
  const estimate = calculateEstimate({}, {
    services: {},
    trimAccents: [
      {
        id: 'soffit', kind: 'soffit', productId: 'unpriced-soffit', profile: '', colorId: '',
        quantity: 2, canonicalUnit: 'square_feet', selected: true, locked: false, unitPrice: null,
      },
      {
        id: 'fascia', kind: 'fascia', productId: 'invalid-fascia', profile: '', colorId: '',
        quantity: 3, canonicalUnit: 'linear_feet', selected: true, locked: false, unitPrice: 'invalid',
      },
    ],
    manualDiscount: 0,
    gstRate: 0,
  });

  assert.equal(estimate.lineItems.find((line) => line.key === 'soffit').rate, 10);
  assert.equal(estimate.lineItems.find((line) => line.key === 'fascia').rate, 10);
});
