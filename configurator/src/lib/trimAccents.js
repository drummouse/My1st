import {
  areaUnit,
  feetToDisplay,
  linearUnit,
  squareFeetToDisplay,
} from './units.js';

export const STANDARD_TRIM_KINDS = Object.freeze([
  'soffit',
  'fascia',
  'gutters',
  'downspouts',
  'garage_doors',
  'other_trims',
]);

export const TRIM_KIND_LABELS = Object.freeze({
  soffit: 'Soffit',
  fascia: 'Fascia',
  gutters: 'Gutters',
  downspouts: 'Downspouts',
  garage_doors: 'Garage Doors',
  other_trims: 'Other Trims',
});

const CANONICAL_UNITS = new Set(['linear_feet', 'square_feet']);
const STANDARD_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'soffit',
    kind: 'soffit',
    measurementKey: 'soffitSqft',
    colorKey: 'soffit',
    lockKey: 'soffit',
    serviceKey: 'soffit',
    canonicalUnit: 'square_feet',
  }),
  Object.freeze({
    id: 'fascia',
    kind: 'fascia',
    measurementKey: 'fasciaLf',
    colorKey: 'fascia',
    lockKey: 'fascia',
    serviceKey: 'fascia',
    canonicalUnit: 'linear_feet',
  }),
  Object.freeze({
    id: 'gutters',
    kind: 'gutters',
    measurementKey: 'gutterLf',
    colorKey: 'gutters',
    lockKey: 'gutters',
    serviceKey: 'gutters',
    canonicalUnit: 'linear_feet',
  }),
  Object.freeze({
    id: 'downspouts',
    kind: 'downspouts',
    measurementKey: 'downspoutLf',
    colorKey: 'downspouts',
    lockKey: 'downspouts',
    serviceKey: 'downspouts',
    canonicalUnit: 'linear_feet',
  }),
  Object.freeze({
    id: 'garage_doors',
    kind: 'garage_doors',
    measurementKey: 'garageDoorCappingLf',
    colorKey: 'garageDoorCapping',
    lockKey: 'garageDoorCapping',
    serviceKey: 'garageDoorCapping',
    canonicalUnit: 'linear_feet',
  }),
  Object.freeze({
    id: 'other_trims',
    kind: 'other_trims',
    measurementKey: 'capFlashingLf',
    colorKey: 'capFlashing',
    lockKey: 'capFlashing',
    serviceKey: 'capFlashing',
    canonicalUnit: 'linear_feet',
  }),
]);

const STANDARD_IDS = new Set(STANDARD_DEFINITIONS.map(({ id }) => id));
const STANDARD_DEFINITION_BY_KIND = new Map(
  STANDARD_DEFINITIONS.map((definition) => [definition.kind, definition]),
);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key);

function finiteQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

