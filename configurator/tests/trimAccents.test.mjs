import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  STANDARD_TRIM_KINDS,
  createAdditionalTrimAccent,
  createTrimAccent,
  displayTrimQuantity,
  normalizeTrimAccents,
  selectLibraryTrimProduct,
  syncTrimAccentsToLegacy,
  trimDisplayUnit,
  trimQuantityFromDisplay,
} from '../src/lib/trimAccents.js';
import {
  captureDesignState,
  normalizeDesignState,
} from '../src/lib/designState.js';

const trimHelpers = await import('../src/lib/trimAccents.js');

const legacySources = {
  measurements: {
    soffitSqft: 2664,
    fasciaLf: 914,
    gutterLf: 431,
    downspoutLf: 112,
    capFlashingLf: 27,
    garageDoorCappingLf: 48,
    untouchedLegacyMeasurement: 19,
  },
  accessoryColors: {
    soffit: 'wk-04',
    fascia: 'wr-7016',
    gutters: 'ice-9005',
    downspouts: 'wg-03',
    capFlashing: 'wr-8019',
    garageDoorCapping: 'wr-9005',
    untouchedLegacyColor: 'custom-color',
  },
  lockedServices: {
    soffit: true,
    fascia: false,
    capFlashing: true,
    garageDoorCapping: false,
  },
};

function designState(overrides = {}) {
  return {
    brandId: 'ironwrap',
    house: { jobNumber: 'IW-6', customerName: 'Trim Customer', address: '6 Trim Way', layers: [] },
    layerOffsets: {},
    roofProductId: 'roof-product',
    roofProfile: 'roof-profile',
    roofColorId: 'roof-color',
    wallProductId: 'wall-product',
    wallProfile: 'wall-profile',
    wallColorId: 'wall-color',
    services: { roof: true, wall: true, soffit: true, fascia: true },
    ...legacySources,
    manualDiscount: 0,
    uniformFinish: true,
    facetOverrides: {},
    customServiceLines: [],
    pricingSettings: null,
    ...overrides,
  };
}

test('legacy measurements, colors, and locks normalize without creating garage-door capping by default', () => {
  const original = structuredClone(legacySources);
  const records = normalizeTrimAccents(legacySources);

  assert.deepEqual(STANDARD_TRIM_KINDS, ['soffit', 'fascia', 'gutters', 'downspouts', 'garage_doors', 'other_trims']);
  assert.deepEqual(records.map((record) => record.kind), [
    'soffit', 'fascia', 'gutters', 'downspouts', 'other_trims',
  ]);
  assert.deepEqual(records, [
    {
      id: 'soffit', kind: 'soffit', productId: '', profile: '', colorId: 'wk-04',
      quantity: 2664, canonicalUnit: 'square_feet', selected: false, locked: true,
    },
    {
      id: 'fascia', kind: 'fascia', productId: '', profile: '', colorId: 'wr-7016',
      quantity: 914, canonicalUnit: 'linear_feet', selected: false, locked: false,
    },
    {
      id: 'gutters', kind: 'gutters', productId: '', profile: '', colorId: 'ice-9005',
      quantity: 431, canonicalUnit: 'linear_feet', selected: false, locked: false,
    },
    {
      id: 'downspouts', kind: 'downspouts', productId: '', profile: '', colorId: 'wg-03',
      quantity: 112, canonicalUnit: 'linear_feet', selected: false, locked: false,
    },
    {
      id: 'other_trims', kind: 'other_trims', productId: '', profile: '', colorId: 'wr-8019',
      quantity: 27, canonicalUnit: 'linear_feet', selected: false, locked: true,
    },
  ]);
  assert.deepEqual(legacySources, original, 'normalization must not consume or mutate legacy fields');
});

test('Add Additional creates the same canonical record shape as standard rows', () => {
  const record = createAdditionalTrimAccent({
    id: 'trim-drip-edge',
    customLabel: 'Drip Edge',
  });

  assert.deepEqual(record, {
    id: 'trim-drip-edge',
    kind: 'other_trims',
    productId: '',
    profile: '',
    colorId: '',
    quantity: 0,
    canonicalUnit: 'linear_feet',
    selected: true,
    locked: false,
    customLabel: 'Drip Edge',
  });
  assert.deepEqual(
    Object.keys(record).filter((key) => key !== 'customLabel'),
    Object.keys(normalizeTrimAccents(legacySources)[0]),
  );
});

