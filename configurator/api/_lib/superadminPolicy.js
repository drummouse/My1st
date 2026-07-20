// Reseller sits between superadmin and owner: full lifecycle control over
// the owner accounts it creates (including delete) and its own library/skin
// assignments, but never the platform-wide views (audit, diagnostics,
// tenant transfer) or another reseller's/superadmin's data. Row-level
// scoping (a reseller only ever touching accounts where reseller_id equals
// its own id) is enforced in api/superadmin/index.js — this map only
// controls which actions a role can attempt at all, not which rows.
const ROLE_CAPABILITIES = {
  // Capture: tenancy is single-seat (one login = one company), so the owner
  // is both contributor and reviewer for its own tenant's captures — row
  // scoping to the owner's records is enforced in captureService.js, not
  // here. Global publication stays superadmin-only (catalog.publish).
  owner: [
    'capture.create',
    'capture.review',
    'capture.publish.tenant',
    'library.read',
  ],
  reseller: [
    'users.create',
    'users.freeze',
    'users.block',
    'users.delete',
    'users.restore',
    'users.password.reset',
    'catalog.read',
    'catalog.write',
    'skins.manage',
  ],
  superadmin: [
    'capture.create',
    'capture.review',
    'capture.publish.tenant',
    'library.read',
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
