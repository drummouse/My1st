import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { capabilitiesForRole } from '../api/_lib/superadminPolicy.js';

test('every Capture route authorizes server-side before any dispatch', async () => {
  const source = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  // Every action must map to an explicit capability; unknown actions 404
  // before any authorization or dispatch.
  const mapStart = source.indexOf('const capabilityByAction');
  const authorization = source.indexOf('requireCapability(req, res, capability)');
  const firstDispatch = source.indexOf("action === 'sessions'");
  assert.ok(mapStart > -1, 'capture handler must declare capabilityByAction');
  assert.ok(authorization > -1, 'capture handler must call requireCapability with the mapped capability');
  assert.ok(firstDispatch > authorization, 'authorization must run before action dispatch');
  assert.match(source, /sessions: 'capture\.create'/);
  assert.doesNotMatch(source, /req\.body\?\.capabilities|req\.headers\?\.role/);
});

test('capture capabilities are additive to existing roles, not a new role system', () => {
  for (const capability of ['capture.create', 'capture.review', 'capture.publish.tenant']) {
    assert.ok(capabilitiesForRole('owner').includes(capability), `owner needs ${capability}`);
    assert.ok(capabilitiesForRole('superadmin').includes(capability), `superadmin needs ${capability}`);
    assert.ok(!capabilitiesForRole('reseller').includes(capability), `reseller must not hold ${capability}`);
  }
  // Capture must not grant global catalog publication to owners.
  assert.ok(!capabilitiesForRole('owner').includes('catalog.publish'));
});

test('Vercel keeps Capture under one consolidated serverless function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions'));
  assert.ok(sources.includes('/api/capture/sessions/:id'));
  for (const rule of config.rewrites.filter((r) => r.source.startsWith('/api/capture'))) {
    assert.match(rule.destination, /^\/api\/capture\?action=/);
  }
});

test('smoke suite guards the Capture API for unauthenticated read and write', async () => {
  const source = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(source, /auth guard \/api\/capture\/sessions/);
  assert.match(source, /auth guard \/api\/capture\/sessions create/);
});
