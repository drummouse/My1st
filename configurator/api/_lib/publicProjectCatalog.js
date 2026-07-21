const arrayOrEmpty = (value) => (Array.isArray(value) ? value : []);

export function toPublicColor(row = {}) {
  return {
    id: row.id,
    name: row.name,
    code: row.code || '',
    hex: row.hex || '#888888',
    series: row.series || 'Custom',
    thumbnail: row.thumbnail_url || row.thumbnail || undefined,
  };
}

export function toPublicMaterial(row = {}) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === 'wall' ? 'wall' : 'roof',
    profiles: arrayOrEmpty(row.profiles),
    colorIds: arrayOrEmpty(row.color_ids ?? row.colorIds),
  };
}

// The project id is the public capability token. Tenant identity never enters
// the request and never leaves this boundary; only catalog records belonging
// to the shared project's owner can be selected by these subqueries.
const mergeById = (primary, fallback) => {
  const rows = new Map(fallback.map((row) => [row.id, row]));
  primary.forEach((row) => rows.set(row.id, row));
  return [...rows.values()];
};

export async function buildPublicProjectCatalog(sql, projectId, design) {
  const [colors, materialRows] = await Promise.all([
    sql`
      select c.id, c.name, c.code, c.hex, c.series, c.thumbnail_url
      from colors c
      where c.owner_id = (select owner_id from projects where id = ${projectId})
      order by c.created_at asc
    `,
    sql`
      select m.id, m.name, m.kind, m.profiles,
        coalesce(array_agg(mc.color_id) filter (where mc.color_id is not null), '{}') as color_ids
      from materials m
      left join material_colors mc on mc.material_id = m.id
      where m.owner_id = (select owner_id from projects where id = ${projectId})
      group by m.id
      order by m.created_at asc
    `,
  ]);

  return {
    colors: mergeById(
      (design?.catalogSnapshot?.colors || []).map(toPublicColor),
      colors.map(toPublicColor),
    ),
    materials: mergeById(
      (design?.catalogSnapshot?.materials || []).map(toPublicMaterial),
      materialRows.map(toPublicMaterial),
    ),
  };
}
