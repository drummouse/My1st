import { jsPDF } from 'jspdf';
import { colorById } from '../data/colors.js';
import { ROOF_PRODUCTS, WALL_PRODUCTS } from '../data/pricing.js';
import { money, formatPct, buildFacetTable, ACCESSORY_LABELS, estimateHasItem } from './exportEstimate.js';

const MARGIN = 40;
const PAGE_W = 612; // Letter, points
const PAGE_H = 792;

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// Draws the small brand header used at the top of every page after the cover.
function drawPageHeader(doc, brand, title) {
  const [ar, ag, ab] = hexToRgb(brand.accent);
  doc.setFillColor(ar, ag, ab);
  doc.rect(0, 0, PAGE_W, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...hexToRgb(brand.accentDark));
  doc.text(brand.name.toUpperCase(), MARGIN, 26);
  doc.setTextColor(0);
  doc.setFontSize(13);
  doc.text(title, PAGE_W - MARGIN, 26, { align: 'right' });
  doc.setDrawColor(220);
  doc.line(MARGIN, 34, PAGE_W - MARGIN, 34);
}

function drawCoverPage(doc, brand, house, qrDataUrl, shareUrl, reportFooterNote, logoDataUrl) {
  const [ar, ag, ab] = hexToRgb(brand.accent);
  doc.setFillColor(ar, ag, ab);
  doc.rect(0, 0, PAGE_W, 10, 'F');

  if (logoDataUrl) {
    // Fit within a fixed box (top-right, clear of the brand name at left)
    // preserving the logo's own aspect ratio, whatever shape it is.
    const boxW = 150;
    const boxH = 60;
    const { width: iw, height: ih } = doc.getImageProperties(logoDataUrl);
    const scale = Math.min(boxW / iw, boxH / ih);
    const w = iw * scale;
    const h = ih * scale;
    doc.addImage(logoDataUrl, PAGE_W - MARGIN - w, 32, w, h);
  }

  let y = 130;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(0);
  doc.text(brand.name, MARGIN, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(90);
  doc.text(brand.tagline, MARGIN, y);

  y += 60;
  doc.setDrawColor(...hexToRgb(brand.accent));
  doc.setLineWidth(1.5);
  doc.line(MARGIN, y, MARGIN + 90, y);
  doc.setLineWidth(1);

  y += 36;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(0);
  doc.text('Design & Estimate Report', MARGIN, y);

  y += 50;
  const cardX = MARGIN;
  const cardW = PAGE_W - MARGIN * 2;
  const cardTop = y;
  const rows = [
    ['Job Number', house.jobNumber || '—'],
    ['Customer', house.customerName || '—'],
    ['Address', house.address || '—'],
    ['Date Prepared', new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })],
  ];
  const rowH = 34;
  const cardH = rowH * rows.length + 20;
  doc.setDrawColor(225);
  doc.setFillColor(250, 250, 251);
  doc.roundedRect(cardX, cardTop, cardW, cardH, 6, 6, 'FD');

  let ry = cardTop + 26;
  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(130);
    doc.text(label.toUpperCase(), cardX + 20, ry);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(String(value), cardX + 190, ry);
    ry += rowH;
  });

  if (qrDataUrl) {
    const qrSize = 90;
    const qrY = cardTop + cardH + 36;
    doc.addImage(qrDataUrl, 'PNG', cardX, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text('Scan for a live, rotatable 3D view', cardX + qrSize + 16, qrY + 30);
    if (shareUrl) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(120);
      drawWrapped(doc, shareUrl, cardX + qrSize + 16, qrY + 46, cardW - qrSize - 16, 11);
    }
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(
    reportFooterNote || 'This is a preliminary estimate — final pricing subject to on-site verification and a signed contract.',
    MARGIN, PAGE_H - MARGIN
  );
}

