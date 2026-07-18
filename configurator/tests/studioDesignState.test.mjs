import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDesignState,
  captureDesignState,
  createStableDesignNormalizer,
  normalizeDesignState,
} from '../src/lib/designState.js';
import {
  createDeferredDesignApplication,
  designFingerprint,
  getProjectOperationState,
  getProjectSaveStatus,
} from '../src/lib/studioDesignState.js';

const savedDesign = {
  version: 2,
  house: {
    jobNumber: 'IW-1042',
    customerName: 'A. Customer',
    address: '10 Example Street',
    layers: [{ id: 'roof', name: 'Roof', xml: '<xml />', visible: true }],
  },
  roofProductId: 'standing-seam',
  roofColorId: 'wg-02',
  services: { roof: true, wall: false },
  measurements: { soffitSqft: 120 },
  facetOverrides: { 'roof:1': { colorId: 'wg-03' } },
};

test('project opening is independent from write readiness', () => {
  assert.deepEqual(getProjectOperationState({ accountSettled: true, defaultsReady: false, persistenceReady: false }), {
    canOpen: true,
    canSave: false,
    canShare: false,
    message: 'Loading account project defaults…',
  });
});

test('project design selected before defaults are ready applies automatically once ready', async () => {
  const deferredApplication = createDeferredDesignApplication();
  const appliedSnapshots = [];
  let resolved = false;

  const pendingOpen = deferredApplication.apply(savedDesign).then((design) => {
    resolved = true;
    return design;
  });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.deepEqual(appliedSnapshots, []);

  deferredApplication.setReady((snapshot) => {
    appliedSnapshots.push(snapshot);
    return { ...snapshot, normalized: true };
  });

  const restoredDesign = await pendingOpen;
  assert.equal(resolved, true);
  assert.deepEqual(appliedSnapshots, [savedDesign]);
  assert.equal(restoredDesign.normalized, true);
});

test('resolved fallbacks allow project writes after optional catalogs fail', () => {
  const state = getProjectOperationState({ accountSettled: true, defaultsReady: true, persistenceReady: true });
  assert.equal(state.canOpen, true);
  assert.equal(state.canSave, true);
  assert.equal(state.canShare, true);
});

test('project writes require both stable defaults and resolved pricing', () => {
  for (const state of [
    getProjectOperationState({ accountSettled: true, defaultsReady: false, persistenceReady: true }),
    getProjectOperationState({ accountSettled: true, defaultsReady: true, persistenceReady: false }),
  ]) {
    assert.equal(state.canSave, false);
    assert.equal(state.canShare, false);
  }
});

test('design fingerprints are canonical across object key order', () => {
  const reorderedDesign = {
    facetOverrides: { 'roof:1': { colorId: 'wg-03' } },
    measurements: { soffitSqft: 120 },
    services: { wall: false, roof: true },
    roofColorId: 'wg-02',
    roofProductId: 'standing-seam',
    house: {
      layers: [{ visible: true, xml: '<xml />', name: 'Roof', id: 'roof' }],
      address: '10 Example Street',
      customerName: 'A. Customer',
      jobNumber: 'IW-1042',
    },
    version: 2,
  };

  assert.equal(designFingerprint(reorderedDesign), designFingerprint(savedDesign));
});

test('design fingerprints change for persisted design fields', () => {
  const changedDesigns = [
    { ...savedDesign, roofProductId: 'corrugated' },
    { ...savedDesign, roofColorId: 'wg-09' },
    { ...savedDesign, services: { ...savedDesign.services, wall: true } },
    { ...savedDesign, measurements: { ...savedDesign.measurements, soffitSqft: 121 } },
    { ...savedDesign, facetOverrides: { 'roof:1': { colorId: 'wg-04' } } },
  ];
  const baseline = designFingerprint(savedDesign);

  for (const changed of changedDesigns) {
    assert.notEqual(designFingerprint(changed), baseline);
  }
});

