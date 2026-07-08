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
    measurements: state.measurements,
    manualDiscount: state.manualDiscount,
    accessoryColors: state.accessoryColors,
    uniformFinish: state.uniformFinish,
    facetOverrides: state.facetOverrides,
  };
}

async function gzipCompress(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gzipDecompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buf);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Encodes a design snapshot for a shareable URL — no backend involved, the
// whole design (including layer XML) round-trips through the link itself.
// Gzip-compressed when the browser supports it (XML compresses well), with a
// plain-base64 fallback for older browsers.
export async function encodeDesignForUrl(state) {
  const json = JSON.stringify(state);
  if (typeof CompressionStream !== 'undefined') {
    const bytes = await gzipCompress(json);
    return 'z' + bytesToBase64Url(bytes);
  }
  return 'p' + bytesToBase64Url(new TextEncoder().encode(json));
}

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
  if (snapshot.measurements) setters.setMeasurements(snapshot.measurements);
  if (typeof snapshot.manualDiscount === 'number') setters.setManualDiscount(snapshot.manualDiscount);
  if (snapshot.accessoryColors) setters.setAccessoryColors(snapshot.accessoryColors);
  if (typeof snapshot.uniformFinish === 'boolean') setters.setUniformFinish(snapshot.uniformFinish);
  if (snapshot.facetOverrides) setters.setFacetOverrides(snapshot.facetOverrides);
}
