import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// D-071 handler-level regression (not just source-text ordering): mocks
// api/_lib/db.js's sql/ensureSchema so the real exported handler from
// api/comms/index.js can be invoked directly and its actual behavior
// observed — did ensureSchema() run, what status code was returned — for
// both the scheduler-secret path and the manual (session-cookie) path,
// with and without valid credentials. Requires Node's
// --experimental-test-module-mocks flag (see package.json's "test" script).
const dbUrl = new URL('../api/_lib/db.js', import.meta.url).href;

const state = { ensureSchemaCalls: 0, claimRows: [] };

function mockSql(strings, ...values) {
  // The only query this test's scenarios ever reach is claimBatch's atomic
  // claim — returning an empty array is a legitimate, fully-formed "nothing
  // to do" result, exercised end-to-end through the real runDrain()/
  // handleDrain() code path.
  void strings; void values;
  return Promise.resolve(state.claimRows);
}
mockSql.transaction = async () => [];

mock.module(dbUrl, {
  namedExports: {
    ensureSchema: async () => { state.ensureSchemaCalls++; },
    sql: mockSql,
  },
});

process.env.COMMS_SCHEDULER_SECRET = 'handler-test-scheduler-secret';
const { default: handler } = await import('../api/comms/index.js');

function fakeReqRes({ method = 'POST', headers = {}, body = {}, action = 'drain' } = {}) {
  const res = {
    statusCode: null,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader(k, v) { this.headers[k] = v; },
  };
  const req = { method, headers, body, query: { action } };
  return { req, res };
}

test.beforeEach(() => { state.ensureSchemaCalls = 0; state.claimRows = []; });

test('manual path, no session cookie at all: rejects 401 and never calls ensureSchema', async () => {
  const { req, res } = fakeReqRes({ headers: {} });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(state.ensureSchemaCalls, 0);
});

test('manual path (identity action), no session cookie: also rejects without touching the schema', async () => {
  const { req, res } = fakeReqRes({ method: 'GET', headers: {}, action: 'identity' });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(state.ensureSchemaCalls, 0);
});

test('scheduler path, wrong secret: rejects 401 and never calls ensureSchema', async () => {
  const { req, res } = fakeReqRes({ headers: { 'x-comms-scheduler-secret': 'wrong-secret' } });
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(state.ensureSchemaCalls, 0);
});

test('scheduler path, missing method (GET): rejects 405 before checking the secret or touching the schema', async () => {
  const { req, res } = fakeReqRes({ method: 'GET', headers: { 'x-comms-scheduler-secret': 'wrong-secret' } });
  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.equal(state.ensureSchemaCalls, 0);
});

test('scheduler path, correct secret: authorizes, calls ensureSchema exactly once, and runs a real (empty) drain', async () => {
  const { req, res } = fakeReqRes({ headers: { 'x-comms-scheduler-secret': 'handler-test-scheduler-secret' } });
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.ensureSchemaCalls, 1);
  assert.deepEqual(res.body, { claimed: 0, sent: 0, retried: 0, failed: 0, skipped: 0 });
});
