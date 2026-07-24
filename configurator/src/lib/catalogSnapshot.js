const asArray = (value) => (Array.isArray(value) ? value : []);

export function normalizeMaterialSnapshot(material = {}) {
  return {
    id: material.id,
    name: material.name ?? material.label,
    kind: material.kind === 'wall' ? 'wall' : 'roof',
    pricePerSqft: Number(material.pricePerSqft ?? material.price_per_sqft) || 0,
    profiles: asArray(material.profiles),
    colorIds: asArray(material.colorIds ?? material.color_ids),
  };
}

export function normalizeColorSnapshot(color = {}) {
  return {
    id: color.id,
    name: color.name,
    code: color.code || '',
    hex: color.hex || '#888888',
    series: color.series || 'Custom',
    thumbnail: color.thumbnail ?? color.thumbnail_url,
  };
}

const byId = (rows) => new Map(asArray(rows).filter((row) => row?.id).map((row) => [row.id, row]));

export function buildSelectedCatalogSnapshot({
  existing,
  materials = [],
  colors = [],
  materialIds = [],
  colorIds = [],
} = {}) {
  const frozenMaterials = byId(existing?.materials);
  const liveMaterials = byId(materials);
  const frozenColors = byId(existing?.colors);
  const liveColors = byId(colors);
  const unique = (ids) => [...new Set(asArray(ids).filter(Boolean))];

  return {
    version: 1,
    materials: unique(materialIds).flatMap((id) => {
      const row = frozenMaterials.get(id) ?? liveMaterials.get(id);
      return row ? [normalizeMaterialSnapshot(row)] : [];
    }),
    colors: unique(colorIds).flatMap((id) => {
      const row = frozenColors.get(id) ?? liveColors.get(id);
      return row ? [normalizeColorSnapshot(row)] : [];
    }),
  };
}

export function mergeCatalogSnapshots(liveRows = [], frozenRows = []) {
  const merged = new Map(asArray(liveRows).filter((row) => row?.id).map((row) => [row.id, row]));
  asArray(frozenRows).forEach((row) => {
    if (row?.id) merged.set(row.id, row);
  });
  return [...merged.values()];
}
