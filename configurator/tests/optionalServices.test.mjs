import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  adaptCustomServiceLine,
  adaptCustomServiceLines,
  normalizeCustomServiceLines,
  optionalServiceToCustomServiceLine,
} from '../src/lib/designState.js';
import { calculateEstimate } from '../src/lib/pricingEngine.js';

const namedLegacyLines = [
  { id: 'travel', name: 'Travel', description: 'Outside service area', price: '125', qty: 2, unit: 'trip' },
  { id: 'snow-bars', name: 'Decorative snow bars', price: 38, qty: 20, unit: 'LF', pricingMethod: 'per_unit' },
  { id: 'stripping', name: 'Stripping / removal', price: 1.5, qty: 400, unit: 'sqft' },
  { id: 'strapping', name: 'Strapping', price: 3.25, qty: 140, unit: 'LF' },
  { id: 'chimney-caps', name: 'Chimney caps', price: 475, qty: 2, unit: 'each' },
  { id: 'tenant-extra-42', name: 'Arbitrary custom work', price: 90, qty: 3, unit: 'hour' },
];

test('legacy and arbitrary custom lines adapt to one explicit optional-service record shape', () => {
  const records = adaptCustomServiceLines(namedLegacyLines);

  assert.deepEqual(records.map(({ id, name }) => ({ id, name })), namedLegacyLines.map(({ id, name }) => ({ id, name })));
  assert.deepEqual(Object.keys(records[0]), [
    'id', 'name', 'description', 'pricingMethod', 'quantity', 'unit', 'unitPrice', 'selected', 'locked',
  ]);
  assert.deepEqual(records[0], {
    id: 'travel',
    name: 'Travel',
    description: 'Outside service area',
    pricingMethod: 'per_unit',
    quantity: 2,
    unit: 'trip',
    unitPrice: 125,
    selected: true,
    locked: false,
  });
  assert.ok(records.every((record) => record.pricingMethod === 'per_unit'));
});

test('optional-service adaptation applies bounded safe defaults and preserves explicit state', () => {
  assert.deepEqual(adaptCustomServiceLine({
    id: 'safe-defaults',
    name: null,
    description: null,
    pricingMethod: '',
    qty: -9,
    unit: '',
    price: 'not-a-price',
  }), {
    id: 'safe-defaults',
    name: 'Custom service',
    description: '',
    pricingMethod: 'per_unit',
    quantity: 0,
    unit: 'each',
    unitPrice: 0,
    selected: true,
    locked: false,
  });

  const explicit = adaptCustomServiceLine({
    id: 'locked-extra', name: 'Locked extra', pricingMethod: 'per_unit',
    quantity: 4, unitPrice: 19, unit: 'each', selected: false, locked: true,
  });
  assert.equal(explicit.selected, false);
  assert.equal(explicit.locked, true);
  assert.equal(explicit.quantity, 4);
});

test('standardized edits retain custom-service identity and estimator aliases', () => {
  const original = {
    id: 'catalog-identity',
    owner_id: 'tenant-7',
    name: 'Travel',
    unit: 'trip',
    price: '125.00',
    qty: 2,
    description: 'Outside service area',
    linkUrl: 'https://example.test/travel',
  };
  const next = optionalServiceToCustomServiceLine({
    ...adaptCustomServiceLine(original),
    quantity: 3,
    locked: true,
  }, original);

  assert.equal(next.id, original.id);
  assert.equal(next.owner_id, original.owner_id);
  assert.equal(next.price, 125);
  assert.equal(next.qty, 3);
  assert.equal(next.pricingMethod, 'per_unit');
  assert.equal(next.selected, true);
  assert.equal(next.locked, true);
  assert.equal(next.linkUrl, original.linkUrl);
});

