import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const vite = await createServer({
  root: new URL('..', import.meta.url).pathname,
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: 'custom',
});
after(() => vite.close());

const [trimsModule, extrasModule] = await Promise.all([
  vite.ssrLoadModule('/src/components/TrimsPanel.jsx'),
  vite.ssrLoadModule('/src/components/ExtrasServicesPanel.jsx'),
]);

const noop = () => {};
const fixtureTrims = [
  { id: 'soffit', kind: 'soffit', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'square_feet', selected: true, locked: false },
  { id: 'fascia', kind: 'fascia', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'linear_feet', selected: true, locked: false },
  { id: 'gutters', kind: 'gutters', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'linear_feet', selected: true, locked: false },
  { id: 'downspouts', kind: 'downspouts', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'linear_feet', selected: true, locked: false },
  { id: 'garage_doors', kind: 'garage_doors', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'linear_feet', selected: true, locked: false },
  { id: 'other_trims', kind: 'other_trims', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'linear_feet', selected: true, locked: false },
];

test('Trims owns all six standard trims and custom additions', () => {
  const html = renderToStaticMarkup(React.createElement(trimsModule.default, {
    records: [...fixtureTrims, {
      id: 'additional', kind: 'other_trims', customLabel: 'Custom Crown', productId: '', profile: '', colorId: '', quantity: 1, canonicalUnit: 'linear_feet', selected: true, locked: false,
    }],
    onChange: noop,
    unitSystem: 'imperial',
  }));

  for (const label of ['Soffit', 'Fascia', 'Gutters', 'Downspouts', 'Garage Doors', 'Other Trims', 'Custom Crown']) {
    assert.match(html, new RegExp(label));
  }
});

test('Extras renders extras without trim labels and ignores legacy trim keys', () => {
  const html = renderToStaticMarkup(React.createElement(extrasModule.default, {
    services: { snowRetention: true, soffit: true, fascia: true, gutters: true, downspouts: true },
    customServiceLines: [{ id: 'chimney-caps', name: 'Chimney Caps', price: 475, qty: 2, unit: 'each' }],
    catalog: [],
    locks: {},
    onChange: noop,
    measurements: { snowRetentionLf: 3 },
    unitSystem: 'imperial',
  }));

  assert.match(html, /Chimney Caps/);
  assert.match(html, /Snow Retention/);
  assert.doesNotMatch(html, /Soffit|Fascia|Gutters|Downspouts/);
});

test('Trims adds a Library product with source and price snapshots', () => {
  const updates = [];
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(trimsModule.default, {
      records: [],
      libraryOptions: [{
        id: 'trim-product', source: 'library', kind: 'product', label: 'Drip Edge',
        unit: 'LF', unitPrice: 8, profileLabel: 'Wide', colorIds: [],
        trimKind: 'fascia', active: true,
      }, {
        id: 'roof-product', source: 'material', kind: 'product', label: 'Roof Panel',
        unit: 'sq ft', unitPrice: 18, profileLabel: 'Standing Seam', colorIds: [],
        trimKind: null, active: true,
      }],
      onChange: (next) => updates.push(next),
      unitSystem: 'imperial',
    }));
  });
  const add = renderer.root.findAllByType('button').find((button) => (
    button.props.children === 'Add Product'
  ));

  assert.ok(add);
  act(() => add.props.onClick());
  const choice = renderer.root.findAllByProps({ role: 'listitem' })[0];
  act(() => choice.props.onClick());

  const selected = updates[0].find((record) => record.sourceOptionId === 'trim-product');
  assert.equal(selected.kind, 'fascia');
  assert.equal(selected.customLabel, undefined);
  assert.equal(selected.productLabel, 'Drip Edge — Wide');
  assert.equal(selected.unitPrice, 8);
  assert.equal(renderer.root.findAllByProps({ role: 'listitem' }).length, 0, 'picker closes after one valid choice');
});

