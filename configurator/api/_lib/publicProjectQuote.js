import { ROOF_PRODUCTS, WALL_PRODUCTS } from '../../src/data/pricing.js';
import { calculateEstimate } from '../../src/lib/pricingEngine.js';
import { facetKey } from '../../src/lib/roofRulerParser.js';
import { parseStudioLayers } from '../../src/lib/studioRecovery.js';
import { parseAppliCadXMLServer } from './serverRoofRulerParser.js';

const productOverrides = (overrides = {}) => Object.fromEntries(
  Object.entries(overrides).flatMap(([key, value]) => (
    value?.productId ? [[key, value.productId]] : []
  )),
);

export function calculatePublicProjectQuote({
  design,
  materialRows = [],
  parseLayers = (layers) => parseStudioLayers(layers, parseAppliCadXMLServer),
} = {}) {
  if (!design || design.version !== 2) return null;
  const parsedResult = parseLayers(design.house?.layers || []);
  const parsedLayers = Array.isArray(parsedResult) ? parsedResult : parsedResult?.parsedLayers;
  if (!Array.isArray(parsedLayers)) throw new TypeError('Layer parser returned an invalid result');
  const faces = (type) => parsedLayers.flatMap((layer) => (
    layer.visible === false ? [] : (layer.parsed?.faces || [])
      .filter((face) => face.type === type)
      .map((face) => ({ key: facetKey(layer.id, face.id), sizeSf: Number(face.sizeSf) || 0 }))
  ));
  const materialById = new Map(materialRows.map((row) => [row.id, {
    id: row.id,
    label: row.name,
    kind: row.kind === 'wall' ? 'wall' : 'roof',
    pricePerSqft: Number(row.price_per_sqft) || 0,
  }]));
  (design.catalogSnapshot?.materials || []).forEach((row) => {
    materialById.set(row.id, {
      id: row.id,
      label: row.name || row.label,
      kind: row.kind === 'wall' ? 'wall' : 'roof',
      pricePerSqft: Number(row.pricePerSqft ?? row.price_per_sqft) || 0,
    });
  });
  const customProducts = [...materialById.values()];
  const estimate = calculateEstimate(design.measurements || {}, {
    roofProduct: design.roofProductId,
    wallProduct: design.wallProductId,
    roofProducts: [...ROOF_PRODUCTS, ...customProducts.filter((product) => product.kind !== 'wall')],
    wallProducts: [...WALL_PRODUCTS, ...customProducts.filter((product) => product.kind === 'wall')],
    roofFaces: faces('Roof'),
    wallFaces: faces('Wall'),
    facetOverrides: design.uniformFinish ? {} : productOverrides(design.facetOverrides),
    services: design.services || {},
    trimAccents: design.trimAccents,
    gutterOption: design.gutterOptionId,
    downspoutOption: design.downspoutOptionId,
    manualDiscount: design.manualDiscount,
    ...(design.pricingSettings || {}),
    customServiceLines: design.customServiceLines || [],
  });

  return { total: estimate.total, currency: 'CAD' };
}

export async function buildPublicProjectQuote(sql, projectId, design) {
  const materialRows = await sql`
    select m.id, m.name, m.kind, m.price_per_sqft
    from materials m
    where m.owner_id = (select owner_id from projects where id = ${projectId})
  `;
  return calculatePublicProjectQuote({ design, materialRows });
}