function requireText(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} is required`);
  return text;
}

function requireCanonicalUnit(value) {
  if (!CANONICAL_UNITS.has(value)) {
    throw new TypeError(`Invalid canonical trim unit: ${String(value)}`);
  }
  return value;
}

function nullablePrice(value) {
  if (value == null) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function textList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

export function practicalProductLabel(productLabel, profile = '') {
  const product = String(productLabel ?? '').trim();
  const practicalProfile = String(profile ?? '').trim();
  if (!practicalProfile) return product;
  if (!product) return practicalProfile;
  if (product.toLocaleLowerCase().includes(practicalProfile.toLocaleLowerCase())) return product;
  return `${product} — ${practicalProfile}`;
}

export function productBaseLabel(productLabel, profile = '') {
  const product = String(productLabel ?? '').trim();
  const practicalProfile = String(profile ?? '').trim();
  if (!practicalProfile) return product;
  const suffix = ` — ${practicalProfile}`;
  return product.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())
    ? product.slice(0, -suffix.length).trim()
    : product;
}

export function canonicalTrimUnit(unit) {
  return /sq|square|area|m²/i.test(String(unit ?? '')) ? 'square_feet' : 'linear_feet';
}

export function createTrimAccent({
  id,
  kind,
  productId = '',
  profile = '',
  colorId = '',
  quantity = 0,
  canonicalUnit,
  selected = true,
  locked = false,
  customLabel,
  productLabel,
  baseProductLabel,
  sourceOptionId,
  source,
  unit,
  unitPrice,
  profileOptions,
  compatibleColorIds,
} = {}) {
  const normalizedKind = requireText(kind, 'kind');
  if (!STANDARD_TRIM_KINDS.includes(normalizedKind)) {
    throw new TypeError(`Invalid trim kind: ${normalizedKind}`);
  }
  const record = {
    id: requireText(id, 'id'),
    kind: normalizedKind,
    productId: String(productId ?? ''),
    profile: String(profile ?? ''),
    colorId: String(colorId ?? ''),
    quantity: finiteQuantity(quantity),
    canonicalUnit: requireCanonicalUnit(canonicalUnit),
    selected: selected === true,
    locked: locked === true,
  };
  if (customLabel !== undefined) record.customLabel = String(customLabel);
  const rawProductLabel = productLabel ?? productId;
  const stableBaseLabel = baseProductLabel !== undefined
    ? String(baseProductLabel ?? '').trim()
    : productBaseLabel(rawProductLabel, profile);
  const practicalLabel = practicalProductLabel(stableBaseLabel || rawProductLabel, profile);
  if (practicalLabel) record.productLabel = practicalLabel;
  if (stableBaseLabel && (baseProductLabel !== undefined || productLabel !== undefined)) {
    record.baseProductLabel = stableBaseLabel;
  }
  if (sourceOptionId !== undefined) record.sourceOptionId = String(sourceOptionId);
  if (source !== undefined) record.source = String(source);
  if (unit !== undefined) record.unit = String(unit);
  if (unitPrice !== undefined) record.unitPrice = nullablePrice(unitPrice);
  if (profileOptions !== undefined) record.profileOptions = textList(profileOptions);
  if (compatibleColorIds !== undefined) record.compatibleColorIds = textList(compatibleColorIds);
  return record;
}

function additionalTrimId() {
  if (globalThis.crypto?.randomUUID) return `trim-${globalThis.crypto.randomUUID()}`;
  return `trim-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createAdditionalTrimAccent({
  id = additionalTrimId(),
  customLabel = 'Additional Trim',
  productId = '',
  profile = '',
  colorId = '',
  quantity = 0,
  canonicalUnit = 'linear_feet',
  selected = true,
  locked = false,
  productLabel,
  baseProductLabel,
  sourceOptionId,
  source,
  unit,
  unitPrice,
  profileOptions,
  compatibleColorIds,
} = {}) {
  return createTrimAccent({
    id,
    kind: 'other_trims',
    productId,
    profile,
    colorId,
    quantity,
    canonicalUnit,
    selected,
    locked,
    customLabel,
    productLabel,
    baseProductLabel,
    sourceOptionId,
    source,
    unit,
    unitPrice,
    profileOptions,
    compatibleColorIds,
  });
}

export function createLibraryTrimAccent(option, {
  id = additionalTrimId(),
  label = option?.label,
  quantity = 0,
  unit = option?.unit || 'LF',
  locked = false,
  colorId = option?.colorIds?.[0] || '',
} = {}) {
  const productLabel = practicalProductLabel(label, option?.profileLabel);
  return createAdditionalTrimAccent({
    id,
    customLabel: String(label || productLabel || 'Library trim'),
    productId: String(option?.id ?? ''),
    profile: String(option?.profileLabel ?? ''),
    colorId,
    productLabel,
    sourceOptionId: String(option?.id ?? ''),
    source: String(option?.source ?? 'library'),
    quantity,
    canonicalUnit: canonicalTrimUnit(unit),
    unit,
    unitPrice: option?.unitPrice,
    profileOptions: option?.profiles ?? (option?.profileLabel ? [option.profileLabel] : []),
    compatibleColorIds: option?.colorIds ?? [],
    selected: true,
    locked,
  });
}

