import { captureDesignState } from './designState.js';
import {
  DOWNSPOUT_OPTIONS,
  GUTTER_OPTIONS,
  ROOF_PRODUCTS,
  ROOF_PROFILES,
  WALL_PRODUCTS,
  WALL_PROFILES,
} from '../data/pricing.js';
import {
  DEFAULT_ACCESSORY_COLORS,
  DEFAULT_LOCKED_SERVICES,
  DEFAULT_SERVICES,
} from '../data/defaults.js';

const BLANK_MEASUREMENTS = Object.freeze({
  soffitSqft: 0,
  fasciaLf: 0,
  gutterLf: 0,
  downspoutLf: 0,
  snowRetentionLf: 0,
  capFlashingLf: 0,
  garageDoorCappingLf: 0,
});

export function createBlankHouse() {
  return {
    jobNumber: '',
    customerName: '',
    address: '',
    layers: [],
    measurements: { ...BLANK_MEASUREMENTS },
  };
}

export function buildAccountDefaultDesignSnapshot({
  companySettings,
  customServiceCatalog = [],
  effectivePricingSettings,
  house = createBlankHouse(),
}) {
  const defaultCustomServiceIds = companySettings?.default_custom_service_ids ?? [];
  return captureDesignState({
    brandId: 'ironwrap',
    house: { ...house, layers: [...(house.layers ?? [])] },
    roofProductId: ROOF_PRODUCTS[0].id,
    roofProfile: ROOF_PROFILES[ROOF_PRODUCTS[0].id]?.[0] ?? '',
    roofColorId: companySettings?.default_roof_color_id ?? 'wg-02',
    wallProductId: WALL_PRODUCTS[0].id,
    wallProfile: WALL_PROFILES[WALL_PRODUCTS[0].id]?.[0] ?? '',
    wallColorId: companySettings?.default_wall_color_id ?? 'wg-02',
    services: { ...(companySettings?.default_services ?? DEFAULT_SERVICES) },
    lockedServices: { ...(companySettings?.default_locked_services ?? DEFAULT_LOCKED_SERVICES) },
    gutterOptionId: GUTTER_OPTIONS[0].id,
    downspoutOptionId: DOWNSPOUT_OPTIONS[0].id,
    measurements: { ...(house.measurements ?? BLANK_MEASUREMENTS) },
    manualDiscount: 0,
    layerOffsets: {},
    accessoryColors: { ...(companySettings?.default_accessory_colors ?? DEFAULT_ACCESSORY_COLORS) },
    uniformFinish: true,
    facetOverrides: {},
    customServiceLines: customServiceCatalog
      .filter((definition) => defaultCustomServiceIds.includes(definition.id))
      .map((definition) => ({
        id: definition.id,
        name: definition.name,
        unit: definition.unit,
        price: Number(definition.price),
        qty: 1,
        description: definition.description,
        linkUrl: definition.link_url,
      })),
    pricingSettings: effectivePricingSettings,
  });
}

// New Project intentionally bypasses legacy normalization. It is rebuilt on
// every click from the current account settings/catalog, while null pricing
// keeps the unsaved design attached to live company rates until persistence.
export function buildNewProjectDesignSnapshot({ companySettings, customServiceCatalog = [] }) {
  return buildAccountDefaultDesignSnapshot({
    companySettings,
    customServiceCatalog,
    effectivePricingSettings: null,
  });
}