test('explicit trim records preserve product, profile, and custom additions', () => {
  const records = normalizeTrimAccents({
    ...legacySources,
    trimAccents: [
      {
        id: 'soffit', kind: 'soffit', productId: 'vented-aluminum', profile: 'triple-four',
        colorId: 'wg-09', quantity: 120, canonicalUnit: 'square_feet', locked: false,
      },
      createAdditionalTrimAccent({
        id: 'trim-window-cap', customLabel: 'Window Cap', colorId: 'wr-6020', quantity: 36,
      }),
    ],
  });

  assert.deepEqual(records.slice(0, 5).map((record) => record.kind), [
    'soffit', 'fascia', 'gutters', 'downspouts', 'other_trims',
  ]);
  assert.equal(records[0].productId, 'vented-aluminum');
  assert.equal(records[0].profile, 'triple-four');
  assert.equal(records[0].productLabel, 'vented-aluminum — triple-four');
  assert.equal(records[0].quantity, 120);
  assert.deepEqual(records.at(-1), {
    id: 'trim-window-cap', kind: 'other_trims', productId: '', profile: '',
    colorId: 'wr-6020', quantity: 36, canonicalUnit: 'linear_feet', selected: true, locked: false,
    customLabel: 'Window Cap',
  });
});

test('Presentation profile changes compose from a stable base label and removal is reversible', () => {
  const selected = selectLibraryTrimProduct([], {
    id: 'library-gutter', source: 'library', kind: 'product', label: 'Architectural Eaves',
    unit: 'LF', unitPrice: 9, colorIds: [], profileLabel: 'Box',
    profiles: ['Box', 'Round'], trimKind: 'gutters', active: true,
  });
  const box = selected.find((record) => record.kind === 'gutters');
  const round = createTrimAccent({ ...box, profile: 'Round' });
  const removed = createTrimAccent({ ...round, profile: '' });

  assert.equal(box.baseProductLabel, 'Architectural Eaves');
  assert.equal(box.productLabel, 'Architectural Eaves — Box');
  assert.equal(round.baseProductLabel, 'Architectural Eaves');
  assert.equal(round.productLabel, 'Architectural Eaves — Round');
  assert.equal(removed.baseProductLabel, 'Architectural Eaves');
  assert.equal(removed.productLabel, 'Architectural Eaves');
  assert.doesNotMatch(round.productLabel, /Box/);
});

test('legacy composed labels acquire a stable base before Presentation changes profile', () => {
  assert.equal(typeof trimHelpers.productBaseLabel, 'function');
  const legacy = {
    id: 'gutters', kind: 'gutters', productId: 'library-gutter',
    productLabel: 'Architectural Eaves — Box', profile: 'Box', colorId: '', quantity: 10,
    canonicalUnit: 'linear_feet', selected: true, locked: false,
  };
  const round = createTrimAccent({
    ...legacy,
    baseProductLabel: trimHelpers.productBaseLabel(legacy.productLabel, legacy.profile),
    profile: 'Round',
  });

  assert.equal(round.baseProductLabel, 'Architectural Eaves');
  assert.equal(round.productLabel, 'Architectural Eaves — Round');
});

test('display conversions use company units while canonical quantities stay Imperial', () => {
  assert.equal(trimDisplayUnit('linear_feet', 'imperial'), 'LF');
  assert.equal(trimDisplayUnit('linear_feet', 'metric'), 'm');
  assert.equal(trimDisplayUnit('square_feet', 'imperial'), 'sq ft');
  assert.equal(trimDisplayUnit('square_feet', 'metric'), 'm²');
  assert.equal(displayTrimQuantity(1, 'linear_feet', 'metric'), 0.3048);
  assert.equal(displayTrimQuantity(1, 'square_feet', 'metric'), 0.09290304);
  assert.equal(trimQuantityFromDisplay(0.3048, 'linear_feet', 'metric'), 1);
  assert.equal(trimQuantityFromDisplay(0.09290304, 'square_feet', 'metric'), 1);
  assert.equal(trimQuantityFromDisplay(12, 'linear_feet', 'imperial'), 12);
});

test('trim edits project back to legacy pricing fields without replacing unrelated values', () => {
  const records = normalizeTrimAccents(legacySources).map((record) => (
    record.kind === 'soffit'
      ? { ...record, quantity: 3000, colorId: 'ice-7016', locked: false }
      : record
  ));
  const synced = syncTrimAccentsToLegacy(records, legacySources);

  assert.equal(synced.measurements.soffitSqft, 3000);
  assert.equal(synced.accessoryColors.soffit, 'ice-7016');
  assert.equal(synced.lockedServices.soffit, false);
  assert.equal(synced.measurements.gutterLf, 431);
  assert.equal(synced.measurements.untouchedLegacyMeasurement, 19);
  assert.equal(synced.accessoryColors.gutters, 'ice-9005');
  assert.equal(synced.accessoryColors.untouchedLegacyColor, 'custom-color');
});

