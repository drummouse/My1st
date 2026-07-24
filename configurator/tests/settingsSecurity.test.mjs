import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { serializeTenantSettings } from '../api/_lib/tenantFeatures.js';

process.env.PROJECTS_DATABASE_URL ||= 'postgres://test:test@localhost/test';
const settingsRoute = await import('../api/settings/index.js');
const settingsSource = fs.readFileSync(new URL('../api/settings/index.js', import.meta.url), 'utf8');

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

function createBehavioralHandler({ role = 'owner', tenantEntitlement = false } = {}) {
  const statements = [];
  const query = async (strings) => {
    const statement = strings.join('?');
    statements.push(statement);
    if (/select expert_mode_enabled/i.test(statement)) return [{ expert_mode_enabled: tenantEntitlement }];
    return [{ expert_mode_enabled: tenantEntitlement, show_expert_mode: false }];
  };
  const handler = settingsRoute.createSettingsHandler({
    query,
    ensureSettingsSchema: async () => {},
    authorizeSettingsUser: async () => ({ id: 'owner-1', role }),
    serializeSettings: ({ row }) => row,
  });
  return { handler, statements };
}

test('tenant settings route exposes an injectable handler for behavioral authorization tests', () => {
  assert.equal(typeof settingsRoute.createSettingsHandler, 'function');
});

test('tenant settings PUT rejects entitlement fields before any settings update', async (t) => {
  for (const field of ['EXPERT_MODE_VAR', 'expert_mode_enabled']) {
    await t.test(field, async () => {
      const { handler, statements } = createBehavioralHandler({ tenantEntitlement: true });
      const res = createResponseRecorder();

      await handler({ method: 'PUT', body: { gstRate: 0.07, [field]: true } }, res);

      assert.equal(res.statusCode, 400);
      assert.match(res.body?.error || '', /not accepted/i);
      assert.deepEqual(statements, []);
    });
  }
});

test('tenant settings PUT rejects preference aliases for an unentitled owner without a partial update', async (t) => {
  for (const field of ['showExpertMode', 'show_expert_mode']) {
    await t.test(field, async () => {
      const { handler, statements } = createBehavioralHandler({ tenantEntitlement: false });
      const res = createResponseRecorder();

      await handler({ method: 'PUT', body: { gstRate: 0.07, [field]: true } }, res);

      assert.equal(res.statusCode, 403);
      assert.match(res.body?.error || '', /entitled/i);
      assert.equal(statements.length, 1);
      assert.match(statements[0], /select expert_mode_enabled/i);
      assert.doesNotMatch(statements.join('\n'), /insert into settings|update settings/i);
    });
  }
});

test('tenant settings DTO excludes storage and entitlement-private fields', () => {
  const dto = serializeTenantSettings({
    role: 'owner',
    row: {
      id: 'settings-1',
      owner_id: 'owner-1',
      singleton: true,
      gst_rate: '0.05',
      expert_mode_enabled: false,
      show_expert_mode: true,
    },
  });

  assert.deepEqual(dto, {
    gst_rate: '0.05',
    expertModeEntitled: false,
    show_expert_mode: false,
  });
  assert.equal(Object.hasOwn(dto, 'expert_mode_enabled'), false);
  assert.equal(Object.hasOwn(dto, 'owner_id'), false);
  assert.equal(Object.hasOwn(dto, 'singleton'), false);
  assert.equal(Object.hasOwn(dto, 'id'), false);
});

test('tenant settings DTO returns only effective Expert Mode values', () => {
  assert.deepEqual(
    serializeTenantSettings({
      role: 'owner',
      row: { expert_mode_enabled: true, show_expert_mode: true },
    }),
    { expertModeEntitled: true, show_expert_mode: true },
  );
  assert.deepEqual(
    serializeTenantSettings({
      role: 'superadmin',
      row: { expert_mode_enabled: false, show_expert_mode: true },
    }),
    { expertModeEntitled: true, show_expert_mode: true },
  );
});

test('tenant settings route uses explicit projections for reads and writes', () => {
  assert.doesNotMatch(settingsSource, /select \*/i);
  assert.doesNotMatch(settingsSource, /returning \*/i);
  assert.match(settingsSource, /serializeTenantSettings/);
  assert.match(settingsSource, /expert_mode_enabled/);
  assert.match(settingsSource, /show_expert_mode/);
  assert.match(settingsSource, /SETTINGS_PERSISTENCE_FAILED/);
});
