// Pricing sourced from BookIPI_Items_QuickBooks_Import.csv / PROJECT_BRIEF.md section 5.
// All prices are supply + install unless noted. Keep in sync with QuickBooks exports
// until the Phase 2 Make.com live-fetch replaces this hardcoded table.

export const ROOF_PRODUCTS = [
  { id: 'snaplock', label: '1" SnapLock Metal Roofing', pricePerSqft: 9.0 },
  { id: 'standing-seam-1in', label: '1" Mechanical Standing Seam', pricePerSqft: 12.0 },
  { id: 'standing-seam-1_5in-rib', label: 'Mechanical Standing Seam 1.5" Rib', pricePerSqft: 12.0 },
  { id: 'european-tiles', label: 'European Tiles (Monterey / Bond)', pricePerSqft: 10.0 },
  { id: 'metal-shingles', label: 'Interlocking Metal Shingles (VicWest / Superseamless)', pricePerSqft: 14.0 },
  { id: 'diamond-shingles', label: 'Diamond Shape Shingles', pricePerSqft: 25.0 },
];

export const ROOF_PROFILES = {
  snaplock: ['9" coverage', '12" coverage', '13" coverage'],
  'standing-seam-1in': ['Schlebach 25mm'],
  'standing-seam-1_5in-rib': ['SSQ', 'SSH', 'SSR'],
  'european-tiles': ['Monterey', 'Bond'],
  'metal-shingles': ['VicWest', 'Superseamless'],
  'diamond-shingles': ['Standard diamond'],
};

export const WALL_PRODUCTS = [
  { id: 'metal-siding', label: 'Metal Siding (vertical or horizontal)', pricePerSqft: 14.0 },
  { id: 'standing-seam-cladding', label: 'Standing Seam Cladding (concealed fastener)', pricePerSqft: 12.0 },
  { id: 'floating-insulation-cladding', label: 'Cladding w/ Floating Insulation', pricePerSqft: 30.0 },
];

export const WALL_PROFILES = {
  'metal-siding': ['6" Plank', '8" Plank', '6" Board & Batten', '8" Board & Batten', '10" Board & Batten', '6" Dutch Lap', '8" Dutch Lap', '10" Dutch Lap'],
  'standing-seam-cladding': ['Concealed fastener, narrow rib'],
  'floating-insulation-cladding': ['Concealed fastener over insulation'],
};

export const GUTTER_OPTIONS = [
  { id: '5in-kstyle', label: '5" K-Style Eavestrough', pricePerLf: 10.0 },
  { id: '6in-kstyle', label: '6" K-Style Eavestrough', pricePerLf: 10.0 },
  { id: '7in-commercial', label: '7" Commercial Eavestrough', pricePerLf: 20.0 },
];

// Independently selectable, not tied to the gutter profile — matches the
// three real QuickBooks downspout line items.
export const DOWNSPOUT_OPTIONS = [
  { id: '3in-round', label: '3" Round Downspout', pricePerLf: 10.0 },
  { id: '4in-round', label: '4" Round Downspout', pricePerLf: 10.0 },
  { id: '3x3-square', label: '3x3 Square Downspout', pricePerLf: 10.0 },
];

// Owner-added materials from the Materials Library (Phase 6) — same
// fetch-once-push-in pattern as setExtraColors() in colors.js, so every
// existing ROOF_PRODUCTS/WALL_PRODUCTS lookup (pricingEngine's product
// resolution, ProductSelector's dropdown, FacetInspector's per-facet
// override picker) picks up custom materials without changing how each of
// those call sites works.
// The merged arrays are built once here (not on every allRoofProducts()/
// allWallProducts() call) — App.jsx calls calculateEstimate/exportPdf/
// exportEstimate several times per render and per export pass, each doing
// its own product lookups, so rebuilding via spread on every call adds up
// and also hands components a fresh array reference each time (defeating
// any reference-equality memoization downstream).
let extraRoofProducts = [];
let extraWallProducts = [];
let mergedRoofProducts = ROOF_PRODUCTS;
let mergedWallProducts = WALL_PRODUCTS;

export function setExtraMaterials({ roof, wall } = {}) {
  extraRoofProducts = Array.isArray(roof) ? roof : [];
  extraWallProducts = Array.isArray(wall) ? wall : [];
  mergedRoofProducts = extraRoofProducts.length ? [...ROOF_PRODUCTS, ...extraRoofProducts] : ROOF_PRODUCTS;
  mergedWallProducts = extraWallProducts.length ? [...WALL_PRODUCTS, ...extraWallProducts] : WALL_PRODUCTS;
}

export function allRoofProducts() {
  return mergedRoofProducts;
}

export function allWallProducts() {
  return mergedWallProducts;
}

export const ACCESSORY_PRICING = {
  soffit: { label: 'Soffit', pricePerSqft: 10.0 },
  fascia: { label: 'Fascia', pricePerLf: 10.0 },
  snowRetention: { label: 'Snow Retention (double bar)', pricePerLf: 50.0 },
  capFlashing: { label: 'Cap Flashings (install)', pricePerLf: 7.0 },
  garageDoorCapping: { label: 'Garage Door Capping (supply + install)', pricePerLf: 12.0 },
};
