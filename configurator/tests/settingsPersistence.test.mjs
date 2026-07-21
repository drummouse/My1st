import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PROJECTS_DATABASE_URL ||= 'postgres://test:test@localhost/test';
const { createSettingsHandler, validateDefaultCatalogItems } = await import('../api/settings/index.js');
const { serializeTenantSettings } = await import('../api/_lib/tenantFeatures.js');

function createResponseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    setHeader() {},
  };
}

function recordingQuery(calls) {
  return async (strings, ...values) => {
    calls.push({ statement: strings.join('?'), values });
    return [{ show_expert_mode: true }];
  };
}

function createHandler(query) {
  return createSettingsHandler({
    query,
    ensureSettingsSchema: async () => {},
    authorizeSettingsUser: async () => ({ id: 'owner-1', role: 'superadmin' }),
    serializeSettings: ({ row }) => row,
  });
}

test('first Settings PUT inserts schema defaults for omitted required discounts', async () => {
  const calls = [];
  const handler = createHandler(recordingQuery(calls));
  const response = createResponseRecorder();

  await handler({ method: 'PUT', body: { showExpertMode: true } }, response);

  assert.equal(response.statusCode, 200);
  assert.ok(calls.at(-1).values.includes(0.07));
  assert.ok(calls.at(-1).values.includes(0.5));
});

test('partial Discounts PUT supplies a municipal tax default without overwriting an existing value', async () => {
  const calls = [];
  const handler = createHandler(recordingQuery(calls));
  const response = createResponseRecorder();

  await handler({ method: 'PUT', body: { discountRules: [] } }, response);

  assert.equal(response.statusCode, 200);
  assert.ok(calls.at(-1).values.includes(0));
  assert.match(
    calls.at(-1).statement,
    /municipal_tax_rate = case when \? then coalesce\(excluded\.municipal_tax_rate, settings\.municipal_tax_rate\) else settings\.municipal_tax_rate end/i,
  );
});

function boundValueFor(statement, values, marker) {
  const markerIndex = statement.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing SQL marker: ${marker}`);
  const valueIndex = (statement.slice(0, markerIndex).match(/\?/g) || []).length;
  return values[valueIndex];
}

test('default catalog null clears explicitly while omission preserves the existing value', async () => {
  const nullCalls = [];
  const nullResponse = createResponseRecorder();
  await createHandler(recordingQuery(nullCalls))(
    { method: 'PUT', body: { defaultCatalogItems: null } },
    nullResponse,
  );

  const omittedCalls = [];
  const omittedResponse = createResponseRecorder();
  await createHandler(recordingQuery(omittedCalls))(
    { method: 'PUT', body: { reportFooterNote: 'Keep catalog defaults' } },
    omittedResponse,
  );

  const marker = 'default_catalog_items = case when ';
  assert.match(
    nullCalls.at(-1).statement,
    /default_catalog_items = case when \? then excluded\.default_catalog_items else settings\.default_catalog_items end/,
  );
  assert.equal(boundValueFor(nullCalls.at(-1).statement, nullCalls.at(-1).values, marker), true);
  assert.equal(boundValueFor(omittedCalls.at(-1).statement, omittedCalls.at(-1).values, marker), false);
  assert.equal(nullCalls.at(-1).values[19], null, 'explicit null is bound as SQL NULL, not JSON null');
  assert.equal(nullCalls.at(-1).values.includes('null'), false);
});

test('existing duplicate Settings defaults normalize on read and cannot persist twice', async () => {
  const trim = {
    optionId: 'gutter-a', source: 'library', kind: 'trim', trimKind: 'gutters',
    label: 'Gutter A', quantity: 10, unit: 'LF', locked: false,
  };
  const duplicate = { ...trim, label: 'Duplicate Gutter A', quantity: 99 };
  const service = {
    optionId: 'cleanup', source: 'custom-service', kind: 'service', label: 'Cleanup',
    quantity: 1, unit: 'each', locked: false,
  };

  assert.deepEqual(validateDefaultCatalogItems([trim, duplicate, service, { ...service }]), [trim, service]);
  assert.deepEqual(serializeTenantSettings({
    row: { default_catalog_items: [trim, duplicate, service, { ...service }] },
    role: 'user',
  }).default_catalog_items, [trim, service]);

  const calls = [];
  const response = createResponseRecorder();
  await createHandler(recordingQuery(calls))({
    method: 'PUT',
    body: { defaultCatalogItems: [trim, duplicate, service, { ...service }] },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.ok(calls.at(-1).values.includes(JSON.stringify([trim, service])));
});

test('Settings constraint failures are not reported as database unreachable', async (t) => {
  t.mock.method(console, 'error', () => {});
  const handler = createHandler(async () => {
    throw new Error('constraint');
  });
  const response = createResponseRecorder();

  await handler({ method: 'PUT', body: {} }, response);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'SETTINGS_PERSISTENCE_FAILED');
});

test('wrapped Settings connectivity failures remain database-unavailable responses', async (t) => {
  t.mock.method(console, 'error', () => {});
  const handler = createHandler(async () => {
    const error = new Error('Neon request failed');
    error.sourceError = { code: 'ENOTFOUND' };
    throw error;
  });
  const response = createResponseRecorder();

  await handler({ method: 'PUT', body: {} }, response);

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.code, undefined);
});
