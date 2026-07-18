import { normalizeTrimAccents, syncTrimAccentsToLegacy } from './trimAccents.js';

export const DEFAULT_OPTIONAL_SERVICE_PRICING_METHOD = 'per_unit';

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function nonEmptyText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

// `customServiceLines` is an established persistence/pricing interface whose
// identity and estimator fields are id/qty/price. This adapter gives every
// legacy or current line the richer presentation contract without requiring a
// catalog migration or teaching the pricing engine a duplicate schema.
export function adaptCustomServiceLine(line = {}) {
  const quantity = line.quantity ?? line.qty;
  const unitPrice = line.unitPrice ?? line.price;
  return {
    id: line.id ?? '',
    name: nonEmptyText(line.name, 'Custom service'),
    description: String(line.description ?? ''),
    pricingMethod: nonEmptyText(line.pricingMethod, DEFAULT_OPTIONAL_SERVICE_PRICING_METHOD),
    quantity: nonNegativeNumber(quantity),
    unit: nonEmptyText(line.unit, 'each'),
    unitPrice: nonNegativeNumber(unitPrice),
    selected: typeof line.selected === 'boolean' ? line.selected : true,
    locked: line.locked === true,
  };
}

export function adaptCustomServiceLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => adaptCustomServiceLine(line));
}

// Convert a presentation edit back to the existing line shape. Spreading the
// original retains API-originated identity/context fields while qty and price
// remain the authoritative aliases consumed by pricingEngine.js.
export function optionalServiceToCustomServiceLine(service, original = {}) {
  const normalized = adaptCustomServiceLine(service);
  return {
    ...original,
    id: normalized.id,
    name: normalized.name,
    unit: normalized.unit,
    price: normalized.unitPrice,
    qty: normalized.quantity,
    unitPrice: normalized.unitPrice,
    quantity: normalized.quantity,
    description: normalized.description,
    linkUrl: original.linkUrl ?? original.link_url,
    pricingMethod: normalized.pricingMethod,
    selected: normalized.selected,
    locked: normalized.locked,
  };
}

export function normalizeCustomServiceLines(lines) {
  return (Array.isArray(lines) ? lines : []).map((line) => (
    optionalServiceToCustomServiceLine(adaptCustomServiceLine(line), line)
  ));
}

// Serializes the parts of App's state that define a customer's design so it
// can be embedded in a standalone HTML export or stored behind a shareable
// link, then restored on load. Deliberately excludes ephemeral UI state
// (viewerMode, selectedFacet) and the photo overlay (a local preview aid,
// not part of the design itself).
export function captureDesignState(state) {
  const trimAccents = normalizeTrimAccents({
    trimAccents: state.trimAccents,
    measurements: state.measurements,
    accessoryColors: state.accessoryColors,
    lockedServices: state.lockedServices,
  });
  const legacyTrimState = state.trimAccents === undefined
    ? {
        measurements: state.measurements,
        accessoryColors: state.accessoryColors,
        lockedServices: state.lockedServices,
      }
    : syncTrimAccentsToLegacy(trimAccents, state);
  return {
    version: 2,
    brandId: state.brandId,
    house: {
      jobNumber: state.house.jobNumber,
      customerName: state.house.customerName,
      address: state.house.address,
      layers: state.house.layers,
    },
    layerOffsets: state.layerOffsets,
    roofProductId: state.roofProductId,
    roofProfile: state.roofProfile,
    roofColorId: state.roofColorId,
    wallProductId: state.wallProductId,
    wallProfile: state.wallProfile,
    wallColorId: state.wallColorId,
    services: state.services,
    lockedServices: legacyTrimState.lockedServices,
    gutterOptionId: state.gutterOptionId,
    downspoutOptionId: state.downspoutOptionId,
    measurements: legacyTrimState.measurements,
    manualDiscount: state.manualDiscount,
    accessoryColors: legacyTrimState.accessoryColors,
    // Canonical trim quantities remain in the same Imperial base units used
    // by legacy measurements and pricing. Older designs derive this additive
    // field from those legacy values when they are reopened.
    trimAccents,
    uniformFinish: state.uniformFinish,
    facetOverrides: state.facetOverrides,
    // Resolved custom-service selections (name/price/etc. copied from the
    // owner's catalog at save time, not just a catalog id) — so a shared
    // link still shows/prices them correctly even if the owner later edits
    // or deletes that catalog entry.
    customServiceLines: state.customServiceLines ?? [],
    // Freezes the GST/package-deal rates that applied when this design was
    // saved. Company Settings are per-owner and admin-editable — without
    // this, a customer reopening an already-shared/quoted design later would
    // see the price recalculated at whatever rates the owner has *since*
    // changed, instead of the numbers they were actually quoted.
    pricingSettings: state.pricingSettings ?? null,
  };
}

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const hasLegacyValue = (snapshot, key) => hasOwn(snapshot, key) && snapshot[key] !== null && snapshot[key] !== undefined;

