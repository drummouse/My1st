import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { normalizeTrimAccents } from '../src/lib/trimAccents.js';

const vite = await createServer({
  root: new URL('..', import.meta.url).pathname,
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: 'custom',
});
after(() => vite.close());

const [servicesModule, trimsModule] = await Promise.all([
  vite.ssrLoadModule('/src/components/ServicesPanel.jsx'),
  vite.ssrLoadModule('/src/components/TrimsPanel.jsx'),
]);

test('legacy-only callers receive every representable trim edit without losing unrelated fields', () => {
  const calls = { services: [], measurements: [], colors: [], locks: [], gutters: [], downspouts: [] };
  const legacy = {
    services: {
      snowRetention: true,
      soffit: true,
      fascia: true,
      gutters: false,
      downspouts: false,
      garageDoorCapping: true,
      capFlashing: false,
    },
    measurements: {
      soffitSqft: 120,
      fasciaLf: 42,
      gutterLf: 80,
      downspoutLf: 18,
      garageDoorCappingLf: 24,
      capFlashingLf: 12,
      unrelatedMeasurement: 99,
    },
    accessoryColors: {
      soffit: 'old-soffit', fascia: 'old-fascia', gutters: 'old-gutter', downspouts: 'old-downspout',
      garageDoorCapping: 'old-garage', capFlashing: 'old-flashing', unrelatedColor: 'keep',
    },
    lockedServices: {
      soffit: false, fascia: false, gutters: false, downspouts: false,
      garageDoorCapping: false, capFlashing: false, unrelatedLock: true,
    },
    onServicesChange: (value) => calls.services.push(value),
    onMeasurementsChange: (value) => calls.measurements.push(value),
    onAccessoryColorsChange: (value) => calls.colors.push(value),
    onLockedServicesChange: (value) => calls.locks.push(value),
    onGutterOptionChange: (value) => calls.gutters.push(value),
    onDownspoutOptionChange: (value) => calls.downspouts.push(value),
  };
  const bridge = servicesModule.createLegacyTrimsBridge(legacy);
  const records = normalizeTrimAccents(legacy).map((record) => ({
    ...record,
    ...(record.kind === 'soffit' ? { selected: false } : {}),
    ...(record.kind === 'fascia' ? { quantity: 75 } : {}),
    ...(record.kind === 'gutters' ? { colorId: 'new-gutter', selected: true } : {}),
    ...(record.kind === 'downspouts' ? { locked: true, selected: true } : {}),
    ...(record.kind === 'garage_doors' ? { selected: false } : {}),
    ...(record.kind === 'other_trims' ? { selected: true } : {}),
  }));

  bridge.onChange(records);
  bridge.onGutterOptionChange('6in-kstyle');
  bridge.onDownspoutOptionChange('4in-round');

  assert.equal(bridge.allowCanonicalEdits, false);
  assert.deepEqual(calls.services, [{
    snowRetention: true,
    soffit: false,
    fascia: true,
    gutters: true,
    downspouts: true,
    garageDoorCapping: false,
    capFlashing: true,
  }]);
  assert.deepEqual(calls.measurements, [{ ...legacy.measurements, fasciaLf: 75 }]);
  assert.deepEqual(calls.colors, [{ ...legacy.accessoryColors, gutters: 'new-gutter' }]);
  assert.deepEqual(calls.locks, [{ ...legacy.lockedServices, downspouts: true }]);
  assert.deepEqual(calls.gutters, ['6in-kstyle']);
  assert.deepEqual(calls.downspouts, ['4in-round']);
});

test('legacy-only trim controls disable canonical-only edits instead of silently dropping them', () => {
  const record = normalizeTrimAccents({ services: { soffit: true } })[0];
  const html = renderToStaticMarkup(React.createElement(trimsModule.default, {
    records: [record],
    onChange: () => {},
    allowCanonicalEdits: false,
    unitSystem: 'imperial',
  }));

  assert.match(html, /<input[^>]*disabled[^>]*aria-label="Soffit product"/);
  assert.doesNotMatch(html, /aria-label="Soffit profile"/);
  assert.doesNotMatch(html, /Add Product/);
});
