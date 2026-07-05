import { ROOF_PRODUCTS, WALL_PRODUCTS, GUTTER_OPTIONS, ACCESSORY_PRICING } from '../data/pricing.js';

const findRoofProduct = (id) => ROOF_PRODUCTS.find((p) => p.id === id) || ROOF_PRODUCTS[0];
const findWallProduct = (id) => WALL_PRODUCTS.find((p) => p.id === id) || WALL_PRODUCTS[0];
const findGutter = (id) => GUTTER_OPTIONS.find((g) => g.id === id) || GUTTER_OPTIONS[0];

/**
 * @param {object} measurements - { roofSqft, wallSqft, soffitSqft, fasciaLf, gutterLf, downspoutLf, snowRetentionLf, capFlashingLf, garageDoorCappingLf }
 * @param {object} selections - { roofProduct, wallProduct, services: {soffit,fascia,gutters,downspouts,snowRetention,capFlashing,garageDoorCapping}, gutterOption }
 */
export function calculateEstimate(measurements, selections) {
  const line = [];
  const services = selections.services || {};

  const roofProduct = findRoofProduct(selections.roofProduct);
  const roofTotal = measurements.roofSqft * roofProduct.pricePerSqft;
  line.push({ key: 'roof', label: `Roofing — ${roofProduct.label}`, qty: measurements.roofSqft, unit: 'sqft', rate: roofProduct.pricePerSqft, total: roofTotal });

  const wallProduct = findWallProduct(selections.wallProduct);
  const wallTotal = measurements.wallSqft * wallProduct.pricePerSqft;
  line.push({ key: 'wall', label: `Siding — ${wallProduct.label}`, qty: measurements.wallSqft, unit: 'sqft', rate: wallProduct.pricePerSqft, total: wallTotal });

  let soffitTotal = 0;
  if (services.soffit) {
    soffitTotal = measurements.soffitSqft * ACCESSORY_PRICING.soffit.pricePerSqft;
    line.push({ key: 'soffit', label: ACCESSORY_PRICING.soffit.label, qty: measurements.soffitSqft, unit: 'sqft', rate: ACCESSORY_PRICING.soffit.pricePerSqft, total: soffitTotal });
  }

  let fasciaTotal = 0;
  let fasciaDiscount = 0;
  const soffitFasciaDeal = !!(services.soffit && services.fascia);
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

  let downspoutTotal = 0;
  const gutterDownspoutDeal = !!(services.gutters && services.downspouts);
  if (services.downspouts) {
    const base = measurements.downspoutLf * gutterOption.downspout.pricePerLf;
    downspoutTotal = gutterDownspoutDeal ? 0 : base;
    line.push({
      key: 'downspouts',
      label: gutterOption.downspout.label + (gutterDownspoutDeal ? ' (FREE — gutters + downspouts package)' : ''),
      qty: measurements.downspoutLf, unit: 'LF', rate: gutterOption.downspout.pricePerLf, total: downspoutTotal,
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
  const fullWrap = !!(services.soffit && services.fascia && services.gutters && services.downspouts);
  const fullWrapDiscount = fullWrap ? subtotal * 0.07 : 0;
  const total = subtotal - fullWrapDiscount;

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
    total,
  };
}
