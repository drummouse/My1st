import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDesignState } from '../src/lib/designState.js';
import { buildNewProjectDesignSnapshot } from '../src/lib/newProjectDesignState.js';

test('New Project uses current account defaults and catalog values without freezing pricing', () => {
  const initialSettings = {
    default_roof_color_id: 'old-roof-color',
    default_wall_color_id: 'old-wall-color',
    default_services: { roof: true, wall: false },
    default_locked_services: { roof: true, wall: false },
    default_accessory_colors: { soffit: 'old-accessory' },
    default_custom_service_ids: ['default-service'],
  };
  const updatedSettings = {
    ...initialSettings,
    default_roof_color_id: 'current-roof-color',
    default_wall_color_id: 'current-wall-color',
    default_services: { roof: false, wall: true, soffit: true, gutters: true },
    default_locked_services: { roof: false, wall: true },
    default_accessory_colors: { soffit: 'current-accessory' },
  };
  const initialCatalog = [{
    id: 'default-service', name: 'Old service', unit: 'each', price: '10',
    description: 'Old description', link_url: 'https://old.example',
  }];
  const updatedCatalog = [{
    id: 'default-service', name: 'Current service', unit: 'LF', price: '25',
    description: 'Current description', link_url: 'https://current.example',
  }];

  const firstNewProject = buildNewProjectDesignSnapshot({
    companySettings: initialSettings,
    customServiceCatalog: initialCatalog,
  });
  firstNewProject.house.jobNumber = 'ACTIVE-PROJECT-EDIT';
  firstNewProject.facetOverrides.stale = { colorId: 'stale-color' };
  firstNewProject.pricingSettings = { gstRate: 0.99 };

  const nextNewProject = buildNewProjectDesignSnapshot({
    companySettings: updatedSettings,
    customServiceCatalog: updatedCatalog,
  });

  assert.deepEqual(nextNewProject.house, {
    jobNumber: '', customerName: '', address: '', customerEmail: '', customerPhone: '', layers: [],
  });
  assert.deepEqual(nextNewProject.layerOffsets, {});
  assert.deepEqual(nextNewProject.facetOverrides, {});
  assert.deepEqual(nextNewProject.measurements, {
    soffitSqft: 0,
    fasciaLf: 0,
    gutterLf: 0,
    downspoutLf: 0,
    snowRetentionLf: 0,
    capFlashingLf: 0,
    garageDoorCappingLf: 0,
  });
  assert.equal(nextNewProject.roofColorId, 'current-roof-color');
  assert.equal(nextNewProject.wallColorId, 'current-wall-color');
  assert.deepEqual(nextNewProject.services, { roof: false, wall: true });
  for (const key of ['soffit', 'fascia', 'gutters', 'downspouts', 'garageDoorCapping', 'capFlashing']) {
    assert.equal(key in nextNewProject.services, false);
  }
  assert.deepEqual(nextNewProject.lockedServices, updatedSettings.default_locked_services);
  assert.deepEqual(nextNewProject.accessoryColors, updatedSettings.default_accessory_colors);
  assert.deepEqual(nextNewProject.customServiceLines, [{
    id: 'default-service',
    name: 'Current service',
    unit: 'LF',
    price: 25,
    qty: 1,
    description: 'Current description',
    linkUrl: 'https://current.example',
  }]);
  assert.equal(nextNewProject.pricingSettings, null);
  assert.notEqual(nextNewProject.house, firstNewProject.house);
  assert.notEqual(nextNewProject.facetOverrides, firstNewProject.facetOverrides);

  let appliedPricing = { gstRate: 0.99 };
  applyDesignState(
    { version: 2, pricingSettings: nextNewProject.pricingSettings },
    { setPricingSettings: (value) => { appliedPricing = value; } },
  );
  assert.equal(appliedPricing, null);
});

test('an explicit empty Library default collection does not fall back to legacy specialty defaults', () => {
  const design = buildNewProjectDesignSnapshot({
    companySettings: {
      default_catalog_items: [],
      default_services: {
        roof: true, wall: true, snowRetention: true, capFlashing: true, garageDoorCapping: true,
      },
      default_custom_service_ids: ['legacy-service'],
    },
    customServiceCatalog: [{ id: 'legacy-service', name: 'Legacy', unit: 'each', price: 5 }],
  });

  assert.deepEqual(design.services, { roof: true, wall: true });
  assert.deepEqual(design.customServiceLines, []);
  assert.equal(design.trimAccents.some((row) => row.kind === 'garage_doors'), false);
});
