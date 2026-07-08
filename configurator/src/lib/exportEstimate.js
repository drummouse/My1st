import { colorById } from '../data/colors.js';
import { ROOF_PRODUCTS, WALL_PRODUCTS } from '../data/pricing.js';

export const money = (n) => n.toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });

const ACCESSORY_LABELS = { soffit: 'Soffit', fascia: 'Fascia', gutters: 'Gutters', downspouts: 'Downspouts' };

export function describeFacetOverrides(overrides, products, roleLabel) {
  return Object.entries(overrides || {}).map(([key, val]) => {
    const faceId = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
    const product = val.productId ? products.find((p) => p.id === val.productId) : null;
    const color = val.colorId ? colorById(val.colorId) : null;
    const parts = [];
    if (product) parts.push(product.label);
    if (color) parts.push(`${color.name} (${color.code})`);
    return `${roleLabel} Facet ${faceId}: ${parts.join(', ') || 'custom'}`;
  });
}

// One row per facet, always — every slope/segment gets its effective
// product+color spelled out (default or overridden), not just the ones the
// customer changed, so a mixed-material house is fully documented.
export function buildFacetTable(facesForPricing, overrides, products, globalProductId, globalColorId) {
  return facesForPricing
    .map(({ key, sizeSf }) => {
      const faceId = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
      const override = overrides?.[key];
      const productId = override?.productId || globalProductId;
      const colorId = override?.colorId || globalColorId;
      const product = products.find((p) => p.id === productId);
      return {
        label: faceId,
        productLabel: product?.label || productId,
        color: colorById(colorId),
        sizeSf,
        customized: !!(override?.productId || override?.colorId),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function buildEstimateText({
  brand, house, roofProduct, roofColorId, roofProfile, wallProduct, wallColorId, wallProfile, estimate,
  services, accessoryColors, uniformFinish, facetOverrides,
  roofFacesForPricing, wallFacesForPricing,
}) {
  const roofColor = colorById(roofColorId);
  const wallColor = colorById(wallColorId);
  const lines = [];
  lines.push(`${brand.name} — Design & Estimate Summary`);
  lines.push(brand.tagline);
  lines.push('='.repeat(50));
  lines.push('');
  lines.push(`Job: ${house.jobNumber}`);
  lines.push(`Customer: ${house.customerName}`);
  lines.push(`Address: ${house.address}`);
  lines.push(`Date: ${new Date().toLocaleDateString('en-CA')}`);
  lines.push('');
  lines.push('SELECTIONS');
  lines.push('-'.repeat(50));
  lines.push(`Roof material: ${roofProduct.label} (${roofProfile || 'standard profile'})`);
  lines.push(`Roof color: ${roofColor.code} — ${roofColor.name}`);
  lines.push(`Siding material: ${wallProduct.label} (${wallProfile || 'standard profile'})`);
  lines.push(`Siding color: ${wallColor.code} — ${wallColor.name}`);
  if (services && accessoryColors) {
    Object.entries(ACCESSORY_LABELS)
      .filter(([key]) => services[key])
      .forEach(([key, label]) => {
        const c = colorById(accessoryColors[key]);
        lines.push(`${label} color: ${c.code} — ${c.name}`);
      });
  }

  const renderFacetRows = (title, facesForPricing, overrides, products, globalProductId, globalColorId) => {
    if (!facesForPricing?.length) return;
    const rows = buildFacetTable(facesForPricing, uniformFinish ? {} : overrides, products, globalProductId, globalColorId);
    lines.push('');
    lines.push(title);
    lines.push('-'.repeat(50));
    rows.forEach((row) => {
      const mark = row.customized ? '*' : ' ';
      lines.push(
        `${mark} ${String(row.label).padEnd(6)} ${row.productLabel.padEnd(30)} ${row.color.code.padEnd(12)} ${row.color.name.padEnd(18)} ${row.sizeSf.toLocaleString(undefined, { maximumFractionDigits: 1 })} sqft`
      );
    });
  };
  renderFacetRows('ROOF SLOPES (* = customized, differs from default above)', roofFacesForPricing, facetOverrides, ROOF_PRODUCTS, roofProduct.id, roofColorId);
  renderFacetRows('WALL SEGMENTS (* = customized, differs from default above)', wallFacesForPricing, facetOverrides, WALL_PRODUCTS, wallProduct.id, wallColorId);

  lines.push('');
  lines.push('PRICE BREAKDOWN');
  lines.push('-'.repeat(50));
  estimate.lineItems.forEach((li) => {
    lines.push(`${li.label.padEnd(46)} ${li.qty.toLocaleString()} ${li.unit}  ${money(li.total)}`);
  });
  lines.push('-'.repeat(50));
  lines.push(`Subtotal: ${money(estimate.subtotal)}`);
  if (estimate.deals.fullWrap) {
    lines.push(`Full Wrap discount (7%): -${money(estimate.deals.fullWrapDiscountAmount)}`);
  }
  if (estimate.manualDiscount > 0) {
    lines.push(`Additional discount: -${money(estimate.manualDiscount)}`);
  }
  lines.push(`Pre-tax total: ${money(estimate.preTaxTotal)}`);
  lines.push(`GST (${(estimate.gstRate * 100).toFixed(0)}%): ${money(estimate.gst)}`);
  lines.push(`TOTAL ESTIMATE: ${money(estimate.total)}`);
  lines.push('');
  lines.push('This is a preliminary estimate generated by the IronWrap 3D Configurator.');
  lines.push('Final pricing subject to on-site verification and signed contract.');
  return lines.join('\n');
}

export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