export function isLibraryTrimOption(option) {
  return option?.kind === 'product'
    && option?.active !== false
    && STANDARD_DEFINITION_BY_KIND.has(String(option?.trimKind ?? ''));
}

export function catalogOptionIdentity(option) {
  const source = String(option?.source ?? 'library');
  const optionId = String(option?.sourceOptionId ?? option?.optionId ?? option?.id ?? '');
  return optionId ? `${source}:${optionId}` : '';
}

/**
 * Selects a Presentation catalog option into its explicit trim-kind record.
 * Product metadata is frozen onto the design so reopening it does not depend
 * on the current Library row.
 */
export function upsertLibraryTrimProduct(records, option, { quantities = {} } = {}) {
  const trimKind = String(option?.trimKind ?? '');
  const definition = STANDARD_DEFINITION_BY_KIND.get(trimKind);
  if (!definition) throw new TypeError(`Invalid Library trim kind: ${trimKind || '(missing)'}`);

  const currentRecords = Array.isArray(records) ? records : [];
  if (trimKind === 'other_trims') {
    const identity = catalogOptionIdentity(option);
    const existing = currentRecords.find((record) => (
      record?.customLabel !== undefined && catalogOptionIdentity(record) === identity
    ));
    const nextRecord = createLibraryTrimAccent(option, {
      id: existing?.id,
      quantity: existing?.quantity ?? quantities[trimKind] ?? 0,
      unit: option?.unit,
      locked: existing?.locked === true,
      colorId: existing?.colorId || option?.colorIds?.[0] || '',
    });
    if (!existing) return [...currentRecords, nextRecord];
    return currentRecords.map((record) => (record === existing ? nextRecord : record));
  }

  const existing = explicitStandardRecord(currentRecords, definition);
  const nextRecord = createTrimAccent({
    ...(existing || {}),
    id: existing?.id ?? definition.id,
    kind: definition.kind,
    productId: String(option?.id ?? ''),
    profile: String(option?.profileLabel ?? option?.profiles?.[0] ?? ''),
    profileOptions: option?.profiles ?? (option?.profileLabel ? [option.profileLabel] : []),
    colorId: existing?.colorId || option?.colorIds?.[0] || '',
    compatibleColorIds: option?.colorIds ?? [],
    quantity: existing?.quantity ?? quantities[trimKind] ?? 0,
    canonicalUnit: definition.canonicalUnit,
    selected: true,
    locked: existing?.locked === true,
    productLabel: option?.label,
    sourceOptionId: option?.id,
    source: option?.source ?? 'library',
    unit: option?.unit,
    unitPrice: option?.unitPrice,
  });

  if (!existing) return [...currentRecords, nextRecord];
  return currentRecords.map((record) => (record === existing ? nextRecord : record));
}

export function selectLibraryTrimProduct(records, option, config) {
  return upsertLibraryTrimProduct(records, option, config);
}

function legacyStandardRecord(definition, {
  measurements = {}, accessoryColors = {}, lockedServices = {}, services = {},
}) {
  return createTrimAccent({
    id: definition.id,
    kind: definition.kind,
    productId: '',
    profile: '',
    colorId: accessoryColors[definition.colorKey] ?? '',
    quantity: measurements[definition.measurementKey] ?? 0,
    canonicalUnit: definition.canonicalUnit,
    selected: services[definition.serviceKey] === true,
    locked: lockedServices[definition.lockKey] === true,
  });
}

function explicitStandardRecord(records, definition) {
  return records.find((record) => record?.id === definition.id)
    ?? records.find((record) => (
      record?.kind === definition.kind && !hasOwn(record, 'customLabel')
    ));
}

function normalizeExplicitRecord(record, fallback) {
  return createTrimAccent({
    ...fallback,
    ...record,
    id: record?.id ?? fallback.id,
    kind: record?.kind ?? fallback.kind,
    canonicalUnit: fallback.canonicalUnit,
  });
}