test('project save status follows the saved fingerprint instead of project identity alone', () => {
  const persistedDesignFingerprint = designFingerprint(savedDesign);
  const dirtyDesignFingerprint = designFingerprint({ ...savedDesign, roofColorId: 'wg-09' });

  assert.equal(getProjectSaveStatus({ currentProjectId: null, currentDesignFingerprint: persistedDesignFingerprint, persistedDesignFingerprint }), 'Not saved');
  assert.equal(getProjectSaveStatus({ currentProjectId: 'project-1', currentDesignFingerprint: persistedDesignFingerprint, persistedDesignFingerprint }), 'Saved');
  assert.equal(getProjectSaveStatus({ currentProjectId: 'project-1', currentDesignFingerprint: dirtyDesignFingerprint, persistedDesignFingerprint }), 'Unsaved changes');
  assert.equal(getProjectSaveStatus({ currentProjectId: 'project-1', currentDesignFingerprint: persistedDesignFingerprint, persistedDesignFingerprint: null }), 'Unsaved changes');
});

test('legacy version-2 restore is clean after defaults are applied and dirty after a real edit', () => {
  const state = {
    version: 2,
    brandId: 'ironwrap',
    house: {
      jobNumber: 'DEFAULT',
      customerName: '',
      address: '',
      layers: [],
    },
    layerOffsets: {},
    roofProductId: 'standing-seam',
    roofProfile: 'mechanical-lock',
    roofColorId: 'wg-02',
    wallProductId: 'board-and-batten',
    wallProfile: 'standard',
    wallColorId: 'wg-02',
    services: { roof: true, wall: true },
    lockedServices: { roof: false, wall: false },
    gutterOptionId: 'five-inch',
    downspoutOptionId: 'two-by-three',
    measurements: { soffitSqft: 0 },
    manualDiscount: 0,
    accessoryColors: { soffit: 'wk-04' },
    uniformFinish: true,
    facetOverrides: {},
    customServiceLines: [],
    pricingSettings: {
      gstRate: 0.05,
      fullWrapDiscountPct: 0.07,
      soffitFasciaDiscountPct: 0.03,
      gutterDownspoutFree: true,
      discountRules: null,
      municipalTaxRate: 0,
      taxLabel: 'GST',
    },
  };
  const legacySnapshot = {
    version: 2,
    brandId: 'ironwrap',
    house: {
      jobNumber: 'IW-2002',
      customerName: 'Legacy Customer',
      address: '2 Archive Way',
      layers: [{ id: 'roof', name: 'Roof', xml: '<xml />', visible: true }],
    },
    roofProductId: 'standing-seam',
    roofColorId: 'wg-03',
    wallProductId: 'board-and-batten',
    wallColorId: 'wg-04',
    services: { roof: true, wall: false },
    measurements: { soffitSqft: 80 },
    pricingSettings: null,
  };

  const restoredDesign = normalizeDesignState(legacySnapshot, captureDesignState(state));
  const assign = (key) => (value) => {
    state[key] = typeof value === 'function' ? value(state[key]) : value;
  };
  applyDesignState(restoredDesign, {
    setBrandId: assign('brandId'),
    setHouse: assign('house'),
    setLayerOffsets: assign('layerOffsets'),
    setRoofProductId: assign('roofProductId'),
    setRoofProfile: assign('roofProfile'),
    setRoofColorId: assign('roofColorId'),
    setWallProductId: assign('wallProductId'),
    setWallProfile: assign('wallProfile'),
    setWallColorId: assign('wallColorId'),
    setServices: assign('services'),
    setLockedServices: assign('lockedServices'),
    setGutterOptionId: assign('gutterOptionId'),
    setDownspoutOptionId: assign('downspoutOptionId'),
    setMeasurements: assign('measurements'),
    setManualDiscount: assign('manualDiscount'),
    setAccessoryColors: assign('accessoryColors'),
    setUniformFinish: assign('uniformFinish'),
    setFacetOverrides: assign('facetOverrides'),
    setCustomServiceLines: assign('customServiceLines'),
    setPricingSettings: assign('pricingSettings'),
  });

  const persistedDesignFingerprint = designFingerprint(restoredDesign);
  const restoredFingerprint = designFingerprint(captureDesignState(state));
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'legacy-project',
    currentDesignFingerprint: restoredFingerprint,
    persistedDesignFingerprint,
  }), 'Saved');

  state.roofColorId = 'wg-09';
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'legacy-project',
    currentDesignFingerprint: designFingerprint(captureDesignState(state)),
    persistedDesignFingerprint,
  }), 'Unsaved changes');
});

