const value = (row, snake, camel, fallback = undefined) => row?.[snake] ?? row?.[camel] ?? fallback;
const list = (input) => Array.isArray(input) ? input.filter((item) => typeof item === 'string' && item) : [];
const nullableNumber = (input) => {
  if (input == null) return null;
  const number = Number(input);
  return Number.isFinite(number) ? number : null;
};
const TRIM_KINDS = new Set(['soffit', 'fascia', 'gutters', 'downspouts', 'garage_doors', 'other_trims']);
const trimKind = (input) => TRIM_KINDS.has(input) ? input : null;

const isActive = (row) => {
  if (row?.active === false) return false;
  return value(row, 'lifecycle_status', 'lifecycleStatus', 'active') === 'active';
};

const isTenantVisible = (row, ownerId) => {
  const scope = value(row, 'scope', 'scope');
  const tenantId = value(row, 'tenant_id', 'tenantId', value(row, 'owner_id', 'ownerId', null));
  return scope === 'global' || (tenantId != null && tenantId === ownerId);
};

const option = ({ id, source, kind, label, unit, unitPrice, colorIds, profileLabel, trimKind: rawTrimKind, active = true }) => ({
  id: String(id),
  source,
  kind,
  label: String(label),
  unit: String(unit || 'each'),
  unitPrice: nullableNumber(unitPrice),
  colorIds: list(colorIds),
  profileLabel: typeof profileLabel === 'string' && profileLabel.trim() ? profileLabel : null,
  trimKind: trimKind(rawTrimKind),
  active: active === true,
});

const detailFor = (details, id) => details?.productDetails?.[id] || details?.[id] || {};

function fromLibraryRecord(record, details) {
  const detail = detailFor(details, record.id);
  const metadata = value(record, 'metadata', 'metadata', {}) || {};
  const applicationMetadata = value(detail, 'application_metadata', 'applicationMetadata', {}) || {};
  const kind = applicationMetadata.kind === 'service' || metadata.kind === 'service' ? 'service' : 'product';
  return option({
    id: record.id,
    source: 'library',
    kind,
    label: record.name,
    unit: value(detail, 'unit', 'unit', kind === 'product' ? 'sq ft' : 'each'),
    unitPrice: value(detail, 'price', 'price', null),
    colorIds: applicationMetadata.colorIds || metadata.colorIds || record.color_ids || record.colorIds,
    profileLabel: applicationMetadata.profileLabel || metadata.profileLabel || null,
    trimKind: applicationMetadata.trimKind || metadata.trimKind || null,
  });
}
function fromMaterial(record) {
  return option({
    id: record.id,
    source: 'material',
    kind: 'product',
    label: record.name,
    unit: 'sq ft',
    unitPrice: value(record, 'price_per_sqft', 'pricePerSqft', null),
    colorIds: record.color_ids || record.colorIds,
    profileLabel: list(record.profiles)[0] || null,
    trimKind: null,
  });
}

function fromCustomService(record) {
  return option({
    id: record.id,
    source: 'custom-service',
    kind: 'service',
    label: record.name,
    unit: record.unit || 'each',
    unitPrice: record.price ?? record.unit_price ?? record.unitPrice ?? null,
    colorIds: [],
    profileLabel: null,
    trimKind: null,
  });
}

/**
 * Converts owner-visible Library and legacy catalog rows to the only DTO that
 * authenticated selection controls may receive. Keep this browser adapter
 * aligned with api/_lib/libraryService.js's server equivalent.
 */
export function toTenantLibraryOptions(records = [], details = {}, ownerId) {
  const libraryRows = [];
  const materialRows = [...(Array.isArray(details?.materials) ? details.materials : [])];
  const serviceRows = [...(Array.isArray(details?.customServices) ? details.customServices : [])];

  (Array.isArray(records) ? records : []).forEach((record) => {
    const recordType = value(record, 'record_type', 'recordType', record?.type);
    if (recordType === 'material') materialRows.push(record);
    else if (recordType === 'custom-service') serviceRows.push(record);
    else if (recordType === 'product') libraryRows.push(record);
  });

  const visible = (record) => isActive(record) && isTenantVisible(record, ownerId);
  const selected = [
    ...libraryRows.filter(visible).map((record) => fromLibraryRecord(record, details)),
    ...materialRows.filter(visible).map(fromMaterial),
    ...serviceRows.filter(visible).map(fromCustomService),
  ];
  return {
    products: selected.filter((item) => item.kind === 'product'),
    services: selected.filter((item) => item.kind === 'service'),
  };
}
