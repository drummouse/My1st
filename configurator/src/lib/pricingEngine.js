import { ROOF_PRODUCTS, WALL_PRODUCTS, GUTTER_OPTIONS, DOWNSPOUT_OPTIONS, ACCESSORY_PRICING } from '../data/pricing.js';

// Alberta has no PST — only federal GST applies.
export const GST_RATE = 0.05;

const findRoofProduct = (id) => ROOF_PRODUCTS.find((p) => p.id === id) || ROOF_PRODUCTS[0];
const findWallProduct = (id) => WALL_PRODUCTS.find((p) => p.id === id) || WALL_PRODUCTS[0];
const findGutter = (id) => GUTTER_OPTIONS.find((g) => g.id === id) || GUTTER_OPTIONS[0];
const findDownspout = (id) => DOWNSPOUT_OPTIONS.find((d) => d.id === id) || DOWNSPOUT_OPTIONS[0];

// Groups facets by their effective product (per-facet override, falling back
// to the global product) and returns one line item per distinct product —
// collapses to a single line item when there are no overrides.
function groupFacetsByProduct(facets, overrides, globalProductId, findProduct, label) {
  const sqftByProduct = new Map();
  (facets || []).forEach(({ key, sizeSf }) => {
    const productId = (overrides && overrides[key]) || globalProductId;
    sqftByProduct.set(productId, (sqftByProduct.get(productId) || 0) + sizeSf);
  });
  if (sqftByProduct.size === 0) sqftByProduct.set(globalProductId, 0);

  const items = [...sqftByProduct.entries()].map(([productId, sqft]) => {
    const product = findProduct(productId);
    return {
      key: `${label.toLowerCase()}-${productId}`,
      label: `${label} — ${product.label}`,
      qty: sqft,
      unit: 'sqft',
      rate: product.pricePerSqft,
      total: sqft * product.pricePerSqft,
    };
  });
  return { items, total: items.reduce((sum, i) => sum + i.total, 0) };
}

/**
 * @param {object} measurements - { soffitSqft, fasciaLf, gutterLf, downspoutLf, snowRetentionLf, capFlashingLf, garageDoorCappingLf }
 * @param {object} selections - { roofProduct, wallProduct, roofFaces, wallFaces, facetOverrides,
 *   services: {soffit,fascia,gutters,downspouts,snowRetention,capFlashing,garageDoorCapping},
 *   gutterOption, downspoutOption, manualDiscount }
 *   roofFaces/wallFaces: [{ key, sizeSf }]; facetOverrides: { [key]: productId } (roof/wall keys are
 *   disjoint since they come from distinct layer:faceId facet keys, so the same map is used for both)
 */
