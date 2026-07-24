import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Static source checks, same convention as superadminRoutes.test.mjs — this
// sandbox has no live database to run a real integration test against, so
// these assert the scoping guard is actually wired into every handler that
// touches a specific user row, not just declared and forgotten.
const routeSource = fs.readFileSync(new URL('../api/superadmin/index.js', import.meta.url), 'utf8');

test('tenant list/detail, status, and password-reset all consult reseller scoping', () => {
  assert.match(routeSource, /notScopedToReseller/);
  const scopedCallSites = routeSource.match(/notScopedToReseller\(actor\)/g) || [];
  // handleTenants (list + detail) + handleStatus + handlePasswordReset = 4 call sites.
  assert.equal(scopedCallSites.length, 4, 'expected exactly 4 reseller-scope checks');
});

test('account creation only lets a superadmin mint another reseller, and stamps reseller_id from the actor', () => {
  assert.match(routeSource, /requestedRole === 'reseller' && actor\.role === 'superadmin'/);
  assert.match(routeSource, /const resellerId = actor\.role === 'reseller' \? actor\.id : null/);
});
