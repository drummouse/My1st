const SERVICE_KEYS = Object.freeze([
  'roof',
  'wall',
  'soffit',
  'fascia',
  'gutters',
  'downspouts',
  'snowRetention',
  'capFlashing',
  'garageDoorCapping',
]);

const MEASUREMENT_KEYS = Object.freeze([
  'soffitSqft',
  'fasciaLf',
  'gutterLf',
  'downspoutLf',
  'snowRetentionLf',
  'capFlashingLf',
  'garageDoorCappingLf',
]);

const ACCESSORY_COLOR_KEYS = Object.freeze([
  'soffit',
  'fascia',
  'gutters',
  'downspouts',
  'garageDoorCapping',
  'capFlashing',
]);

const asArray = (value) => (Array.isArray(value) ? value : []);
const isRecord = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const publicRecords = (value) => asArray(value).filter(isRecord);
const asRecord = (value) => (
  isRecord(value) ? value : {}
);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const publicText = (value) => (typeof value === 'string' ? value : undefined);
const publicNumber = (value) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const publicBoolean = (value) => (typeof value === 'boolean' ? value : undefined);
const publicTextList = (value) => asArray(value).filter((item) => typeof item === 'string');

function projectRecord(value, keys, projector) {
  const record = asRecord(value);
  return Object.fromEntries(keys.flatMap((key) => {
    if (!hasOwn(record, key)) return [];
    const projected = projector(record[key], key);
    return projected === undefined ? [] : [[key, projected]];
  }));
}

const publicLayer = (layer = {}) => projectRecord(layer, [
  'id', 'name', 'xml', 'visible',
], (value, key) => (key === 'visible' ? publicBoolean(value) : publicText(value)));

function publicHouse(value) {
  const house = asRecord(value);
  return {
    ...projectRecord(house, ['jobNumber', 'customerName', 'address'], publicText),
    ...(Array.isArray(house.layers)
      ? { layers: publicRecords(house.layers).map(publicLayer) }
      : {}),
  };
}

function publicLayerOffsets(value, layerIds) {
  return Object.fromEntries(Object.entries(asRecord(value)).flatMap(([layerId, offset]) => (
    layerIds.has(layerId)
      ? [[layerId, projectRecord(offset, ['dx', 'dy', 'dz'], publicNumber)]]
      : []
  )));
}

function publicFacetOverrides(value, layerIds) {
  const allowedPrefixes = [...layerIds].map((layerId) => `${layerId}:`);
  return Object.fromEntries(Object.entries(asRecord(value)).flatMap(([facetId, override]) => (
    allowedPrefixes.some((prefix) => facetId.startsWith(prefix))
      ? [[facetId, projectRecord(override, ['productId', 'colorId'], publicText)]]
      : []
  )));
}

const publicTrimRecord = (record = {}) => ({
  id: publicText(record.id),
  kind: publicText(record.kind),
  productId: publicText(record.productId),
  profile: publicText(record.profile),
  colorId: publicText(record.colorId),
  quantity: publicNumber(record.quantity),
  canonicalUnit: publicText(record.canonicalUnit),
  selected: record.selected === true,
  ...(typeof record.customLabel === 'string' ? { customLabel: record.customLabel } : {}),
});

const publicMaterialSnapshot = (material = {}) => ({
  id: publicText(material.id),
  name: publicText(material.name ?? material.label),
  kind: material.kind === 'wall' ? 'wall' : 'roof',
  profiles: publicTextList(material.profiles),
  colorIds: publicTextList(material.colorIds ?? material.color_ids),
});

const publicColorSnapshot = (color = {}) => ({
  id: publicText(color.id),
  name: publicText(color.name),
  code: publicText(color.code) || '',
  hex: publicText(color.hex) || '#888888',
  series: publicText(color.series) || 'Custom',
  thumbnail: publicText(color.thumbnail ?? color.thumbnail_url),
});

// Public project and standalone payloads intentionally retain only the
// customer-visible design needed to rebuild the model. Every nested record is
// projected independently so an allowlisted container can never carry private
// or future admin fields through a shallow copy. Pricing rules, manual
// discounts, lock policy, and priced service lines stay server/private-side.
export function toPublicDesign(design) {
  if (!design || design.version !== 2) return null;
  const house = publicHouse(design.house);
  const layerIds = new Set(asArray(house.layers)
    .map((layer) => layer.id)
    .filter((id) => typeof id === 'string'));

  return {
    version: 2,
    brandId: publicText(design.brandId),
    house,
    layerOffsets: publicLayerOffsets(design.layerOffsets, layerIds),
    roofProductId: publicText(design.roofProductId),
    roofProfile: publicText(design.roofProfile),
    roofColorId: publicText(design.roofColorId),
    wallProductId: publicText(design.wallProductId),
    wallProfile: publicText(design.wallProfile),
    wallColorId: publicText(design.wallColorId),
    services: projectRecord(design.services, SERVICE_KEYS, publicBoolean),
    gutterOptionId: publicText(design.gutterOptionId),
    downspoutOptionId: publicText(design.downspoutOptionId),
    measurements: projectRecord(design.measurements, MEASUREMENT_KEYS, publicNumber),
    accessoryColors: projectRecord(design.accessoryColors, ACCESSORY_COLOR_KEYS, publicText),
    trimAccents: publicRecords(design.trimAccents).map(publicTrimRecord),
    uniformFinish: design.uniformFinish !== false,
    facetOverrides: publicFacetOverrides(design.facetOverrides, layerIds),
    catalogSnapshot: {
      version: publicNumber(design.catalogSnapshot?.version) || 1,
      materials: publicRecords(design.catalogSnapshot?.materials).map(publicMaterialSnapshot),
      colors: publicRecords(design.catalogSnapshot?.colors).map(publicColorSnapshot),
    },
  };
}