test('Trims catalog upserts one source-option identity instead of duplicating Other Trims', async () => {
  const { upsertLibraryTrimProduct } = await vite.ssrLoadModule('/src/lib/trimAccents.js');
  const option = {
    id: 'custom-cap', source: 'library', kind: 'product', label: 'Custom Cap', unit: 'LF',
    unitPrice: 6, profileLabel: 'Box', colorIds: [], trimKind: 'other_trims', active: true,
  };

  assert.equal(typeof upsertLibraryTrimProduct, 'function');
  const once = upsertLibraryTrimProduct([], option);
  const twice = upsertLibraryTrimProduct(once, option);
  const sameIdDifferentSource = upsertLibraryTrimProduct(twice, { ...option, source: 'tenant-library' });

  assert.equal(once.length, 1);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].id, once[0].id);
  assert.equal(sameIdDifferentSource.length, 2);
});

test('legacy gutter and downspout types appear in the single Product field without separate selectors', () => {
  const html = renderToStaticMarkup(React.createElement(trimsModule.default, {
    records: fixtureTrims.filter((record) => ['gutters', 'downspouts'].includes(record.kind)),
    onChange: noop,
    gutterOptionId: '5in-kstyle',
    downspoutOptionId: '3in-round',
    unitSystem: 'imperial',
  }));

  assert.match(html, /value="5&quot; K-Style Eavestrough"/);
  assert.match(html, /value="3&quot; Round Downspout"/);
  assert.doesNotMatch(html, /aria-label="Eavestrough profile"|aria-label="Downspout type"/);
  assert.doesNotMatch(html, /<select/);
});

test('editing a visible Service preserves hidden legacy trim-owned lines', () => {
  const legacyCapFlashing = {
    id: 'legacy-cap', serviceKey: 'capFlashing', name: 'Legacy Cap Flashing',
    unit: 'LF', price: 9, unitPrice: 9, qty: 12, quantity: 12,
    selected: true, locked: false, compatibilityNote: 'preserve me',
  };
  const travel = {
    id: 'travel', name: 'Travel', unit: 'each', price: 25, unitPrice: 25,
    qty: 1, quantity: 1, selected: true, locked: false,
  };
  const updates = [];
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(extrasModule.default, {
      services: {},
      customServiceLines: [legacyCapFlashing, travel],
      onCustomServiceLinesChange: (next) => updates.push(next),
      unitSystem: 'imperial',
    }));
  });

  const quantity = renderer.root.findByProps({ 'aria-label': 'Travel quantity in each' });
  act(() => quantity.props.onChange({ target: { value: '3' } }));

  assert.deepEqual(updates[0][0], legacyCapFlashing);
  assert.equal(updates[0][1].id, 'travel');
  assert.equal(updates[0][1].qty, 3);
  assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Legacy Cap Flashing/);
});

test('Services adds Library services, snapshots them, and rejects trim-key lines', () => {
  const updates = [];
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(extrasModule.default, {
      services: { snowRetention: false },
      customServiceLines: [
        { id: 'soffit', serviceKey: 'soffit', name: 'Soffit duplicate', price: 99, qty: 1, unit: 'LF' },
      ],
      libraryOptions: [{
        id: 'cleanup', source: 'library', kind: 'service', label: 'Cleanup',
        unit: 'each', unitPrice: 125, profileLabel: null, colorIds: [], active: true,
      }],
      onCustomServiceLinesChange: (next) => updates.push(next),
      unitSystem: 'imperial',
    }));
  });

  const html = renderer.toJSON();
  assert.doesNotMatch(JSON.stringify(html), /Soffit duplicate|Add Snow Retention/);
  const add = renderer.root.findAllByType('button').find((button) => button.props.children === 'Add Service');
  assert.ok(add);
  act(() => add.props.onClick());
  const choice = renderer.root.findAllByProps({ role: 'listitem' })[0];
  act(() => choice.props.onClick());

  assert.deepEqual(updates[0], [
    { id: 'soffit', serviceKey: 'soffit', name: 'Soffit duplicate', price: 99, qty: 1, unit: 'LF' },
    {
    id: 'cleanup', sourceOptionId: 'cleanup', source: 'library', name: 'Cleanup', unit: 'each',
    price: 125, unitPrice: 125, qty: 1, quantity: 1, description: '',
    pricingMethod: 'per_unit', selected: true, locked: false,
    },
  ]);
});
