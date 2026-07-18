export function resolveExpertEntitlement({ role, tenantEntitlement = false } = {}) {
  return role === 'superadmin' || (role === 'owner' && tenantEntitlement === true);
}

export const canEnterExpert = (role, tenantEntitlement = false) => (
  resolveExpertEntitlement({ role, tenantEntitlement })
);

export function canShowExpertControl({ role, entitled = false, tenantPreference = false } = {}) {
  return tenantPreference === true && canEnterExpert(role, entitled);
}

export const canOpenPlatform = (capabilities = []) => capabilities.includes('platform.diagnostics.read');

export function resolveStudioMode({
  isCustomerView = false,
  activeSection = 'configurator',
  role = null,
  capabilities = [],
  expertRequested = false,
  tenantEntitlement = false,
} = {}) {
  if (isCustomerView) return 'showroom';
  if (activeSection === 'platform' && canOpenPlatform(capabilities)) return 'platform';
  if (expertRequested && canEnterExpert(role, tenantEntitlement)) return 'expert';
  return 'sales';
}
