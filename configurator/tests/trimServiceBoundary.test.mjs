import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isTrimServiceKey,
  normalizeTrimServiceBoundary,
  projectExtrasOnly,
} from '../src/lib/trimServiceBoundary.js';
import { calculateEstimate } from '../src/lib/pricingEngine.js';

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