test('sequential legacy project restores always normalize against stable account defaults', () => {
  const accountDefaults = captureDesignState({
    brandId: 'ironwrap',
    house: { jobNumber: '', customerName: '', address: '', layers: [] },
    layerOffsets: {},
    roofProductId: 'account-roof',
    roofProfile: 'account-roof-profile',
    roofColorId: 'account-roof-color',
    wallProductId: 'account-wall',
    wallProfile: 'account-wall-profile',
    wallColorId: 'account-wall-color',
    services: { roof: true, wall: false, gutters: true },
    lockedServices: { roof: true, wall: false, gutters: false },
    gutterOptionId: 'account-gutter',
    downspoutOptionId: 'account-downspout',
    measurements: { soffitSqft: 0, fasciaLf: 0 },
    manualDiscount: 0,
    accessoryColors: { soffit: 'account-accessory' },
    uniformFinish: true,
    facetOverrides: {},
    customServiceLines: [{ id: 'account-service', name: 'Account default', price: 25, qty: 1 }],
    pricingSettings: {
      gstRate: 0.05,
      fullWrapDiscountPct: 0.08,
      soffitFasciaDiscountPct: 0.04,
      gutterDownspoutFree: true,
      discountRules: null,
      municipalTaxRate: 0,
      taxLabel: 'GST',
    },
  });
  const normalize = createStableDesignNormalizer(accountDefaults);
  const projectA = captureDesignState({
    ...accountDefaults,
    house: { jobNumber: 'PROJECT-A', customerName: 'Rich A', address: '1 A Way', layers: [] },
    layerOffsets: { roof: { dx: 10, dy: 20, dz: 30 } },
    roofProfile: 'project-a-roof-profile',
    wallProfile: 'project-a-wall-profile',
    services: { roof: false, wall: true, gutters: false },
    lockedServices: { roof: false, wall: true, gutters: true },
    facetOverrides: { 'roof:1': { colorId: 'project-a-color' } },
    customServiceLines: [{ id: 'project-a-service', name: 'Only A', price: 999, qty: 2 }],
    pricingSettings: { ...accountDefaults.pricingSettings, gstRate: 0.12, taxLabel: 'A TAX' },
  });
  const projectB = {
    version: 2,
    house: { jobNumber: 'PROJECT-B', customerName: 'Sparse B', address: '2 B Way', layers: [] },
    roofProfile: null,
    services: null,
    pricingSettings: null,
  };

  const restoredA = normalize(projectA);
  const restoredB = normalize(projectB);
  const state = JSON.parse(JSON.stringify(accountDefaults));
  const assign = (key) => (value) => {
    state[key] = typeof value === 'function' ? value(state[key]) : value;
  };
  const setters = Object.fromEntries([
    'BrandId', 'House', 'LayerOffsets', 'RoofProductId', 'RoofProfile', 'RoofColorId',
    'WallProductId', 'WallProfile', 'WallColorId', 'Services', 'LockedServices',
    'GutterOptionId', 'DownspoutOptionId', 'Measurements', 'ManualDiscount',
    'AccessoryColors', 'UniformFinish', 'FacetOverrides', 'CustomServiceLines',
    'PricingSettings',
  ].map((name) => [`set${name}`, assign(`${name[0].toLowerCase()}${name.slice(1)}`)]));

  applyDesignState(restoredA, setters);
  assert.equal(captureDesignState(state).roofProfile, 'project-a-roof-profile');
  applyDesignState(restoredB, setters);
  const currentB = captureDesignState(state);

  assert.equal(restoredA.roofProfile, 'project-a-roof-profile');
  assert.equal(restoredB.roofProfile, accountDefaults.roofProfile);
  assert.equal(restoredB.wallProfile, accountDefaults.wallProfile);
  assert.deepEqual(restoredB.services, accountDefaults.services);
  assert.deepEqual(restoredB.lockedServices, accountDefaults.lockedServices);
  assert.deepEqual(restoredB.layerOffsets, accountDefaults.layerOffsets);
  assert.deepEqual(restoredB.facetOverrides, accountDefaults.facetOverrides);
  assert.deepEqual(restoredB.customServiceLines, accountDefaults.customServiceLines);
  assert.deepEqual(restoredB.pricingSettings, accountDefaults.pricingSettings);
  assert.notDeepEqual(restoredB.pricingSettings, restoredA.pricingSettings);

  const persistedDesignFingerprint = designFingerprint(restoredB);
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'project-b',
    currentDesignFingerprint: designFingerprint(currentB),
    persistedDesignFingerprint,
  }), 'Saved');

  state.roofColorId = 'real-project-b-edit';
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'project-b',
    currentDesignFingerprint: designFingerprint(captureDesignState(state)),
    persistedDesignFingerprint,
  }), 'Unsaved changes');
});