export function createStandardTrimAccents(legacy = {}) {
  return STANDARD_DEFINITIONS
    .filter((definition) => (
      definition.kind !== 'garage_doors' || legacy.services?.garageDoorCapping === true
    ))
    .map((definition) => legacyStandardRecord(definition, legacy));
}

export function normalizeTrimAccents({
  trimAccents,
  measurements = {},
  accessoryColors = {},
  lockedServices = {},
  services = {},
} = {}) {
  const explicit = Array.isArray(trimAccents) ? trimAccents : [];
  const legacy = { measurements, accessoryColors, lockedServices, services };
  const includedDefinitions = STANDARD_DEFINITIONS.filter((definition) => (
    definition.kind !== 'garage_doors'
    || explicitStandardRecord(explicit, definition)
    || services.garageDoorCapping === true
  ));
  const standards = includedDefinitions.map((definition) => {
    const fallback = legacyStandardRecord(definition, legacy);
    const record = explicitStandardRecord(explicit, definition);
    return record ? normalizeExplicitRecord(record, fallback) : fallback;
  });
  const standardRecords = new Set(
    includedDefinitions.map((definition) => explicitStandardRecord(explicit, definition)).filter(Boolean),
  );
  const additions = explicit
    .filter((record) => !standardRecords.has(record) && !STANDARD_IDS.has(record?.id))
    .map((record) => createTrimAccent(record));
  return [...standards, ...additions];
}

export function trimDisplayUnit(canonicalUnit, unitSystem) {
  requireCanonicalUnit(canonicalUnit);
  if (canonicalUnit === 'square_feet') return areaUnit(unitSystem);
  const unit = linearUnit(unitSystem);
  return unit === 'ft' ? 'LF' : unit;
}

export function displayTrimQuantity(quantity, canonicalUnit, unitSystem) {
  requireCanonicalUnit(canonicalUnit);
  return canonicalUnit === 'square_feet'
    ? squareFeetToDisplay(finiteQuantity(quantity), unitSystem)
    : feetToDisplay(finiteQuantity(quantity), unitSystem);
}

export function trimQuantityFromDisplay(quantity, canonicalUnit, unitSystem) {
  requireCanonicalUnit(canonicalUnit);
  const displayQuantity = finiteQuantity(quantity);
  const displayPerCanonicalUnit = displayTrimQuantity(1, canonicalUnit, unitSystem);
  return displayQuantity / displayPerCanonicalUnit;
}

export function syncTrimAccentsToLegacy(
  trimAccents,
  { measurements = {}, accessoryColors = {}, lockedServices = {} } = {},
) {
  const nextMeasurements = { ...measurements };
  const nextAccessoryColors = { ...accessoryColors };
  const nextLockedServices = { ...lockedServices };

  for (const definition of STANDARD_DEFINITIONS) {
    const record = explicitStandardRecord(trimAccents ?? [], definition);
    if (!record) continue;
    const quantity = finiteQuantity(record.quantity);
    const colorId = String(record.colorId ?? '');
    const locked = record.locked === true;
    // Preserve sparse legacy object shapes when the canonical value is the
    // same as the legacy implicit default. Non-default canonical values and
    // existing keys are always projected, so pricing/export remains aligned.
    if (hasOwn(nextMeasurements, definition.measurementKey) || quantity !== 0) {
      nextMeasurements[definition.measurementKey] = quantity;
    }
    if (hasOwn(nextAccessoryColors, definition.colorKey) || colorId) {
      nextAccessoryColors[definition.colorKey] = colorId;
    }
    if (hasOwn(nextLockedServices, definition.lockKey) || locked) {
      nextLockedServices[definition.lockKey] = locked;
    }
  }

  return {
    measurements: nextMeasurements,
    accessoryColors: nextAccessoryColors,
    lockedServices: nextLockedServices,
  };
}
