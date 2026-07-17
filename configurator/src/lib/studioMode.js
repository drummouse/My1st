export const canEnterExpert = (role) => role === 'owner' || role === 'superadmin';

export const canOpenPlatform = (capabilities = []) => capabilities.includes('platform.diagnostics.read');

export function resolveStudioMode({
  isCustomerView = false,
  activeSection = 'configurator',
  role = null,
  capabilities = [],
  expertRequested = false,
} = {}) {
  if (isCustomerView) return 'showroom';
  if (activeSection === 'platform' && canOpenPlatform(capabilities)) return 'platform';
  if (expertRequested && canEnterExpert(role)) return 'expert';
  return 'sales';
}