test('complete custom-material snapshots preserve empty profiles through export and reopen', () => {
  const accountDefaults = captureDesignState({
    brandId: 'ironwrap',
    house: { jobNumber: '', customerName: '', address: '', layers: [] },
    layerOffsets: { stale: { dx: 1, dy: 2, dz: 3 } },
    roofProductId: 'account-roof',
    roofProfile: 'account-roof-profile',
    roofColorId: 'account-roof-color',
    wallProductId: 'account-wall',
    wallProfile: 'account-wall-profile',
    wallColorId: 'account-wall-color',
    services: { roof: true, wall: true },
    lockedServices: { roof: true, wall: true },
    gutterOptionId: 'account-gutter',
    downspoutOptionId: 'account-downspout',
    measurements: { soffitSqft: 1 },
    manualDiscount: 10,
    accessoryColors: { soffit: 'account-accessory' },
    uniformFinish: true,
    facetOverrides: { stale: { colorId: 'account-color' } },
    customServiceLines: [{ id: 'stale-service', name: 'Stale', price: 1, qty: 1 }],
    pricingSettings: { gstRate: 0.05, municipalTaxRate: 0, taxLabel: 'GST' },
  });
  const customMaterialDesign = captureDesignState({
    ...accountDefaults,
    house: {
      jobNumber: 'CUSTOM-1',
      customerName: 'Custom Material Customer',
      address: '1 Profile Free Way',
      layers: [{ id: 'complete', name: 'Complete model', xml: '<xml />', visible: true }],
    },
    layerOffsets: {},
    roofProductId: 'custom-roof-material',
    roofProfile: '',
    roofColorId: 'custom-roof-color',
    wallProductId: 'custom-wall-material',
    wallProfile: '',
    wallColorId: 'custom-wall-color',
    services: {},
    lockedServices: {},
    measurements: {},
    manualDiscount: 0,
    accessoryColors: {},
    uniformFinish: false,
    facetOverrides: {},
    customServiceLines: [],
    pricingSettings: { gstRate: 0, municipalTaxRate: 0, taxLabel: '' },
  });

  // Standalone HTML export serializes captureDesignState's result as JSON.
  const exportedSnapshot = JSON.parse(JSON.stringify(customMaterialDesign));
  const reopenedSnapshot = createStableDesignNormalizer(accountDefaults)(exportedSnapshot);
  assert.deepEqual(reopenedSnapshot, exportedSnapshot);

  const reopenedState = JSON.parse(JSON.stringify(accountDefaults));
  const assign = (key) => (value) => {
    reopenedState[key] = typeof value === 'function' ? value(reopenedState[key]) : value;
  };
  const setters = Object.fromEntries([
    'BrandId', 'House', 'LayerOffsets', 'RoofProductId', 'RoofProfile', 'RoofColorId',
    'WallProductId', 'WallProfile', 'WallColorId', 'Services', 'LockedServices',
    'GutterOptionId', 'DownspoutOptionId', 'Measurements', 'ManualDiscount',
    'AccessoryColors', 'UniformFinish', 'FacetOverrides', 'CustomServiceLines',
    'PricingSettings',
  ].map((name) => [`set${name}`, assign(`${name[0].toLowerCase()}${name.slice(1)}`)]));

  applyDesignState(reopenedSnapshot, setters);
  assert.deepEqual(captureDesignState(reopenedState), exportedSnapshot);
  assert.equal(reopenedState.roofProfile, '');
  assert.equal(reopenedState.wallProfile, '');
});