// Draws possibly-wrapping text and returns the y position after it — jsPDF's
// own maxWidth option wraps automatically but doesn't report how many lines
// it used, so advancing y by a fixed single-line amount after it causes the
// next row to overlap a wrapped second line.
function drawWrapped(doc, text, x, y, maxWidth, lineHeight) {
  const lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach((line, i) => doc.text(line, x, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

// Fits an image into a slot (contain, centered), returning the drawn rect.
function drawImageContained(doc, dataUrl, x, y, slotW, slotH) {
  const props = doc.getImageProperties(dataUrl);
  const aspect = props.width / props.height;
  let w = slotW;
  let h = w / aspect;
  if (h > slotH) {
    h = slotH;
    w = h * aspect;
  }
  const dx = x + (slotW - w) / 2;
  const dy = y + (slotH - h) / 2;
  doc.addImage(dataUrl, 'PNG', dx, dy, w, h);
}

function drawIsoAndSummaryPage(doc, {
  brand, isoSnapshots, roofProduct, roofColorId, roofProfile, wallProduct, wallColorId, wallProfile,
  estimate, accessoryColors,
}) {
  doc.addPage();
  drawPageHeader(doc, brand, 'Renderings & Estimate Summary');

  const top = 50;
  const bottom = PAGE_H - MARGIN;
  const gap = 16;
  const colW = (PAGE_W - MARGIN * 2 - gap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + gap;

  // Left column: 4 static corner renderings, stacked.
  const imgGap = 8;
  const slotH = (bottom - top - imgGap * 3) / 4;
  let imgY = top;
  (isoSnapshots || []).slice(0, 4).forEach((dataUrl) => {
    try {
      doc.setDrawColor(225);
      doc.roundedRect(leftX, imgY, colW, slotH, 4, 4, 'S');
      drawImageContained(doc, dataUrl, leftX + 3, imgY + 3, colW - 6, slotH - 6);
    } catch {
      // Snapshot capture failed for this angle — skip it, keep the rest of the report.
    }
    imgY += slotH + imgGap;
  });

  // Right column: selections + full price breakdown.
  let y = top + 4;
  const roofColor = colorById(roofColorId);
  const wallColor = colorById(wallColorId);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0);
  doc.text('Selections', rightX, y); y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const selectionLines = [
    ...(estimateHasItem(estimate, 'roofing') ? [
      `Roof: ${roofProduct.label} (${roofProfile || 'standard profile'})`,
      `Roof color: ${roofColor.code} — ${roofColor.name}`,
    ] : []),
    ...(estimateHasItem(estimate, 'siding') ? [
      `Siding: ${wallProduct.label} (${wallProfile || 'standard profile'})`,
      `Siding color: ${wallColor.code} — ${wallColor.name}`,
    ] : []),
    ...Object.entries(ACCESSORY_LABELS)
      .filter(([key]) => estimateHasItem(estimate, key))
      .map(([key, label]) => {
        const c = colorById(accessoryColors?.[key]);
        return `${label} color: ${c.code} — ${c.name}`;
      }),
  ];
  selectionLines.forEach((line) => {
    y = drawWrapped(doc, line, rightX, y, colW, 11);
  });

  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Materials, Services & Price Breakdown', rightX, y, { maxWidth: colW }); y += 14;

  // Qty and Total are right-aligned, which means their text extends
  // *leftward* from their anchor — the item label's maxWidth has to stop
  // well short of the qty anchor to leave room for that, not just up to it.
  const qtyW = 60;
  const totalW = 68;
  const colGap = 5;
  const col = { item: rightX, qty: rightX + colW - totalW - colGap, total: rightX + colW };
  const itemMaxWidth = col.qty - qtyW - colGap - col.item;
  doc.setFontSize(7.8);
  doc.setTextColor(130);
  doc.text('Item', col.item, y);
  doc.text('Qty', col.qty, y, { align: 'right' });
  doc.text('Total', col.total, y, { align: 'right' });
  doc.setTextColor(0);
  y += 4;
  doc.setDrawColor(210);
  doc.line(rightX, y, rightX + colW, y);
  y += 10;

  // Full product names are already in "Selections" above and in the
  // per-facet tables later — this compact table just needs the category.
  const shortLabel = (label) => (label.includes(' — ') ? label.split(' — ')[0] : label);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  estimate.lineItems.forEach((li) => {
    doc.text(`${li.qty.toLocaleString()} ${li.unit}`, col.qty, y, { align: 'right' });
    doc.text(money(li.total), col.total, y, { align: 'right' });
    y = drawWrapped(doc, shortLabel(li.label), col.item, y, itemMaxWidth, 10);
    if (li.description) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(120);
      y = drawWrapped(doc, li.description, col.item, y, itemMaxWidth, 9);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
    }
    if (li.linkUrl) {
      doc.setFontSize(7);
      doc.setTextColor(30, 90, 200);
      doc.textWithLink('Link ↗', col.item, y, { url: li.linkUrl });
      doc.setTextColor(0);
      doc.setFontSize(8.2);
      y += 9;
    }
  });

  y += 3;
  doc.setDrawColor(210);
  doc.line(rightX, y, rightX + colW, y);
  y += 13;

  const totalRow = (label, value, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.bold ? 11 : 9);
    if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(0);
    doc.text(label, col.total - 90, y, { align: 'right' });
    doc.text(value, col.total, y, { align: 'right' });
    doc.setTextColor(0);
    y += opts.bold ? 17 : 13;
  };

  totalRow('Subtotal', money(estimate.subtotal));
  estimate.appliedDiscounts
    .filter((d) => d.scope === 'subtotal')
    .forEach((d) => totalRow(`${d.name} (${Math.round(d.pct * 100)}%)`, `-${money(d.amount)}`, { color: [13, 122, 62] }));
  if (estimate.manualDiscount > 0) totalRow('Additional discount', `-${money(estimate.manualDiscount)}`, { color: [13, 122, 62] });
  totalRow('Pre-tax total', money(estimate.preTaxTotal));
  totalRow(`${estimate.taxLabel} (${formatPct(estimate.taxRate)}%)`, money(estimate.taxAmount));
  totalRow('TOTAL', money(estimate.total), { bold: true });

  if (estimate.appliedDiscounts.length) {
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(13, 122, 62);
    estimate.appliedDiscounts.forEach((d) => { doc.text(d.summary, rightX, y, { maxWidth: colW }); y += 10; });
    doc.setTextColor(0);
  }
}

function drawElevationsPage(doc, { brand, elevationViews }) {
  if (!elevationViews?.length) return;
  doc.addPage();
  drawPageHeader(doc, brand, 'Elevations');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(140);
  doc.text('Labels are relative to the model orientation, not true compass direction.', MARGIN, 46);
  doc.setTextColor(0);

  const top = 56;
  const bottom = PAGE_H - MARGIN;
  const gap = 16;
  const colW = (PAGE_W - MARGIN * 2 - gap) / 2;
  const rowH = (bottom - top - gap) / 2;
  const captionH = 16;
  const positions = [
    [MARGIN, top], [MARGIN + colW + gap, top],
    [MARGIN, top + rowH + gap], [MARGIN + colW + gap, top + rowH + gap],
  ];
  elevationViews.slice(0, 4).forEach(({ label, dataUrl }, i) => {
    const [x, y] = positions[i];
    try {
      doc.setDrawColor(225);
      doc.roundedRect(x, y, colW, rowH - captionH, 4, 4, 'S');
      drawImageContained(doc, dataUrl, x + 3, y + 3, colW - 6, rowH - captionH - 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(60);
      doc.text(label, x + colW / 2, y + rowH - 4, { align: 'center' });
      doc.setTextColor(0);
    } catch {
      // Capture failed for this angle — skip it, keep the rest of the report.
    }
  });
}

function drawRoofPlanPage(doc, { brand, roofPlanView }) {
  if (!roofPlanView) return;
  doc.addPage();
  drawPageHeader(doc, brand, 'Roof Plan');
  const top = 50;
  const bottom = PAGE_H - MARGIN;
  try {
    doc.setDrawColor(225);
    doc.roundedRect(MARGIN, top, PAGE_W - MARGIN * 2, bottom - top, 4, 4, 'S');
    drawImageContained(doc, roofPlanView, MARGIN + 6, top + 6, PAGE_W - MARGIN * 2 - 12, bottom - top - 12);
  } catch {
    // Capture failed — skip, keep the rest of the report.
  }
}

const LINE_TYPE_LABELS = {
  FASCIA: 'Fascia',
  GUTTER: 'Gutter / Eavestrough',
  RIDGE: 'Ridge',
  HIP: 'Hip',
  VALLEY: 'Valley',
  GABLE: 'Gable / Rake',
  EAVE: 'Eave',
  APRON: 'Apron / Flashing',
  STEP: 'Step Flashing',
  'TUCK-UNDER': 'Tuck-Under Flashing',
};

// Window/Door Schedule and Linear Footage/Accessories Takeoff — the two
// tables the reference RoofRuler reports carry for elements (soffit, fascia,
// gutters, downspouts, openings) that this app doesn't model as their own 3D
// geometry, so there's no photorealistic "view" to render for them, only the
// measurements themselves.
function drawSchedulesPages(doc, { brand, openingsSchedule, lineTakeoffs }) {
  let y = MARGIN;
  let pageOpen = false;
  const ensureRoom = (needed, title) => {
    if (!pageOpen || y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      drawPageHeader(doc, brand, title);
      y = 50;
      pageOpen = true;
    }
  };

  if (openingsSchedule?.length) {
    const title = 'Window & Door Schedule';
    ensureRoom(60, title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(title, MARGIN, y); y += 6;
    const windowCount = openingsSchedule.filter((o) => o.kind === 'window').length;
    const doorCount = openingsSchedule.filter((o) => o.kind === 'door').length;
    const otherCount = openingsSchedule.filter((o) => o.kind === 'other').length;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(
      `${windowCount} window${windowCount === 1 ? '' : 's'}, ${doorCount} door${doorCount === 1 ? '' : 's'}`
      + (otherCount ? `, ${otherCount} other opening${otherCount === 1 ? '' : 's'}/penetration${otherCount === 1 ? '' : 's'}` : '')
      + ' detected from the imported wall report (approximate sizes).',
      MARGIN, y + 8, { maxWidth: PAGE_W - MARGIN * 2 }
    );
    doc.setTextColor(0);
    y += 22;

    const col = { id: MARGIN, wall: MARGIN + 35, kind: MARGIN + 110, width: PAGE_W - MARGIN - 150, height: PAGE_W - MARGIN - 80, area: PAGE_W - MARGIN };
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text('ID', col.id, y);
    doc.text('Wall Facet', col.wall, y);
    doc.text('Type', col.kind, y);
    doc.text('Width', col.width, y, { align: 'right' });
    doc.text('Height', col.height, y, { align: 'right' });
    doc.text('Approx. Sqft', col.area, y, { align: 'right' });
    doc.setTextColor(0);
    y += 5;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 11;

    const kindLabel = { window: 'Window', door: 'Door', other: 'Other' };
    openingsSchedule
      .slice()
      .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { numeric: true }))
      .forEach((o) => {
        ensureRoom(13, title);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(0);
        doc.text(String(o.label || ''), col.id, y);
        doc.text(String(o.faceId), col.wall, y);
        doc.text(kindLabel[o.kind] || 'Other', col.kind, y);
        doc.text(`${o.widthFt.toFixed(1)} ft`, col.width, y, { align: 'right' });
        doc.text(`${o.heightFt.toFixed(1)} ft`, col.height, y, { align: 'right' });
        doc.text((o.widthFt * o.heightFt).toFixed(1), col.area, y, { align: 'right' });
        y += 13;
      });
    y += 12;
  }

  const relevantTypes = Object.keys(lineTakeoffs || {}).filter((t) => LINE_TYPE_LABELS[t]);
  if (relevantTypes.length) {
    const title = 'Linear Footage & Accessories Takeoff';
    ensureRoom(60, title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(title, MARGIN, y); y += 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text('Measured directly from the imported roof/wall report geometry.', MARGIN, y + 8);
    doc.setTextColor(0);
    y += 22;

    const col = { label: MARGIN, lf: PAGE_W - MARGIN };
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text('Component', col.label, y);
    doc.text('Linear Feet', col.lf, y, { align: 'right' });
    doc.setTextColor(0);
    y += 5;
    doc.setDrawColor(200);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 11;

    relevantTypes
      .sort((a, b) => LINE_TYPE_LABELS[a].localeCompare(LINE_TYPE_LABELS[b]))
      .forEach((type) => {
        ensureRoom(13, title);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(0);
        doc.text(LINE_TYPE_LABELS[type], col.label, y);
        doc.text(`${lineTakeoffs[type].toFixed(1)} ft`, col.lf, y, { align: 'right' });
        y += 13;
      });
  }
}

function drawFacetDetailPages(doc, {
  brand, uniformFinish, facetOverrides, roofProduct, roofColorId, wallProduct, wallColorId,
  roofFacesForPricing, wallFacesForPricing, facetLabels,
}) {
  let y = MARGIN;
  let pageOpen = false;

  const ensureRoom = (needed, title) => {
    if (!pageOpen || y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      drawPageHeader(doc, brand, title);
      y = 50;
      pageOpen = true;
    }
  };

  const facetCol = { label: MARGIN, product: MARGIN + 45, swatch: PAGE_W - MARGIN - 150, color: PAGE_W - MARGIN - 135, sqft: PAGE_W - MARGIN };

  const renderFacetTable = (title, rows) => {
    ensureRoom(60, title);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(title, MARGIN, y); y += 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text('(bold = customized, differs from the global selection above)', MARGIN, y + 8);
    doc.setTextColor(0);
    y += 22;

    doc.setFont('helvetica', 'normal');
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

    doc.setFontSize(8.5);
    rows.forEach((row) => {
      ensureRoom(13, title);
      // Always set font/color explicitly (not just when customized) since a
      // page break just above calls drawPageHeader, which leaves bold set —
      // relying on "only change when customized" would leak that into
      // every row rendered right after a break.
      doc.setFont('helvetica', row.customized ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...(row.customized ? hexToRgb('#A83200') : [0, 0, 0]));
      doc.text(String(row.label), facetCol.label, y);
      doc.text(row.productLabel, facetCol.product, y, { maxWidth: facetCol.swatch - facetCol.product - 8 });
      const [cr, cg, cb] = hexToRgb(row.color.hex);
      doc.setFillColor(cr, cg, cb);
      doc.setDrawColor(180);
      doc.rect(facetCol.swatch, y - 7, 9, 9, 'FD');
      doc.text(`${row.color.code}`, facetCol.color, y, { maxWidth: facetCol.sqft - facetCol.color - 8 });
      doc.text(row.sizeSf.toLocaleString(undefined, { maximumFractionDigits: 1 }), facetCol.sqft, y, { align: 'right' });
      y += 13;
    });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    y += 12;
  };

  const roofFacetRows = roofFacesForPricing?.length
    ? buildFacetTable(roofFacesForPricing, uniformFinish ? {} : facetOverrides, ROOF_PRODUCTS, roofProduct.id, roofColorId, facetLabels)
    : [];
  const wallFacetRows = wallFacesForPricing?.length
    ? buildFacetTable(wallFacesForPricing, uniformFinish ? {} : facetOverrides, WALL_PRODUCTS, wallProduct.id, wallColorId, facetLabels)
    : [];

  if (roofFacetRows.length) renderFacetTable('Roof Slopes', roofFacetRows);
  if (wallFacetRows.length) renderFacetTable('Wall Segments', wallFacetRows);
}

function stampFootersAndPageNumbers(doc, house) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${house.jobNumber || ''} — ${house.customerName || ''}`, MARGIN, PAGE_H - 20);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 20, { align: 'right' });
    doc.setTextColor(0);
  }
}

export function buildEstimatePdf({
  brand, house, isoSnapshots, elevationViews, roofPlanView, roofProduct, roofColorId, roofProfile, wallProduct, wallColorId, wallProfile, estimate,
  accessoryColors, uniformFinish, facetOverrides,
  roofFacesForPricing, wallFacesForPricing, facetLabels, openingsSchedule, lineTakeoffs,
  qrDataUrl, shareUrl, reportFooterNote, logoDataUrl,
}) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  drawCoverPage(doc, brand, house, qrDataUrl, shareUrl, reportFooterNote, logoDataUrl);

  drawIsoAndSummaryPage(doc, {
    brand, isoSnapshots, roofProduct, roofColorId, roofProfile, wallProduct, wallColorId, wallProfile,
    estimate, accessoryColors,
  });

  drawElevationsPage(doc, { brand, elevationViews });
  drawRoofPlanPage(doc, { brand, roofPlanView });
  drawSchedulesPages(doc, { brand, openingsSchedule, lineTakeoffs });

  drawFacetDetailPages(doc, {
    brand, uniformFinish, facetOverrides, roofProduct, roofColorId, wallProduct, wallColorId,
    roofFacesForPricing, wallFacesForPricing, facetLabels,
  });

  stampFootersAndPageNumbers(doc, house);

  doc.save(`${house.jobNumber}-estimate.pdf`);
}
