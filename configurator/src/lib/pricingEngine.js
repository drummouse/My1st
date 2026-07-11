import { GUTTER_OPTIONS, DOWNSPOUT_OPTIONS, ACCESSORY_PRICING, allRoofProducts, allWallProducts } from '../data/pricing.js';

// Fallback base tax rate when an owner hasn't configured a tax region yet
// (Alberta GST — this app's original single hardcoded rate).
export const GST_RATE = 0.05;

// Searches the baseline catalog plus any owner-added Materials Library
// entries (allRoofProducts()/allWallProducts() — see data/pricing.js) so a
// project referencing a custom material still prices and labels correctly.
const findRoofProduct = (id) => allRoofProducts().find((p) => p.id === id) || allRoofProducts()[0];
const findWallProduct = (id) => allWallProducts().find((p) => p.id === id) || allWallProducts()[0];
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

// The three package deals this app has always offered, expressed as data.
// Seeded whenever an owner hasn't defined their own `discountRules` yet (a
// brand-new settings row, or one saved before this feature existed) so
// pricing is byte-identical to the old hardcoded behavior until an admin
// actually edits a rule in the Discounts panel.
//
// A rule's effect is `{ type: 'percent'|'free', value?, serviceKey? }`:
// omitting `serviceKey` on a 'percent' effect means "off the whole
// pre-discount subtotal" (Full Wrap); giving it means "off that one line
// item only" (Soffit + Fascia, Gutters + Downspouts).
export function buildDefaultDiscountRules({
  fullWrapDiscountPct = 0.07,
  soffitFasciaDiscountPct = 0.5,
  gutterDownspoutFree = true,
} = {}) {
  return [
    {
      id: 'full-wrap',
      name: 'Full Wrap package',
      appliesToServices: ['roof', 'wall', 'soffit', 'fascia', 'gutters', 'downspouts'],
      requireAll: true,
      effect: { type: 'percent', value: fullWrapDiscountPct },
    },
    {
      id: 'soffit-fascia',
      name: 'Soffit + Fascia package',
      appliesToServices: ['soffit', 'fascia'],
      requireAll: true,
      effect: { type: 'percent', value: soffitFasciaDiscountPct, serviceKey: 'fascia' },
    },
    ...(gutterDownspoutFree
      ? [{
          id: 'gutter-downspout',
          name: 'Gutters + Downspouts package',
          appliesToServices: ['gutters', 'downspouts'],
          requireAll: true,
          effect: { type: 'free', serviceKey: 'downspouts' },
        }]
      : []),
  ];
}

// A rule "applies" when every (or, with requireAll: false, any) service it
// lists is active. "Active" for roof/wall means actually priced (nonzero
// total), not just checked — a roof-only project never counts as a wall
// service for matching purposes, matching the old fullWrap logic exactly.
function ruleApplies(rule, active) {
  const keys = rule.appliesToServices || [];
  if (!keys.length) return false;
  return rule.requireAll === false ? keys.some((k) => active[k]) : keys.every((k) => active[k]);
}

// Applies a matching service-level rule (if any) to one qty*rate accessory
// line and records it in appliedDiscounts — the single mechanism every
// accessory service uses, not just the two (fascia, downspouts) the
// original hardcoded deals happened to touch. DiscountsPanel.jsx lets an
// admin target any of soffit/fascia/gutters/downspouts/snowRetention/
// capFlashing/garageDoorCapping, so all of them need to actually consult a
// matching rule, or a rule saved against one of the others would silently
// do nothing. (Roof/wall are deliberately not routed through this helper —
// each is a *group* of possibly several per-facet-override line items, not
// one line, so a proportional-per-item split would be needed to keep the
// itemized breakdown summing to the discounted subtotal; not attempted here.)
function buildAccessoryLine(key, label, qty, unit, rate, serviceRuleFor, appliedDiscounts) {
  const base = qty * rate;
  const rule = serviceRuleFor(key);
  let discount = 0;
  let lineLabel = label;
  if (rule) {
    discount = rule.effect.type === 'free' ? base : base * rule.effect.value;
    lineLabel += rule.effect.type === 'free' ? ` (FREE — ${rule.name})` : ` (${Math.round(rule.effect.value * 100)}% off — ${rule.name})`;
    appliedDiscounts.push({
      id: rule.id, name: rule.name, scope: 'service', serviceKey: key, amount: discount,
      summary: rule.effect.type === 'free' ? `✓ ${rule.name} — ${label} free` : `✓ ${rule.name} — ${Math.round(rule.effect.value * 100)}% off ${label}`,
    });
  }
  return { key, label: lineLabel, qty, unit, rate, total: base - discount };
}

