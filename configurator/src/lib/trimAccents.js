import {
  areaUnit,
  feetToDisplay,
  linearUnit,
  squareFeetToDisplay,
} from './units.js';

export const STANDARD_TRIM_KINDS = Object.freeze([
  'soffit',
  'fascia',
  'garage_doors',
  'other_trims',
]);

export const TRIM_KIND_LABELS = Object.freeze({
  soffit: 'Soffit',
  fascia: 'Fascia',
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
    canonicalUnit: 'square_feet',
  }),
  Object.freeze({
    id: 'fascia',
    kind: 'fascia',
    measurementKey: 'fasciaLf',
    colorKey: 'fascia',
    lockKey: 'fascia',
    canonicalUnit: 'linear_feet',
  }),
  Object.freeze({
    id: 'garage_doors',
    kind: 'garage_doors',
    measurementKey: 'garageDoorCappingLf',
    colorKey: 'garageDoorCapping',
    lockKey: 'garageDoorCapping',
    canonicalUnit: 'linear_feet',
  }),
  Object.freeze({
    id: 'other_trims',
    kind: 'other_trims',
    measurementKey: 'capFlashingLf',
    colorKey: 'capFlashing',
    lockKey: 'capFlashing',
    canonicalUnit: 'linear_feet',
  }),
]);

const STANDARD_IDS = new Set(STANDARD_DEFINITIONS.map(({ id }) => id));
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

export function createTrimAccent({
  id,
  kind,
  productId = '',
  profile = '',
  colorId = '',
  quantity = 0,
  canonicalUnit,
  locked = false,
  customLabel,
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
    locked: locked === true,
  };
  if (customLabel !== undefined) record.customLabel = String(customLabel);
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
  locked = false,
} = {}) {
  return createTrimAccent({
    id,
    kind: 'other_trims',
    productId,
    profile,
    colorId,
    quantity,
    canonicalUnit,
    locked,
    customLabel,
  });
}

function legacyStandardRecord(definition, { measurements = {}, accessoryColors = {}, lockedServices = {} }) {
  return createTrimAccent({
    id: definition.id,
    kind: definition.kind,
    productId: '',
    profile: '',
    colorId: accessoryColors[definition.colorKey] ?? '',
    quantity: measurements[definition.measurementKey] ?? 0,
    canonicalUnit: definition.canonicalUnit,
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
  return STANDARD_DEFINITIONS.map((definition) => legacyStandardRecord(definition, legacy));
}

export function normalizeTrimAccents({
  trimAccents,
  measurements = {},
  accessoryColors = {},
  lockedServices = {},
} = {}) {
  const explicit = Array.isArray(trimAccents) ? trimAccents : [];
  const legacy = { measurements, accessoryColors, lockedServices };
  const standards = STANDARD_DEFINITIONS.map((definition) => {
    const fallback = legacyStandardRecord(definition, legacy);
    const record = explicitStandardRecord(explicit, definition);
    return record ? normalizeExplicitRecord(record, fallback) : fallback;
  });
  const standardRecords = new Set(
    STANDARD_DEFINITIONS.map((definition) => explicitStandardRecord(explicit, definition)).filter(Boolean),
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
