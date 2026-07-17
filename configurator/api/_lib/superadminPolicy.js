const ROLE_CAPABILITIES = {
  owner: [],
  superadmin: [
    'users.create',
    'users.freeze',
    'users.block',
    'users.delete',
    'users.restore',
    'users.password.reset',
    'tenants.transfer.export',
    'tenants.transfer.import',
    'catalog.read',
    'catalog.write',
    'catalog.import',
    'catalog.export',
    'catalog.review',
    'catalog.publish',
    'skins.manage',
    'platform.audit.read',
    'platform.diagnostics.read',
  ],
};

const ACCOUNT_TRANSITIONS = {
  active: ['frozen', 'blocked', 'deleted'],
  frozen: ['active', 'blocked', 'deleted'],
  blocked: ['active', 'deleted'],
  deleted: ['active'],
};

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseSuperAdminEmails(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map(normalizeEmail)
      .filter(Boolean),
  );
}

export function roleForBootstrap(user, allowedEmails) {
  if (user?.role === 'superadmin') return 'superadmin';
  return allowedEmails.has(normalizeEmail(user?.email)) ? 'superadmin' : 'owner';
}

export function capabilitiesForRole(role) {
  return [...(ROLE_CAPABILITIES[role] || [])];
}

export function hasCapability(role, capability) {
  return capabilitiesForRole(role).includes(capability);
}

export function assertAccountTransition(actor, target, nextStatus, reason) {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('A reason is required');
  if (actor?.id === target?.id && nextStatus !== 'active') {
    throw new Error('Cannot restrict your own account');
  }
  if (!ACCOUNT_TRANSITIONS[target?.status]?.includes(nextStatus)) {
    throw new Error('Invalid account status transition');
  }
  return { nextStatus, reason: cleanReason };
}
