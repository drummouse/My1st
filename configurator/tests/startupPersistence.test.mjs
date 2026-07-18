import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeferredDesignApplication,
  createInitialEditRestore,
  designFingerprint,
  getDesignPersistenceState,
  getProjectSaveStatus,
} from '../src/lib/studioDesignState.js';
import { saveOrUpdateProject } from '../src/lib/projects.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const pricingSettings = Object.freeze({
  gstRate: 0.05,
  fullWrapDiscountPct: 0.07,
  soffitFasciaDiscountPct: 0.03,
  gutterDownspoutFree: true,
  discountRules: null,
  municipalTaxRate: 0,
  taxLabel: 'GST',
});

test('initial edit project waits for settings and default catalogs, then restores exactly once', async () => {
  const settings = deferred();
  const catalogs = deferred();
  const restore = createInitialEditRestore('?tab=project&edit=initial-project');
  const restoredIds = [];
  let settingsSettled = false;
  let catalogsSettled = false;

  assert.equal(restore.claim(settingsSettled && catalogsSettled), null);

  settings.resolve(pricingSettings);
  await settings.promise;
  settingsSettled = true;
  assert.equal(restore.claim(settingsSettled && catalogsSettled), null);

  catalogs.resolve([]);
  await catalogs.promise;
  catalogsSettled = true;
  const projectId = restore.claim(settingsSettled && catalogsSettled);
  if (projectId) restoredIds.push(projectId);
  await Promise.resolve().then(() => {
    const projectId = restore.claim(settingsSettled && catalogsSettled);
    if (projectId) restoredIds.push(projectId);
  });

  assert.deepEqual(restoredIds, ['initial-project']);
  assert.equal(restore.claim(true), null);
});

test('edit project added to the URL in-session is not claimed as an initial restore', async () => {
  const settings = deferred();
  let pageSearch = '?tab=project';
  const restore = createInitialEditRestore(pageSearch);

  pageSearch = '?tab=project&edit=opened-in-session';
  settings.resolve(pricingSettings);
  await settings.promise;

  assert.equal(restore.claim(true), null);
  assert.equal(pageSearch, '?tab=project&edit=opened-in-session');
});

test('manual queued open cancels the initial edit restore before defaults settle', async () => {
  const initialRestore = createInitialEditRestore('?edit=original-project');
  const deferredApplication = createDeferredDesignApplication();
  const manualDesign = { version: 3, house: { jobNumber: 'MANUAL' } };
  let currentProjectId = 'current-project';

  initialRestore.cancel();
  const manualOpen = deferredApplication.apply(manualDesign).then((design) => {
    currentProjectId = 'manual-project';
    return design;
  });

  assert.equal(currentProjectId, 'current-project');
  assert.equal(initialRestore.claim(true), null);

  deferredApplication.setReady((design) => design);
  assert.equal(await manualOpen, manualDesign);
  assert.equal(currentProjectId, 'manual-project');
  assert.equal(initialRestore.claim(true), null);
});

test('save and Share Design writes wait for settled pricing, then freeze pricing and track edits', async () => {
  const settings = deferred();
  let companySettingsSettled = false;
  let effectivePricingSettings = null;
  const writes = [];
  const design = { version: 2, house: { jobNumber: 'IW-42' }, roofColorId: 'wg-02' };

  const persist = (kind) => {
    const persistence = getDesignPersistenceState({
      isCustomerView: false,
      companySettingsSettled,
      effectivePricingSettings,
    });
    if (!persistence.ready) return false;
    writes.push({ kind, design: { ...design, pricingSettings: effectivePricingSettings } });
    return true;
  };

  assert.equal(persist('project-save'), false);
  assert.equal(persist('share-design'), false);
  assert.deepEqual(writes, []);

  settings.promise.then((settingsSnapshot) => {
    effectivePricingSettings = settingsSnapshot;
    companySettingsSettled = true;
  });
  settings.resolve(pricingSettings);
  await settings.promise;
  await Promise.resolve();

  assert.equal(persist('project-save'), true);
  assert.equal(persist('share-design'), true);
  assert.equal(writes.length, 2);
  for (const write of writes) {
    assert.deepEqual(write.design.pricingSettings, pricingSettings);
  }

  const persistedDesignFingerprint = designFingerprint(writes[0].design);
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'project-42',
    currentDesignFingerprint: persistedDesignFingerprint,
    persistedDesignFingerprint,
    persistenceReady: true,
  }), 'Saved');
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'project-42',
    currentDesignFingerprint: designFingerprint({ ...writes[0].design, roofColorId: 'wg-09' }),
    persistedDesignFingerprint,
    persistenceReady: true,
  }), 'Unsaved changes');
});

test('pending owner persistence is not reported Saved while customer flows stay available', () => {
  const pendingOwner = getDesignPersistenceState({
    isCustomerView: false,
    companySettingsSettled: false,
    effectivePricingSettings: null,
  });
  const publicCustomer = getDesignPersistenceState({
    isCustomerView: true,
    companySettingsSettled: false,
    effectivePricingSettings: pricingSettings,
  });

  assert.equal(pendingOwner.ready, false);
  assert.match(pendingOwner.message, /pricing settings/i);
  assert.equal(publicCustomer.ready, true);
  assert.equal(getProjectSaveStatus({
    currentProjectId: 'project-42',
    currentDesignFingerprint: '{}',
    persistedDesignFingerprint: '{}',
    persistenceReady: false,
  }), 'Loading pricing…');
});

test('the project writer rejects an unfrozen pricing snapshot before making an API request', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ id: 'project-42' }) };
  };

  try {
    const design = {
      version: 2,
      house: { jobNumber: 'IW-42', customerName: 'Customer', address: '42 Example Ave' },
      pricingSettings: null,
    };
    await assert.rejects(
      saveOrUpdateProject(design, null),
      /pricing settings/i,
    );
    assert.deepEqual(requests, []);

    await saveOrUpdateProject({ ...design, pricingSettings }, null);
    assert.equal(requests.length, 1);
    assert.deepEqual(
      JSON.parse(requests[0].options.body).design.pricingSettings,
      pricingSettings,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
