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
    customServiceLines: state.customServiceLines || [],
    // Freezes the GST/package-deal rates that applied when this design was
    // saved. Company Settings are per-owner and admin-editable — without
    // this, a customer reopening an already-shared/quoted design later would
    // see the price recalculated at whatever rates the owner has *since*
    // changed, instead of the numbers they were actually quoted.
    pricingSettings: state.pricingSettings || null,
  };
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
  if (snapshot.brandId) setters.setBrandId(snapshot.brandId);
  if (snapshot.house) setters.setHouse((h) => ({ ...h, ...snapshot.house }));
  if (snapshot.layerOffsets) setters.setLayerOffsets(snapshot.layerOffsets);
  if (snapshot.roofProductId) setters.setRoofProductId(snapshot.roofProductId);
  if (snapshot.roofProfile) setters.setRoofProfile(snapshot.roofProfile);
  if (snapshot.roofColorId) setters.setRoofColorId(snapshot.roofColorId);
  if (snapshot.wallProductId) setters.setWallProductId(snapshot.wallProductId);
  if (snapshot.wallProfile) setters.setWallProfile(snapshot.wallProfile);
  if (snapshot.wallColorId) setters.setWallColorId(snapshot.wallColorId);
  if (snapshot.services) setters.setServices(snapshot.services);
  if (snapshot.lockedServices) setters.setLockedServices(snapshot.lockedServices);
  if (snapshot.gutterOptionId) setters.setGutterOptionId(snapshot.gutterOptionId);
  if (snapshot.downspoutOptionId) setters.setDownspoutOptionId(snapshot.downspoutOptionId);
  if (snapshot.measurements) setters.setMeasurements(snapshot.measurements);
  if (typeof snapshot.manualDiscount === 'number') setters.setManualDiscount(snapshot.manualDiscount);
  if (snapshot.accessoryColors) setters.setAccessoryColors(snapshot.accessoryColors);
  if (typeof snapshot.uniformFinish === 'boolean') setters.setUniformFinish(snapshot.uniformFinish);
  if (snapshot.facetOverrides) setters.setFacetOverrides(snapshot.facetOverrides);
  if (snapshot.customServiceLines) setters.setCustomServiceLines(snapshot.customServiceLines);
  if (snapshot.pricingSettings) setters.setPricingSettings(snapshot.pricingSettings);
}
