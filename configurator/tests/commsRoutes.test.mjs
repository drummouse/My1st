import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routeUrl = new URL('../api/comms/index.js', import.meta.url);

test('consolidated comms route requires server-side capabilities and has no phone-provisioning action', () => {
  const source = fs.readFileSync(routeUrl, 'utf8');
  assert.match(source, /requireCapability/);
  for (const capability of ['comms.manage', 'comms.operate']) {
    assert.equal(source.includes(capability), true, capability);
  }
  assert.equal(source.includes('provision'), false, 'no per-tenant Twilio number provisioning action');
});

test('Vercel routes comms actions through one function — the 12th and last Hobby slot', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.rewrites.some((rule) => rule.source === '/api/comms/:action'), true);
});
