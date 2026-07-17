import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routeUrl = new URL('../api/superadmin/index.js', import.meta.url);

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