/**
 * @param {object} measurements - { soffitSqft, fasciaLf, gutterLf, downspoutLf, snowRetentionLf, capFlashingLf, garageDoorCappingLf }
 * @param {object} selections - { roofProduct, wallProduct, roofFaces, wallFaces, facetOverrides,
 *   services: {soffit,fascia,gutters,downspouts,snowRetention,capFlashing,garageDoorCapping},
 *   gutterOption, downspoutOption, manualDiscount, discountRules,
 *   fullWrapDiscountPct, soffitFasciaDiscountPct, gutterDownspoutFree (legacy fallback if discountRules absent),
 *   gstRate, municipalTaxRate, taxLabel }
 *   roofFaces/wallFaces: [{ key, sizeSf }]; facetOverrides: { [key]: productId } (roof/wall keys are
 *   disjoint since they come from distinct layer:faceId facet keys, so the same map is used for both)
 */
export function calculateEstimate(measurements, selections) {
  const line = [];
  const services = selections.services || {};

  const roofGroups = services.roof
    ? groupFacetsByProduct(selections.roofFaces, selections.facetOverrides, selections.roofProduct, findRoofProduct, 'Roofing')
    : { items: [], total: 0 };
  line.push(...roofGroups.items);
  const roofTotal = roofGroups.total;

  const wallGroups = services.wall
    ? groupFacetsByProduct(selections.wallFaces, selections.facetOverrides, selections.wallProduct, findWallProduct, 'Siding')
    : { items: [], total: 0 };
  line.push(...wallGroups.items);
  const wallTotal = wallGroups.total;

  const active = {
    roof: roofTotal > 0,
    wall: wallTotal > 0,
    soffit: !!services.soffit,
    fascia: !!services.fascia,
    gutters: !!services.gutters,
    downspouts: !!services.downspouts,
    snowRetention: !!services.snowRetention,
    capFlashing: !!services.capFlashing,
    garageDoorCapping: !!services.garageDoorCapping,
  };

  const discountRules = selections.discountRules?.length
    ? selections.discountRules
    : buildDefaultDiscountRules({
        fullWrapDiscountPct: selections.fullWrapDiscountPct,
        soffitFasciaDiscountPct: selections.soffitFasciaDiscountPct,
        gutterDownspoutFree: selections.gutterDownspoutFree,
      });

  // A muted rule stays saved (DiscountsPanel keeps showing/editing it) but
  // never actually applies to an estimate — the admin-facing "won't show in
  // Estimator" toggle.
  const matchedRules = discountRules.filter((r) => !r.muted && ruleApplies(r, active));
  // A subtotal-wide rule wins outright and suppresses narrower, service-level
  // rules — mirrors the old "Full Wrap beats the two narrower deals" rule.
  const subtotalRule = matchedRules.find((r) => r.effect?.type === 'percent' && !r.effect.serviceKey);
  const serviceRules = subtotalRule
    ? []
    : matchedRules.filter((r) => r.effect?.serviceKey && (r.effect.type === 'percent' || r.effect.type === 'free'));
  const serviceRuleFor = (key) => serviceRules.find((r) => r.effect.serviceKey === key);

  const appliedDiscounts = [];

  let soffitTotal = 0;
  if (services.soffit) {
    const li = buildAccessoryLine('soffit', ACCESSORY_PRICING.soffit.label, measurements.soffitSqft, 'sqft', ACCESSORY_PRICING.soffit.pricePerSqft, serviceRuleFor, appliedDiscounts);
    soffitTotal = li.total;
    line.push(li);
  }

  let fasciaTotal = 0;
  if (services.fascia) {
    const li = buildAccessoryLine('fascia', ACCESSORY_PRICING.fascia.label, measurements.fasciaLf, 'LF', ACCESSORY_PRICING.fascia.pricePerLf, serviceRuleFor, appliedDiscounts);
    fasciaTotal = li.total;
    line.push(li);
  }

  const gutterOption = findGutter(selections.gutterOption);
  let gutterTotal = 0;
  if (services.gutters) {
    const li = buildAccessoryLine('gutters', gutterOption.label, measurements.gutterLf, 'LF', gutterOption.pricePerLf, serviceRuleFor, appliedDiscounts);
    gutterTotal = li.total;
    line.push(li);
  }

  const downspoutOption = findDownspout(selections.downspoutOption);
  let downspoutTotal = 0;
  if (services.downspouts) {
    const li = buildAccessoryLine('downspouts', downspoutOption.label, measurements.downspoutLf, 'LF', downspoutOption.pricePerLf, serviceRuleFor, appliedDiscounts);
    downspoutTotal = li.total;
    line.push(li);
  }

  let snowRetentionTotal = 0;
  if (services.snowRetention) {
    const li = buildAccessoryLine('snowRetention', ACCESSORY_PRICING.snowRetention.label, measurements.snowRetentionLf, 'LF', ACCESSORY_PRICING.snowRetention.pricePerLf, serviceRuleFor, appliedDiscounts);
    snowRetentionTotal = li.total;
    line.push(li);
  }

  let capFlashingTotal = 0;
  if (services.capFlashing) {
    const li = buildAccessoryLine('capFlashing', ACCESSORY_PRICING.capFlashing.label, measurements.capFlashingLf, 'LF', ACCESSORY_PRICING.capFlashing.pricePerLf, serviceRuleFor, appliedDiscounts);
    capFlashingTotal = li.total;
    line.push(li);
  }

  let garageDoorCappingTotal = 0;
  if (services.garageDoorCapping) {
    const li = buildAccessoryLine('garageDoorCapping', ACCESSORY_PRICING.garageDoorCapping.label, measurements.garageDoorCappingLf, 'LF', ACCESSORY_PRICING.garageDoorCapping.pricePerLf, serviceRuleFor, appliedDiscounts);
    garageDoorCappingTotal = li.total;
    line.push(li);
  }

  // Owner-defined custom services — a simple qty * price line each, frozen
  // at the name/price/description/link the project was saved with (the
  // caller resolves these from the owner's catalog before calling here; see
  // App.jsx's buildDesignSnapshot). Not matched against discountRules —
  // package deals only ever referenced the fixed service keys.
  const customServiceLines = (selections.customServiceLines || []).filter((cs) => Number(cs.qty) > 0);
  let customServicesTotal = 0;
  customServiceLines.forEach((cs) => {
    const total = Number(cs.qty) * Number(cs.price);
    customServicesTotal += total;
    line.push({
      key: `custom-${cs.id}`, label: cs.name, qty: Number(cs.qty), unit: cs.unit || 'each', rate: Number(cs.price), total,
      description: cs.description || undefined, linkUrl: cs.linkUrl || undefined,
    });
  });

  const subtotal = roofTotal + wallTotal + soffitTotal + fasciaTotal + gutterTotal + downspoutTotal + snowRetentionTotal + capFlashingTotal + garageDoorCappingTotal + customServicesTotal;

  const subtotalDiscount = subtotalRule ? subtotal * subtotalRule.effect.value : 0;
  if (subtotalRule) {
    appliedDiscounts.unshift({
      id: subtotalRule.id, name: subtotalRule.name, scope: 'subtotal', amount: subtotalDiscount, pct: subtotalRule.effect.value,
      summary: `✓ ${subtotalRule.name} — ${Math.round(subtotalRule.effect.value * 100)}% off total`,
    });
  }

  const manualDiscount = Math.max(0, Number(selections.manualDiscount) || 0);
  const preTaxTotal = Math.max(0, subtotal - subtotalDiscount - manualDiscount);

  // Effective tax rate = jurisdiction's base rate (GST/HST/state — whatever
  // the owner's tax region resolves to) plus an optional local/municipal
  // add-on, summed into the one rate this app has always applied here.
  const baseTaxRate = selections.gstRate ?? GST_RATE;
  const municipalTaxRate = selections.municipalTaxRate ?? 0;
  const taxRate = baseTaxRate + municipalTaxRate;
  const taxLabel = selections.taxLabel || 'GST';
  const taxAmount = preTaxTotal * taxRate;
  const total = preTaxTotal + taxAmount;

  return {
    // A zero-quantity line (e.g. "Siding" with no wall layer imported, or an
    // unselected accessory) isn't worth showing — but a package-deal line
    // that's genuinely included at a discounted $0 total (qty > 0) still is.
    lineItems: line.filter((li) => li.qty > 0),
    subtotal,
    appliedDiscounts,
    manualDiscount,
    preTaxTotal,
    baseTaxRate,
    municipalTaxRate,
    taxRate,
    taxLabel,
    taxAmount,
    total,
  };
}
