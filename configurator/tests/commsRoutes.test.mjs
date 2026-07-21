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

test('scheduled drain: method + secret are rejected before any database work', () => {
  const source = fs.readFileSync(routeUrl, 'utf8');
  // The scheduler branch must run before ensureSchema()/requireCapability —
  // asserted by ordering: the scheduler-secret header check appears in the
  // source ahead of the first ensureSchema() call inside that same branch.
  const schedulerBranchIndex = source.indexOf("action === 'drain' && req.headers[SCHEDULER_SECRET_HEADER]");
  assert.ok(schedulerBranchIndex > -1, 'scheduler branch present');
  const branch = source.slice(schedulerBranchIndex, source.indexOf('return;', schedulerBranchIndex + 400));
  const methodCheckIndex = branch.indexOf("req.method !== 'POST'");
  const secretCheckIndex = branch.indexOf('verifySchedulerSecret(');
  const ensureSchemaIndex = branch.indexOf('ensureSchema()');
  assert.ok(methodCheckIndex > -1 && secretCheckIndex > -1 && ensureSchemaIndex > -1, 'all three checks present in the scheduler branch');
  assert.ok(methodCheckIndex < ensureSchemaIndex, 'method checked before any DB work');
  assert.ok(secretCheckIndex < ensureSchemaIndex, 'secret checked before any DB work');
});

test('scheduler secret is read from an environment variable and never logged', () => {
  const source = fs.readFileSync(routeUrl, 'utf8');
  assert.match(source, /process\.env\.COMMS_SCHEDULER_SECRET/);
  // No console.* call anywhere in the file may reference the secret env var
  // or the raw header value.
  for (const line of source.split('\n')) {
    if (/console\./.test(line)) {
      assert.equal(/COMMS_SCHEDULER_SECRET|SCHEDULER_SECRET_HEADER/.test(line), false, `secret must not appear in a log line: ${line.trim()}`);
    }
  }
});

test('the drain claim uses an atomic, concurrency-safe row lock (FOR UPDATE SKIP LOCKED)', () => {
  const source = fs.readFileSync(routeUrl, 'utf8').toLowerCase();
  assert.match(source, /for update skip locked/);
});

test('smoke suite covers the drain scheduler auth guards', () => {
  const smoke = fs.readFileSync(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/comms\/drain/);
  assert.match(smoke, /scheduler auth guard \/api\/comms\/drain/);
  assert.match(smoke, /x-comms-scheduler-secret/);
});

test('legacy failed rows are permanently excluded from automatic re-drain (D-066/D-067)', () => {
  const source = fs.readFileSync(routeUrl, 'utf8');
  const claimQueryIndex = source.indexOf('async function claimBatch');
  const claimQuery = source.slice(claimQueryIndex, claimQueryIndex + 800);
  assert.match(claimQuery, /status in \('pending', 'processing'\)/);
  assert.equal(claimQuery.includes("'failed'"), false, "the claim query's eligibility list must not include 'failed'");
});
