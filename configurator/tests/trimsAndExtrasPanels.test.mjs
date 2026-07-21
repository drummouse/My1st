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

test('a new project can add the supported fixed snow-retention service', () => {
  const updates = [];
  let renderer;
  act(() => {
    renderer = TestRenderer.create(React.createElement(extrasModule.default, {
      services: { snowRetention: false },
      customServiceLines: [],
      catalog: [],
      locks: {},
      onServicesChange: (next) => updates.push(next),
      measurements: { snowRetentionLf: 0 },
      unitSystem: 'imperial',
    }));
  });
  const add = renderer.root.findAllByType('button').find((button) => (
    button.props.children === 'Add Snow Retention'
  ));

  assert.ok(add, 'fixed snow retention should have an add action when disabled');
  act(() => add.props.onClick());
  assert.deepEqual(updates, [{ snowRetention: true }]);
});
