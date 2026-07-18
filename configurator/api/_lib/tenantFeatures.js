import { resolveExpertEntitlement } from '../../src/lib/studioMode.js';

export const EXPERT_MODE_API_FIELD = 'EXPERT_MODE_VAR';
export const EXPERT_MODE_DB_FIELD = 'expert_mode_enabled';

export class TenantFeatureError extends Error {
  constructor(message, { code = 'TENANT_FEATURE_ERROR', status = 400 } = {}) {
    super(message);
    this.name = 'TenantFeatureError';
    this.code = code;
    this.status = status;
  }
}

const TENANT_SETTINGS_PUBLIC_FIELDS = [
  'gst_rate',
  'full_wrap_discount_pct',
  'soffit_fascia_discount_pct',
  'gutter_downspout_free',
  'default_services',
  'default_locked_services',
  'default_accessory_colors',
  'default_roof_color_id',
  'default_wall_color_id',
  'report_footer_note',
  'logo_url',
  'tax_country',
  'tax_region',
  'tax_label',
  'municipal_tax_rate',
  'discount_rules',
  'notification_webhook_url',
  'default_custom_service_ids',
  'unit_system',
  'updated_at',
];

export function assertExpertEntitlementUpdate({ role, value, reason } = {}) {
  if (role !== 'superadmin') {
    throw new TenantFeatureError('Not authorized to update Expert Mode entitlement', {
      code: 'SUPERADMIN_REQUIRED',
      status: 403,
    });
  }
  if (typeof value !== 'boolean') {
    throw new TenantFeatureError(`${EXPERT_MODE_API_FIELD} must be a boolean`, {
      code: 'INVALID_EXPERT_MODE_VALUE',
      status: 400,
    });
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) {
    throw new TenantFeatureError('A reason is required', {
      code: 'EXPERT_MODE_REASON_REQUIRED',
      status: 400,
    });
  }
  return { value, reason: cleanReason };
}

// Remote troubleshooting responses deliberately expose only the external
// feature name and its effective value. Raw settings columns (including the
// tenant preference) stay private to their purpose-built APIs.
export function serializeExpertEntitlement({ tenantId, role, tenantEntitlement } = {}) {
  return {
    tenantId,
    [EXPERT_MODE_API_FIELD]: resolveExpertEntitlement({ role, tenantEntitlement }),
  };
}

export function serializeTenantSettings({ row = {}, role } = {}) {
  const dto = {};
  for (const field of TENANT_SETTINGS_PUBLIC_FIELDS) {
    if (Object.hasOwn(row, field)) dto[field] = row[field];
  }
  const expertModeEntitled = resolveExpertEntitlement({
    role,
    tenantEntitlement: row.expert_mode_enabled,
  });
  dto.expertModeEntitled = expertModeEntitled;
  dto.show_expert_mode = expertModeEntitled && row.show_expert_mode === true;
  return dto;
}
