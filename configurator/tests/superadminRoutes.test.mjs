import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routeUrl = new URL('../api/superadmin/index.js', import.meta.url);
const authUrl = new URL('../api/_lib/auth.js', import.meta.url);

test('consolidated SuperAdmin route requires server-side capabilities', () => {
  const source = fs.readFileSync(routeUrl, 'utf8');
  assert.match(source, /requireCapability/);
  for (const capability of ['platform.diagnostics.read', 'users.create', 'users.freeze', 'users.password.reset']) {
    assert.equal(source.includes(capability), true, capability);
  }
  assert.doesNotMatch(source, /customer_name|address_line|\bdesign\b/);
});

test('Vercel routes SuperAdmin actions through one function', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites.some((rule) => rule.source === '/api/superadmin/:action'), true);
  assert.equal(config.rewrites.some((rule) => rule.source === '/api/superadmin/tenants/:id/:sub'), true);
});

test('SuperAdmin tenant administration protects the external Expert Mode entitlement', () => {
  const source = fs.readFileSync(routeUrl, 'utf8');
  const authSource = fs.readFileSync(authUrl, 'utf8');
  assert.match(source, /expert-mode[\s\S]*platform\.diagnostics\.read/);
  assert.match(source, /readTenantExpertEntitlement/);
  assert.match(source, /writeTenantExpertEntitlement/);
  assert.match(source, /req\.body\?\.EXPERT_MODE_VAR/);
  assert.match(source, /req\.body\?\.reason/);
  assert.match(source, /createSupportReference\(\)/);
  assert.match(source, /action === 'tenants' && req\.query\.sub === 'expert-mode'/);
  assert.doesNotMatch(source, /req\.body\?\.expert_mode_enabled/);
  assert.match(authSource, /where u\.id = \$\{tenantId\} and u\.role = 'owner'/i);
});

test('Expert Mode entitlement writes audit atomically with a support reference', () => {
  const source = fs.readFileSync(authUrl, 'utf8');
  assert.match(source, /writeTenantExpertEntitlement[\s\S]*sql\.transaction\(\[/);
  assert.match(source, /insert into superadmin_audit_events/);
  assert.match(source, /tenant\.expert-mode\.updated/);
  assert.match(source, /support_reference/);
  assert.match(source, /reason/);
});
