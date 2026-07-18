import { getEditProjectId } from './projectNavigation.js';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
}

// The complete canonical serialization is retained instead of a short hash so
// equality cannot be affected by hash collisions or object insertion order.
export function designFingerprint(design) {
  return JSON.stringify(canonicalize(design));
}

// Capture the editable project named by the page URL at mount. The returned
// one-shot claim deliberately never reads location again: project opens and
// saves update ?edit= in-session, and must not become delayed startup restores.
export function createInitialEditRestore(initialSearch) {
  const initialProjectId = getEditProjectId(initialSearch);
  let claimed = false;

  return {
    claim(designDefaultsReady) {
      if (!designDefaultsReady || claimed || !initialProjectId) return null;
      claimed = true;
      return initialProjectId;
    },
    cancel() {
      claimed = true;
    },
  };
}

// Project rows may be fetched as soon as authentication settles, before the
// account-specific fallback normalizer is available. Keep those reads pending
// and resolve them through the stable application callback once defaults are
// ready, so callers cannot advance project identity ahead of design state.
export function createDeferredDesignApplication() {
  let applyWhenReady = null;
  let pending = [];

  return {
    apply(snapshot) {
      if (applyWhenReady) {
        return Promise.resolve().then(() => applyWhenReady(snapshot));
      }
      return new Promise((resolve, reject) => {
        pending.push({ snapshot, resolve, reject });
      });
    },
    setReady(applyDesign) {
      applyWhenReady = applyDesign;
      const queued = pending;
      pending = [];
      queued.forEach(({ snapshot, resolve, reject }) => {
        Promise.resolve()
          .then(() => applyDesign(snapshot))
          .then(resolve, reject);
      });
    },
  };
}

// Authenticated owner writes must include the account pricing snapshot.
// Public customer flows use pricing already frozen into their shared design
// and never wait on the authenticated settings endpoint.
export function getDesignPersistenceState({
  isCustomerView,
  companySettingsSettled,
  effectivePricingSettings,
}) {
  if (isCustomerView) return { ready: true, message: '' };
  if (!companySettingsSettled) {
    return {
      ready: false,
      message: 'Loading pricing settings… Saving and sharing will be available shortly.',
    };
  }
  if (!effectivePricingSettings) {
    return {
      ready: false,
      message: 'Pricing settings are unavailable. Refresh before saving or sharing this design.',
    };
  }
  return { ready: true, message: '' };
}

export function getProjectOperationState({
  accountSettled = false,
  defaultsReady = false,
  persistenceReady = false,
} = {}) {
  const canOpen = accountSettled;
  const canWrite = accountSettled && defaultsReady && persistenceReady;
  return {
    canOpen,
    canSave: canWrite,
    canShare: canWrite,
    message: canWrite ? '' : 'Loading account project defaults…',
  };
}

export function getProjectSaveStatus({
  currentProjectId,
  currentDesignFingerprint,
  persistedDesignFingerprint,
  persistenceReady = true,
}) {
  if (!currentProjectId) return 'Not saved';
  if (!persistenceReady) return 'Loading pricing…';
  return persistedDesignFingerprint && currentDesignFingerprint === persistedDesignFingerprint
    ? 'Saved'
    : 'Unsaved changes';
}