test('round-tripping a canonical entry keeps canonical and estimator aliases synchronized', () => {
  const original = {
    id: 'canonical-entry', name: 'Strapping', unit: 'LF',
    price: 3, qty: 10, unitPrice: 3, quantity: 10,
  };
  const next = optionalServiceToCustomServiceLine({
    ...adaptCustomServiceLine(original),
    unitPrice: 4.5,
    quantity: 16,
  }, original);

  assert.equal(next.price, 4.5);
  assert.equal(next.unitPrice, 4.5);
  assert.equal(next.qty, 16);
  assert.equal(next.quantity, 16);
  assert.deepEqual(adaptCustomServiceLine(next), {
    id: 'canonical-entry',
    name: 'Strapping',
    description: '',
    pricingMethod: 'per_unit',
    quantity: 16,
    unit: 'LF',
    unitPrice: 4.5,
    selected: true,
    locked: false,
  });
});

test('normalization adds presentation metadata without changing equivalent estimates', () => {
  const normalized = normalizeCustomServiceLines(namedLegacyLines);
  const selections = {
    services: {},
    customServiceLines: namedLegacyLines,
    manualDiscount: 0,
    gstRate: 0.05,
  };
  const before = calculateEstimate({}, selections);
  const after = calculateEstimate({}, { ...selections, customServiceLines: normalized });

  assert.deepEqual(after, before);
  assert.deepEqual(normalized.map(({ id, price, qty }) => ({ id, price, qty })), [
    { id: 'travel', price: 125, qty: 2 },
    { id: 'snow-bars', price: 38, qty: 20 },
    { id: 'stripping', price: 1.5, qty: 400 },
    { id: 'strapping', price: 3.25, qty: 140 },
    { id: 'chimney-caps', price: 475, qty: 2 },
    { id: 'tenant-extra-42', price: 90, qty: 3 },
  ]);
});

test('an unselected standardized service keeps its quantity without affecting the estimate', () => {
  const [line] = normalizeCustomServiceLines([{
    id: 'deselected-travel', name: 'Travel', price: 125, qty: 3, unit: 'trip', selected: false,
  }]);
  const estimate = calculateEstimate({}, {
    services: {},
    customServiceLines: [line],
    manualDiscount: 0,
    gstRate: 0.05,
  });

  assert.equal(line.qty, 3);
  assert.equal(line.selected, false);
  assert.equal(estimate.subtotal, 0);
  assert.deepEqual(estimate.lineItems, []);
});

test('the shared row locks customer changes while keeping quantity visible', async () => {
  const row = await readFile(new URL('../src/components/OptionalServiceRow.jsx', import.meta.url), 'utf8');

  for (const field of ['Description', 'Pricing method', 'Quantity', 'Unit price', 'Lock']) {
    assert.match(row, new RegExp(`>${field}<`));
  }
  assert.match(row, /const customerLocked = isCustomerView && service\.locked;/);
  assert.match(row, /value=\{service\.quantity\}/);
  assert.match(row, /disabled=\{!service\.selected \|\| readOnlyQuantity \|\| customerLocked\}/);
  assert.doesNotMatch(row, /customerLocked\s*&&\s*\([^)]*service\.quantity/);
});

test('optional services use the shared adapter and stay separate from physical trim records', async () => {
  const panel = await readFile(new URL('../src/components/ServicesPanel.jsx', import.meta.url), 'utf8');
  const catalog = await readFile(new URL('../src/components/CustomServicesPanel.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

  assert.match(panel, /customServiceLines\.map\(\(line\) => adaptCustomServiceLine\(line\)\)/);
  assert.match(panel, /<OptionalServiceRow/);
  assert.match(panel, /trimAccents\.map\(\(record\) => \(/);
  assert.match(panel, /<TrimAccentRow/);
  assert.doesNotMatch(panel, /adaptCustomServiceLine\(record\)/);
  assert.match(catalog, /<OptionalServiceRow/);
  assert.match(catalog, />Pricing method</);
  assert.match(catalog, /value="per_unit"/);
  assert.match(app, /onCustomServiceLinesChange:\s*handleCustomServiceLinesChange/);
});