test('captured state adds trim records and legacy snapshots reopen without data loss', () => {
  const fallback = captureDesignState(designState());
  const legacySnapshot = {
    version: 2,
    house: { jobNumber: 'LEGACY-6', customerName: 'Legacy', address: 'Archive', layers: [] },
    measurements: structuredClone(legacySources.measurements),
    accessoryColors: structuredClone(legacySources.accessoryColors),
    lockedServices: structuredClone(legacySources.lockedServices),
  };
  const normalized = normalizeDesignState(legacySnapshot, fallback);

  assert.deepEqual(normalized.measurements, legacySnapshot.measurements);
  assert.deepEqual(normalized.accessoryColors, legacySnapshot.accessoryColors);
  assert.deepEqual(normalized.lockedServices, legacySnapshot.lockedServices);
  assert.deepEqual(
    normalized.trimAccents,
    normalizeTrimAccents({ ...legacySources, services: designState().services }),
  );
  assert.deepEqual(
    captureDesignState(designState()).trimAccents,
    normalizeTrimAccents({ ...legacySources, services: designState().services }),
  );
});

test('explicit canonical trims win over conflicting legacy pricing fields', () => {
  const fallback = captureDesignState(designState());
  const canonicalSoffit = {
    id: 'soffit', kind: 'soffit', productId: 'canonical-product', profile: 'canonical-profile',
    colorId: 'canonical-color', quantity: 480, canonicalUnit: 'square_feet', selected: false, locked: false,
  };
  const normalized = normalizeDesignState({
    version: 2,
    measurements: { ...legacySources.measurements, soffitSqft: 12 },
    accessoryColors: { ...legacySources.accessoryColors, soffit: 'stale-color' },
    lockedServices: { ...legacySources.lockedServices, soffit: true },
    trimAccents: [canonicalSoffit],
  }, fallback);

  assert.equal(normalized.measurements.soffitSqft, 480);
  assert.equal(normalized.accessoryColors.soffit, 'canonical-color');
  assert.equal(normalized.lockedServices.soffit, false);
  assert.equal(normalized.measurements.gutterLf, legacySources.measurements.gutterLf);
  assert.equal(normalized.accessoryColors.gutters, legacySources.accessoryColors.gutters);
  assert.deepEqual(normalized.trimAccents[0], {
    ...canonicalSoffit,
    productLabel: 'canonical-product — canonical-profile',
  });
});

test('TrimAccentRow renders one practical Product field plus color, quantity, unit, and Lock', async () => {
  const row = await readFile(new URL('../src/components/TrimAccentRow.jsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../src/components/TrimsPanel.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const library = await readFile(new URL('../src/lib/trimAccents.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  for (const label of ['Product', 'Color', 'Quantity', 'Include', 'Lock']) {
    assert.match(row, new RegExp(`>${label}<`));
  }
  assert.doesNotMatch(row, />Profile</);
  assert.match(row, /trimDisplayUnit/);
  assert.match(row, /displayTrimQuantity/);
  assert.match(row, /trimQuantityFromDisplay/);
  assert.match(row, /ColorPickerButton/);
  assert.match(panel, /trimRecords\.map\(\(record\) => \(/);
  assert.match(panel, /<TrimAccentRow/);
  assert.match(panel, /Add Product/);
  assert.match(panel, /LibraryOptionPicker/);
  assert.match(panel, /upsertLibraryTrimProduct/);
  assert.match(panel, /gutterLabel/);
  assert.match(panel, /downspoutLabel/);
  assert.doesNotMatch(panel, /aria-label="Eavestrough profile"|aria-label="Downspout type"|<select/);
  assert.match(panel, /onChange=\{\(nextRecord\) => updateRecord\(record, nextRecord\)\}/);
  assert.match(app, /const \[trimAccents, setTrimAccents\]/);
  assert.match(app, /unitSystem:\s*effectiveUnitSystem/);
  assert.match(library, /from '\.\/units\.js'/);
  assert.match(css, /\.trim-accent-row\s*\{/);
  assert.match(css, /\.trim-accent-row-fields\s*\{/);
  assert.match(css, /@media[^}]+\{[\s\S]*?\.trim-accent-row-fields\s*\{/);
});

test('additional trims choose a canonical linear or area dimension before unit display', async () => {
  const row = await readFile(new URL('../src/components/TrimAccentRow.jsx', import.meta.url), 'utf8');

  assert.match(row, /record\.customLabel !== undefined[\s\S]*?>Dimension</);
  assert.match(row, /<option value="linear_feet">Linear<\/option>/);
  assert.match(row, /<option value="square_feet">Area<\/option>/);
  assert.match(row, /update\(\{ canonicalUnit: event\.target\.value, quantity: 0 \}\)/);
  assert.match(row, /trimDisplayUnit\(record\.canonicalUnit, unitSystem\)/);
});

test('an empty trim color remains visibly unselected', async () => {
  const picker = await readFile(new URL('../src/components/ColorPickerButton.jsx', import.meta.url), 'utf8');

  assert.match(picker, /allColors\(\)\.find\(\(color\) => color\.id === selectedId\) \?\? null/);
  assert.match(picker, /Select Color/);
  assert.doesNotMatch(picker, /const selected = colorById\(selectedId\);/);
});
