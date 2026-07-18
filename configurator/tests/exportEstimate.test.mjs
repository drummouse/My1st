import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({
  root: new URL('..', import.meta.url).pathname,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
});
const { buildEstimateText } = await vite.ssrLoadModule('/src/lib/exportEstimate.js');
after(() => vite.close());

const estimate = {
  lineItems: [
    { key: 'roofing-standing-seam', label: 'Roofing', qty: 100, unit: 'sqft', total: 1000 },
    { key: 'gutters', label: 'Gutters', qty: 100, unit: 'LF', total: 300 },
  ],
  subtotal: 1300,
  appliedDiscounts: [],
  manualDiscount: 0,
  preTaxTotal: 1300,
  taxLabel: 'GST',
  taxRate: 0.05,
  taxAmount: 65,
  total: 1365,
};

const buildText = (unitSystem) => buildEstimateText({
  brand: { name: 'IronWrap', tagline: 'Test' },
  house: { jobNumber: 'IW-1', customerName: 'Customer', address: 'Address' },
  roofProduct: { id: 'standing-seam', label: 'Standing Seam' },
  roofColorId: 'wg-02',
  roofProfile: 'Standard',
  wallProduct: { id: 'board-and-batten', label: 'Board and Batten' },
  wallColorId: 'wg-02',
  wallProfile: 'Standard',
  estimate,
  accessoryColors: { gutters: 'wg-02' },
  uniformFinish: true,
  facetOverrides: {},
  roofFacesForPricing: [{ key: 'roof:1', sizeSf: 100 }],
  wallFacesForPricing: [],
  attachments: [],
  unitSystem,
});

test('metric text exports convert estimate and facet quantities while totals stay canonical', () => {
  const text = buildText('metric');

  assert.match(text, /9\.29 m²/);
  assert.match(text, /30\.48 m/);
  assert.match(text, /\$1,000\.00/);
  assert.match(text, /TOTAL ESTIMATE: \$1,365\.00/);
  assert.doesNotMatch(text, /100 (?:sqft|LF)/);
});

test('text exports default to Imperial presentation for existing callers', () => {
  const text = buildText(undefined);

  assert.match(text, /100 sq ft/);
  assert.match(text, /100 LF/);
});
