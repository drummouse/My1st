import test from 'node:test';
import assert from 'node:assert/strict';
import { toPublicDesign } from '../src/lib/publicDesign.js';

test('public design deeply allowlists every nested customer-visible object family', () => {
  const projected = toPublicDesign({
    version: 2,
    brandId: 'ironwrap',
    privateRoot: { secret: 'root-secret' },
    house: {
      jobNumber: 'SAFE-3', customerName: 'Customer', address: '3 Safe Way',
      privateNote: 'house-secret',
      layers: [
        {
          id: 'roof', name: 'Roof', xml: '<REPORT />', visible: false,
          ownerId: 'layer-secret', nested: { secret: 'nested-layer-secret' },
        },
        null,
        'hostile-layer-entry',
      ],
    },
    layerOffsets: {
      roof: { dx: 1, dy: -2, dz: 3, ownerId: 'offset-secret', nested: { secret: true } },
      privateOffset: { dx: 99, secret: 'unknown-layer-secret' },
    },
    roofProductId: 'roof-product',
    roofProfile: 'roof-profile',
    roofColorId: 'roof-color',
    wallProductId: 'wall-product',
    wallProfile: 'wall-profile',
    wallColorId: 'wall-color',
    services: {
      roof: true, wall: false, snowRetention: true,
      privateService: { enabled: true, unitPrice: 1000 },
    },
    gutterOptionId: 'gutter-option',
    downspoutOptionId: 'downspout-option',
    measurements: {
      soffitSqft: 12, fasciaLf: 13, gutterLf: 14, downspoutLf: 15,
      snowRetentionLf: 16, capFlashingLf: 17, garageDoorCappingLf: 18,
      privateMeasurement: { quantity: 999, cost: 42 },
    },
    accessoryColors: {
      soffit: 'soffit-color', fascia: 'fascia-color', gutters: 'gutter-color',
      downspouts: 'downspout-color', garageDoorCapping: 'garage-color', capFlashing: 'cap-color',
      privateColor: { id: 'private-color', ownerId: 'tenant-secret' },
    },
    trimAccents: [
      {
        id: 'gutters', kind: 'gutters', productId: 'gutter-option', profile: 'K-style',
        colorId: 'gutter-color', quantity: 14, canonicalUnit: 'linear_feet', selected: true,
        locked: true, nested: { secret: 'trim-secret' },
      },
      null,
      'hostile-trim-entry',
    ],
    uniformFinish: false,
    facetOverrides: {
      'roof:F1': {
        productId: 'override-product', colorId: 'override-color', unitPrice: 84,
        nested: { secret: 'override-secret' },
      },
      'private:F9': { productId: 'private-product', secret: 'unknown-layer-override' },
    },
    catalogSnapshot: {
      version: 1,
      nested: { secret: 'snapshot-secret' },
      materials: [
        {
          id: 'roof-product', name: 'Roof Product', kind: 'roof',
          profiles: ['roof-profile', { secret: 'profile-secret' }],
          colorIds: ['roof-color', { secret: 'color-id-secret' }],
          pricePerSqft: 77, nested: { secret: 'material-secret' },
        },
        null,
        'hostile-material-entry',
      ],
      colors: [
        {
          id: 'roof-color', name: 'Roof Color', code: 'RC', hex: '#123456',
          series: 'Safe', thumbnail: '/safe.jpg', ownerId: 'color-secret',
          nested: { secret: 'nested-color-secret' },
        },
        null,
        'hostile-color-entry',
      ],
    },
  });

  assert.deepEqual(projected.house, {
    jobNumber: 'SAFE-3', customerName: 'Customer', address: '3 Safe Way',
    layers: [{ id: 'roof', name: 'Roof', xml: '<REPORT />', visible: false }],
  });
  assert.deepEqual(projected.layerOffsets, { roof: { dx: 1, dy: -2, dz: 3 } });
  assert.deepEqual(projected.services, { roof: true, wall: false, snowRetention: true });
  assert.deepEqual(projected.measurements, {
    soffitSqft: 12, fasciaLf: 13, gutterLf: 14, downspoutLf: 15,
    snowRetentionLf: 16, capFlashingLf: 17, garageDoorCappingLf: 18,
  });
  assert.deepEqual(projected.accessoryColors, {
    soffit: 'soffit-color', fascia: 'fascia-color', gutters: 'gutter-color',
    downspouts: 'downspout-color', garageDoorCapping: 'garage-color', capFlashing: 'cap-color',
  });
  assert.deepEqual(projected.facetOverrides, {
    'roof:F1': { productId: 'override-product', colorId: 'override-color' },
  });
  assert.deepEqual(projected.trimAccents, [{
    id: 'gutters', kind: 'gutters', productId: 'gutter-option', profile: 'K-style',
    colorId: 'gutter-color', quantity: 14, canonicalUnit: 'linear_feet', selected: true,
  }]);
  assert.deepEqual(projected.catalogSnapshot, {
    version: 1,
    materials: [{
      id: 'roof-product', name: 'Roof Product', kind: 'roof',
      profiles: ['roof-profile'], colorIds: ['roof-color'],
    }],
    colors: [{
      id: 'roof-color', name: 'Roof Color', code: 'RC', hex: '#123456',
      series: 'Safe', thumbnail: '/safe.jpg',
    }],
  });
  assert.equal(JSON.stringify(projected).includes('secret'), false);
  assert.equal(Object.hasOwn(projected, 'privateRoot'), false);
});
