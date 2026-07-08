import { jsPDF } from 'jspdf';
import { colorById } from '../data/colors.js';
import { ROOF_PRODUCTS, WALL_PRODUCTS } from '../data/pricing.js';
import { money, buildFacetTable } from './exportEstimate.js';

const MARGIN = 40;
const PAGE_W = 612; // Letter, points
const PAGE_H = 792;
const ACCESSORY_LABELS = { soffit: 'Soffit', fascia: 'Fascia', gutters: 'Gutters', downspouts: 'Downspouts' };

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function buildEstimatePdf({
  brand, house, roofProduct, roofColorId, roofProfile, wallProduct, wallColorId, wallProfile, estimate,
  services, accessoryColors, uniformFinish, facetOverrides, snapshotDataUrl,
  roofFacesForPricing, wallFacesForPricing,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const [ar, ag, ab] = hexToRgb(brand.accent);
  let y = MARGIN;

  const ensureRoom = (needed) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Header
  doc.setFillColor(ar, ag, ab);
  doc.rect(0, 0, PAGE_W, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(brand.name, MARGIN, (y += 28));
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(brand.tagline, MARGIN, (y += 14));
  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleDateString('en-CA')}`, PAGE_W - MARGIN, y, { align: 'right' });

  y += 20;
  doc.setDrawColor(220);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Design & Estimate Summary', MARGIN, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Job: ${house.jobNumber}`, MARGIN, y); y += 14;
  doc.text(`Customer: ${house.customerName}`, MARGIN, y); y += 14;
  doc.text(`Address: ${house.address}`, MARGIN, y); y += 20;

  if (snapshotDataUrl) {
    try {
      const imgW = PAGE_W - MARGIN * 2;
      const imgH = imgW * 0.6;
      ensureRoom(imgH + 20);
      doc.addImage(snapshotDataUrl, 'PNG', MARGIN, y, imgW, imgH);
      y += imgH + 16;
    } catch {
      // Snapshot capture failed (e.g. unsupported browser) — skip the image, keep the text report.
    }
  }

  // Selections
  ensureRoom(100);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Selections', MARGIN, y); y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);

  const roofColor = colorById(roofColorId);
  const wallColor = colorById(wallColorId);
  const selectionLines = [
    `Roof material: ${roofProduct.label} (${roofProfile || 'standard profile'})`,
    `Roof color: ${roofColor.code} — ${roofColor.name}`,
    `Siding material: ${wallProduct.label} (${wallProfile || 'standard profile'})`,
    `Siding color: ${wallColor.code} — ${wallColor.name}`,
    ...Object.entries(ACCESSORY_LABELS)
      .filter(([key]) => services?.[key])
      .map(([key, label]) => {
        const c = colorById(accessoryColors?.[key]);
        return `${label} color: ${c.code} — ${c.name}`;
      }),
  ];
  selectionLines.forEach((line) => { ensureRoom(13); doc.text(line, MARGIN, y); y += 13; });

  const facetCol = { label: MARGIN, product: MARGIN + 45, swatch: PAGE_W - MARGIN - 150, color: PAGE_W - MARGIN - 135, sqft: PAGE_W - MARGIN };

  const renderFacetTable = (title, rows) => {
    y += 6;
    ensureRoom(30);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title, MARGIN, y); y += 14;

    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text('Facet', facetCol.label, y);
    doc.text('Product', facetCol.product, y);
    doc.text('Color', facetCol.color, y);
    doc.text('Sqft', facetCol.sqft, y, { align: 'right' });
    doc.setTextColor(0);
    y += 5;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    rows.forEach((row) => {
      ensureRoom(13);
      if (row.customized) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...hexToRgb('#A83200'));
      }
      doc.text(String(row.label), facetCol.label, y);
      doc.text(row.productLabel, facetCol.product, y, { maxWidth: facetCol.swatch - facetCol.product - 8 });
      const [cr, cg, cb] = hexToRgb(row.color.hex);
      doc.setFillColor(cr, cg, cb);
      doc.setDrawColor(180);
      doc.rect(facetCol.swatch, y - 7, 9, 9, 'FD');
      doc.text(`${row.color.code}`, facetCol.color, y, { maxWidth: facetCol.sqft - facetCol.color - 8 });
      doc.text(row.sizeSf.toLocaleString(undefined, { maximumFractionDigits: 1 }), facetCol.sqft, y, { align: 'right' });
      if (row.customized) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0);
      }
      y += 13;
    });
  };

  const roofFacetRows = roofFacesForPricing?.length
    ? buildFacetTable(roofFacesForPricing, uniformFinish ? {} : facetOverrides, ROOF_PRODUCTS, roofProduct.id, roofColorId)
    : [];
  const wallFacetRows = wallFacesForPricing?.length
    ? buildFacetTable(wallFacesForPricing, uniformFinish ? {} : facetOverrides, WALL_PRODUCTS, wallProduct.id, wallColorId)
    : [];

  if (roofFacetRows.length) renderFacetTable('Roof Slopes (bold = customized, differs from default above)', roofFacetRows);
  if (wallFacetRows.length) renderFacetTable('Wall Segments (bold = customized, differs from default above)', wallFacetRows);

  // Price table
  y += 12;
  ensureRoom(30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Price Breakdown', MARGIN, y); y += 16;

  const col = { item: MARGIN, qty: PAGE_W - MARGIN - 200, rate: PAGE_W - MARGIN - 130, total: PAGE_W - MARGIN };
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text('Item', col.item, y);
  doc.text('Qty', col.qty, y, { align: 'right' });
  doc.text('Rate', col.rate, y, { align: 'right' });
  doc.text('Total', col.total, y, { align: 'right' });
  doc.setTextColor(0);
  y += 6;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  estimate.lineItems.forEach((li) => {
    ensureRoom(15);
    doc.text(li.label, col.item, y, { maxWidth: col.qty - col.item - 10 });
    doc.text(`${li.qty.toLocaleString()} ${li.unit}`, col.qty, y, { align: 'right' });
    doc.text(money(li.rate), col.rate, y, { align: 'right' });
    doc.text(money(li.total), col.total, y, { align: 'right' });
    y += 15;
  });

  y += 4;
  doc.setDrawColor(200);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  const totalRow = (label, value, opts = {}) => {
    ensureRoom(16);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.bold ? 12 : 10);
    if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(0);
    doc.text(label, col.rate - 20, y, { align: 'right' });
    doc.text(value, col.total, y, { align: 'right' });
    doc.setTextColor(0);
    y += opts.bold ? 20 : 15;
  };

  totalRow('Subtotal', money(estimate.subtotal));
  if (estimate.deals.fullWrap) totalRow('Full Wrap discount (7%)', `-${money(estimate.deals.fullWrapDiscountAmount)}`, { color: [13, 122, 62] });
  if (estimate.manualDiscount > 0) totalRow('Additional discount', `-${money(estimate.manualDiscount)}`, { color: [13, 122, 62] });
  totalRow('Pre-tax total', money(estimate.preTaxTotal));
  totalRow(`GST (${(estimate.gstRate * 100).toFixed(0)}%)`, money(estimate.gst));
  totalRow('TOTAL ESTIMATE', money(estimate.total), { bold: true });

  y += 10;
  ensureRoom(30);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text('This is a preliminary estimate generated by the IronWrap 3D Configurator.', MARGIN, y); y += 12;
  doc.text('Final pricing subject to on-site verification and signed contract.', MARGIN, y);

  doc.save(`${house.jobNumber}-estimate.pdf`);
}