export function calculateEstimate(measurements, selections) {
  const line = [];
  const services = selections.services || {};

  // Package deals are mutually exclusive, not stackable: Full Wrap (all four
  // accessory services selected) wins outright, and the two narrower deals
  // only kick in when Full Wrap doesn't apply.
  const fullWrap = !!(services.soffit && services.fascia && services.gutters && services.downspouts);

  const roofGroups = groupFacetsByProduct(selections.roofFaces, selections.facetOverrides, selections.roofProduct, findRoofProduct, 'Roofing');
  line.push(...roofGroups.items);
  const roofTotal = roofGroups.total;

  const wallGroups = groupFacetsByProduct(selections.wallFaces, selections.facetOverrides, selections.wallProduct, findWallProduct, 'Siding');
  line.push(...wallGroups.items);
  const wallTotal = wallGroups.total;

  let soffitTotal = 0;
  if (services.soffit) {
    soffitTotal = measurements.soffitSqft * ACCESSORY_PRICING.soffit.pricePerSqft;
    line.push({ key: 'soffit', label: ACCESSORY_PRICING.soffit.label, qty: measurements.soffitSqft, unit: 'sqft', rate: ACCESSORY_PRICING.soffit.pricePerSqft, total: soffitTotal });
  }

  let fasciaTotal = 0;
  let fasciaDiscount = 0;
  const soffitFasciaDeal = !!(services.soffit && services.fascia && !fullWrap);
  if (services.fascia) {
    const base = measurements.fasciaLf * ACCESSORY_PRICING.fascia.pricePerLf;
    fasciaDiscount = soffitFasciaDeal ? base * 0.5 : 0;
    fasciaTotal = base - fasciaDiscount;
    line.push({
      key: 'fascia',
      label: ACCESSORY_PRICING.fascia.label + (soffitFasciaDeal ? ' (50% off — soffit + fascia package)' : ''),
      qty: measurements.fasciaLf, unit: 'LF', rate: ACCESSORY_PRICING.fascia.pricePerLf, total: fasciaTotal,
    });
  }

  const gutterOption = findGutter(selections.gutterOption);
  let gutterTotal = 0;
  if (services.gutters) {
    gutterTotal = measurements.gutterLf * gutterOption.pricePerLf;
    line.push({ key: 'gutters', label: gutterOption.label, qty: measurements.gutterLf, unit: 'LF', rate: gutterOption.pricePerLf, total: gutterTotal });
  }

  const downspoutOption = findDownspout(selections.downspoutOption);
  let downspoutTotal = 0;
  const gutterDownspoutDeal = !!(services.gutters && services.downspouts && !fullWrap);
  if (services.downspouts) {
    const base = measurements.downspoutLf * downspoutOption.pricePerLf;
    downspoutTotal = gutterDownspoutDeal ? 0 : base;
    line.push({
      key: 'downspouts',
      label: downspoutOption.label + (gutterDownspoutDeal ? ' (FREE — gutters + downspouts package)' : ''),
      qty: measurements.downspoutLf, unit: 'LF', rate: downspoutOption.pricePerLf, total: downspoutTotal,
    });
  }

  let snowRetentionTotal = 0;
  if (services.snowRetention) {
    snowRetentionTotal = measurements.snowRetentionLf * ACCESSORY_PRICING.snowRetention.pricePerLf;
    line.push({ key: 'snowRetention', label: ACCESSORY_PRICING.snowRetention.label, qty: measurements.snowRetentionLf, unit: 'LF', rate: ACCESSORY_PRICING.snowRetention.pricePerLf, total: snowRetentionTotal });
  }

  let capFlashingTotal = 0;
  if (services.capFlashing) {
    capFlashingTotal = measurements.capFlashingLf * ACCESSORY_PRICING.capFlashing.pricePerLf;
    line.push({ key: 'capFlashing', label: ACCESSORY_PRICING.capFlashing.label, qty: measurements.capFlashingLf, unit: 'LF', rate: ACCESSORY_PRICING.capFlashing.pricePerLf, total: capFlashingTotal });
  }

  let garageDoorCappingTotal = 0;
  if (services.garageDoorCapping) {
    garageDoorCappingTotal = measurements.garageDoorCappingLf * ACCESSORY_PRICING.garageDoorCapping.pricePerLf;
    line.push({ key: 'garageDoorCapping', label: ACCESSORY_PRICING.garageDoorCapping.label, qty: measurements.garageDoorCappingLf, unit: 'LF', rate: ACCESSORY_PRICING.garageDoorCapping.pricePerLf, total: garageDoorCappingTotal });
  }

  const subtotal = roofTotal + wallTotal + soffitTotal + fasciaTotal + gutterTotal + downspoutTotal + snowRetentionTotal + capFlashingTotal + garageDoorCappingTotal;

  // Full Wrap: roof + walls + soffit + fascia + gutters + downspouts, 7% off total.
  const fullWrapDiscount = fullWrap ? subtotal * 0.07 : 0;

  const manualDiscount = Math.max(0, Number(selections.manualDiscount) || 0);
  const preTaxTotal = Math.max(0, subtotal - fullWrapDiscount - manualDiscount);
  const gst = preTaxTotal * GST_RATE;
  const total = preTaxTotal + gst;

  return {
    lineItems: line,
    subtotal,
    deals: {
      soffitFasciaDeal,
      fasciaDiscountAmount: fasciaDiscount,
      gutterDownspoutDeal,
      fullWrap,
      fullWrapDiscountAmount: fullWrapDiscount,
    },
    manualDiscount,
    preTaxTotal,
    gstRate: GST_RATE,
    gst,
    total,
  };
}