// Expands a sparse version-2 snapshot to the exact shape captureDesignState
// will emit after it is applied. Legacy snapshots deliberately inherit fields
// they did not persist from the caller's current defaults; using that same
// completed object for both apply and dirty-state fingerprinting prevents a
// restore from looking like a user edit.
export function normalizeDesignState(snapshot, fallbackState) {
  if (!snapshot || snapshot.version !== 2) return null;

  const merged = { ...fallbackState };
  for (const key of [
    'brandId',
    'layerOffsets',
    'roofProductId',
    'roofProfile',
    'roofColorId',
    'wallProductId',
    'wallProfile',
    'wallColorId',
    'services',
    'lockedServices',
    'gutterOptionId',
    'downspoutOptionId',
    'measurements',
    'accessoryColors',
    'trimAccents',
    'facetOverrides',
    'customServiceLines',
    'pricingSettings',
  ]) {
    if (hasLegacyValue(snapshot, key)) merged[key] = snapshot[key];
  }
  // A pre-Task-6 snapshot has no canonical trim collection. Do not retain
  // fallback trim records here: captureDesignState must derive them from the
  // legacy measurements/colors/locks that came from this snapshot.
  if (!hasLegacyValue(snapshot, 'trimAccents')) merged.trimAccents = undefined;
  if (hasLegacyValue(snapshot, 'house') && typeof snapshot.house === 'object') {
    merged.house = { ...fallbackState.house };
    for (const key of ['jobNumber', 'customerName', 'address', 'layers']) {
      if (hasLegacyValue(snapshot.house, key)) merged.house[key] = snapshot.house[key];
    }
  }
  if (hasLegacyValue(snapshot, 'manualDiscount') && typeof snapshot.manualDiscount === 'number') {
    merged.manualDiscount = snapshot.manualDiscount;
  }
  if (hasLegacyValue(snapshot, 'uniformFinish') && typeof snapshot.uniformFinish === 'boolean') {
    merged.uniformFinish = snapshot.uniformFinish;
  }

  return captureDesignState(merged);
}

// Captures one account/new-project fallback and keeps it independent from
// every project subsequently applied to App state. Re-parsing the serialized
// baseline also ensures callers never receive object/array references that a
// project edit could mutate and leak into the next legacy normalization.
export function createStableDesignNormalizer(fallbackState) {
  const stableFallback = JSON.stringify(captureDesignState(fallbackState));
  return (snapshot) => normalizeDesignState(snapshot, JSON.parse(stableFallback));
}

async function gzipDecompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Decodes a design embedded in a legacy ?d= shareable URL. The UI for
// creating these links was removed, but previously copied links keep
// working through this decode path.
export async function decodeDesignFromUrl(encoded) {
  const marker = encoded[0];
  const bytes = base64UrlToBytes(encoded.slice(1));
  if (marker === 'z') {
    return JSON.parse(await gzipDecompress(bytes));
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Reads a previously-captured design state, tolerating missing/old fields
// (falls back to whatever the caller's current defaults already are).
// Version 1 snapshots (pre-Layers, fixed roofXml/wallXml + separate
// roofOverrides/wallOverrides) predate this shape and can't be migrated
// automatically since layer ids didn't exist yet — those old shareable
// links/HTML exports stop loading; this is an accepted MVP-stage break.
export function applyDesignState(snapshot, setters) {
  if (!snapshot || snapshot.version !== 2) return;
  const fields = [
    ['brandId', 'setBrandId'],
    ['layerOffsets', 'setLayerOffsets'],
    ['roofProductId', 'setRoofProductId'],
    ['roofProfile', 'setRoofProfile'],
    ['roofColorId', 'setRoofColorId'],
    ['wallProductId', 'setWallProductId'],
    ['wallProfile', 'setWallProfile'],
    ['wallColorId', 'setWallColorId'],
    ['services', 'setServices'],
    ['lockedServices', 'setLockedServices'],
    ['gutterOptionId', 'setGutterOptionId'],
    ['downspoutOptionId', 'setDownspoutOptionId'],
    ['measurements', 'setMeasurements'],
    ['accessoryColors', 'setAccessoryColors'],
    ['trimAccents', 'setTrimAccents'],
    ['facetOverrides', 'setFacetOverrides'],
    ['customServiceLines', 'setCustomServiceLines'],
    ['pricingSettings', 'setPricingSettings'],
  ];

  if (hasOwn(snapshot, 'house') && snapshot.house && typeof snapshot.house === 'object') {
    setters.setHouse((house) => ({ ...house, ...snapshot.house }));
  }
  for (const [key, setter] of fields) {
    if (!hasOwn(snapshot, key)) continue;
    // trimAccents is additive: older embedders may still provide the complete
    // pre-Task-6 setter contract. Keep that one new setter optional without
    // weakening the required-setter behavior for every established field.
    if (key === 'trimAccents' && typeof setters[setter] !== 'function') continue;
    setters[setter](snapshot[key]);
  }
  if (hasOwn(snapshot, 'manualDiscount') && typeof snapshot.manualDiscount === 'number') {
    setters.setManualDiscount(snapshot.manualDiscount);
  }
  if (hasOwn(snapshot, 'uniformFinish') && typeof snapshot.uniformFinish === 'boolean') {
    setters.setUniformFinish(snapshot.uniformFinish);
  }
}
