// Clean, unambiguous per-type sequential labels for the PDF report — the raw
// RoofRuler face ids ("F1", "F23"...) can collide between a roof export and a
// wall export (both commonly use "F"-prefixed ids), so this assigns a fresh
// global numbering instead: R1, R2... for roof facets, F1, F2... for wall
// facets, and W/D/O for window/door/other openings.

function faceIdFromKey(key) {
  return key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
}

// { key -> "R3" | "F12" }, covering every roof and wall facet.
export function buildFacetLabelMap(roofFacesForPricing, wallFacesForPricing) {
  const byFaceId = (a, b) => faceIdFromKey(a.key).localeCompare(faceIdFromKey(b.key), undefined, { numeric: true });
  const map = {};
  [...(roofFacesForPricing || [])].sort(byFaceId).forEach((f, i) => { map[f.key] = `R${i + 1}`; });
  [...(wallFacesForPricing || [])].sort(byFaceId).forEach((f, i) => { map[f.key] = `F${i + 1}`; });
  return map;
}

const OPENING_PREFIXES = { window: 'W', door: 'D', other: 'O' };

// Adds a `label` (W1, D1, O1...) to each opening, numbered per kind in
// whatever order they were collected (stable given the same layers/faces).
export function labelOpenings(openings) {
  const counts = {};
  return (openings || []).map((o) => {
    const prefix = OPENING_PREFIXES[o.kind] || 'O';
    counts[prefix] = (counts[prefix] || 0) + 1;
    return { ...o, label: `${prefix}${counts[prefix]}` };
  });
}
