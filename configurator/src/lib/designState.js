// Serializes the parts of App's state that define a customer's design so it
// can be embedded in a standalone HTML export or stored behind a shareable
// link, then restored on load. Deliberately excludes ephemeral UI state
// (viewerMode, selectedFacet) and the photo overlay (a local preview aid,
// not part of the design itself).
export function captureDesignState(state) {
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
    lockedServices: state.lockedServices,
    gutterOptionId: state.gutterOptionId,
    downspoutOptionId: state.downspoutOptionId,
    measurements: state.measurements,
    manualDiscount: state.manualDiscount,
    accessoryColors: state.accessoryColors,
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
    'facetOverrides',
    'customServiceLines',
    'pricingSettings',
  ]) {
    if (hasLegacyValue(snapshot, key)) merged[key] = snapshot[key];
  }
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
    ['facetOverrides', 'setFacetOverrides'],
    ['customServiceLines', 'setCustomServiceLines'],
    ['pricingSettings', 'setPricingSettings'],
  ];

  if (hasOwn(snapshot, 'house') && snapshot.house && typeof snapshot.house === 'object') {
    setters.setHouse((house) => ({ ...house, ...snapshot.house }));
  }
  for (const [key, setter] of fields) {
    if (hasOwn(snapshot, key)) setters[setter](snapshot[key]);
  }
  if (hasOwn(snapshot, 'manualDiscount') && typeof snapshot.manualDiscount === 'number') {
    setters.setManualDiscount(snapshot.manualDiscount);
  }
  if (hasOwn(snapshot, 'uniformFinish') && typeof snapshot.uniformFinish === 'boolean') {
    setters.setUniformFinish(snapshot.uniformFinish);
  }
}
