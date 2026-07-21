import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const vite = await createServer({
  root: new URL('..', import.meta.url).pathname,
  configFile: false,
  plugins: [react()],
  server: { middlewareMode: true },
  appType: 'custom',
});
const [productModule, facetModule, summaryModule, servicesModule, optionalServiceModule, extrasModule] = await Promise.all([
  vite.ssrLoadModule('/src/components/ProductSelector.jsx'),
  vite.ssrLoadModule('/src/components/FacetInspector.jsx'),
  vite.ssrLoadModule('/src/components/PriceSummary.jsx'),
  vite.ssrLoadModule('/src/components/ServicesPanel.jsx'),
  vite.ssrLoadModule('/src/components/OptionalServiceRow.jsx'),
  vite.ssrLoadModule('/src/components/ExtrasServicesPanel.jsx'),
]);
after(() => vite.close());

const noop = () => {};

test('metric product and facet selectors show converted area prices and facet area', () => {
  const productMarkup = renderToStaticMarkup(React.createElement(productModule.default, {
    label: 'Roof Material',
    products: [{ id: 'panel', label: 'Panel', pricePerSqft: 1 }],
    profiles: { panel: [] },
    selectedId: 'panel',
    selectedProfile: '',
    onProductChange: noop,
    onProfileChange: noop,
    unitSystem: 'metric',
  }));
  const facetMarkup = renderToStaticMarkup(React.createElement(facetModule.default, {
    facet: { role: 'roof', faceId: '1', sizeSf: 100 },
    effectiveProductId: 'snaplock',
    effectiveColorId: 'wg-02',
    hasOverride: false,
    onProductChange: noop,
    onColorChange: noop,
    onClear: noop,
    onClose: noop,
    unitSystem: 'metric',
  }));

  assert.match(productMarkup, /\$10\.76\/m²/);
  assert.match(facetMarkup, /9\.29 m²/);
  assert.match(facetMarkup, /\/m²/);
  assert.doesNotMatch(`${productMarkup}${facetMarkup}`, /\/sqft|100 sqft/);
});

test('metric estimate summary converts displayed quantities without changing totals', () => {
  const markup = renderToStaticMarkup(React.createElement(summaryModule.default, {
    estimate: {
      lineItems: [{ key: 'roof', label: 'Roof', qty: 100, unit: 'sqft', total: 1000 }],
      subtotal: 1000,
      appliedDiscounts: [],
      preTaxTotal: 1000,
      taxLabel: 'GST',
      taxRate: 0.05,
      taxAmount: 50,
      total: 1050,
    },
    manualDiscount: 0,
    onManualDiscountChange: noop,
    readOnlyDiscount: true,
    unitSystem: 'metric',
  }));

  assert.match(markup, /9\.29 m²/);
  assert.match(markup, /\$1,000\.00/);
  assert.doesNotMatch(markup, /100 sqft/);
});

test('metric trim rows show metres while legacy type appears in the Product field', () => {
  const markup = renderToStaticMarkup(React.createElement(servicesModule.default, {
    services: { gutters: true },
    onServicesChange: noop,
    lockedServices: {},
    onLockedServicesChange: noop,
    measurements: { gutterLf: 100 },
    onMeasurementsChange: noop,
    gutterOptionId: '5in-kstyle',
    onGutterOptionChange: noop,
    downspoutOptionId: '3in-round',
    onDownspoutOptionChange: noop,
    accessoryColors: { gutters: 'wg-02' },
    onAccessoryColorsChange: noop,
    readOnlyQuantities: false,
    isCustomerView: false,
    onCustomServiceLinesChange: noop,
    onTrimAccentsChange: noop,
    unitSystem: 'metric',
  }));

  assert.match(markup, /30\.48/);
  assert.match(markup, /value="5&quot; K-Style Eavestrough"/);
  assert.doesNotMatch(markup, /\/LF|Eavestrough profile|<select/);
});

test('metric custom services display converted quantity and price while edits stay canonical', () => {
  const changes = [];
  const element = React.createElement(optionalServiceModule.default, {
    service: {
      id: 'custom-flashing', name: 'Custom flashing', description: '', pricingMethod: 'per_unit',
      quantity: 100, unit: 'LF', unitPrice: 10, selected: true, locked: false,
    },
    onChange: (next) => changes.push(next),
    unitSystem: 'metric',
  });
  const markup = renderToStaticMarkup(element);
  const rendered = optionalServiceModule.default(element.props);
  const quantityInput = rendered.props.children.find((child) => child?.props?.className?.includes('optional-service-quantity'))
    .props.children[1].props.children[0];

  assert.match(markup, /value="30\.48"/);
  assert.match(markup, />m<\/span>/);
  assert.match(markup, /\$32\.81\/m/);
  assert.doesNotMatch(markup, /100|\/LF/);

  quantityInput.props.onChange({ target: { value: '15.24' } });
  assert.equal(changes[0].quantity, 50);
  assert.equal(changes[0].unit, 'LF');
  assert.equal(changes[0].unitPrice, 10);
});

test('Library service add action keeps price details inside the selected snapshot', () => {
  const markup = renderToStaticMarkup(React.createElement(extrasModule.default, {
    services: {},
    customServiceLines: [],
    libraryOptions: [{
      id: 'flashing', source: 'library', kind: 'service', label: 'Flashing',
      unit: 'LF', unitPrice: 10, profileLabel: null, colorIds: [], active: true,
    }],
    onCustomServiceLinesChange: noop,
    unitSystem: 'metric',
  }));

  assert.match(markup, /Add Service/);
  assert.doesNotMatch(markup, /Flashing|unitPrice|\$10\.00\/LF/);
});
