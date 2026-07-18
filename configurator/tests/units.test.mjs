import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  areaUnit,
  feetToDisplay,
  linearUnit,
  resolveUnitSystem,
  squareFeetToDisplay,
} from '../src/lib/units.js';
import { serializeTenantSettings } from '../api/_lib/tenantFeatures.js';

process.env.PROJECTS_DATABASE_URL ||= 'postgres://test:test@localhost/test';
const { createSettingsHandler } = await import('../api/settings/index.js');

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

test('branch-ready units fall back to the company without project overrides', () => {
  assert.equal(resolveUnitSystem({ companyUnits: 'imperial' }), 'imperial');
  assert.equal(resolveUnitSystem({ companyUnits: 'imperial', branchUnits: 'metric' }), 'metric');
  assert.equal(resolveUnitSystem({ companyUnits: 'metric', branchUnits: null }), 'metric');
});

test('unit labels and exact base-unit conversions follow the resolved system', () => {
  assert.equal(linearUnit('imperial'), 'ft');
  assert.equal(linearUnit('metric'), 'm');
  assert.equal(areaUnit('imperial'), 'sq ft');
  assert.equal(areaUnit('metric'), 'm²');
  assert.equal(feetToDisplay(1, 'imperial'), 1);
  assert.equal(feetToDisplay(1, 'metric'), 0.3048);
  assert.equal(squareFeetToDisplay(1, 'imperial'), 1);
  assert.equal(squareFeetToDisplay(1, 'metric'), 0.09290304);
});

test('unknown unit metadata is rejected instead of silently guessed', () => {
  assert.throws(
    () => resolveUnitSystem({ companyUnits: 'yards' }),
    /invalid unit system/i,
  );
  assert.throws(
    () => resolveUnitSystem({ companyUnits: 'imperial', branchUnits: 'yards' }),
    /invalid unit system/i,
  );
  assert.throws(() => linearUnit('yards'), /invalid unit system/i);
  assert.throws(() => areaUnit('yards'), /invalid unit system/i);
  assert.throws(() => feetToDisplay(1, 'yards'), /invalid unit system/i);
  assert.throws(() => squareFeetToDisplay(1, 'yards'), /invalid unit system/i);
});

test('tenant Settings DTO explicitly exposes the safe company unit enum', () => {
  const dto = serializeTenantSettings({
    role: 'owner',
    row: {
      owner_id: 'owner-1',
      unit_system: 'metric',
      expert_mode_enabled: false,
      show_expert_mode: false,
    },
  });

  assert.equal(dto.unit_system, 'metric');
  assert.equal(Object.hasOwn(dto, 'owner_id'), false);
});

test('tenant Settings PUT rejects an invalid company unit before mutation', async () => {
  const statements = [];
  const handler = createSettingsHandler({
    query: async (strings) => {
      statements.push(strings.join('?'));
      return [{ unit_system: 'imperial' }];
    },
    ensureSettingsSchema: async () => {},
    authorizeSettingsUser: async () => ({ id: 'owner-1', role: 'owner' }),
    serializeSettings: ({ row }) => row,
  });
  const res = createResponseRecorder();

  await handler({ method: 'PUT', body: { unitSystem: 'yards', gstRate: 0.07 } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body?.error || '', /unit system/i);
  assert.deepEqual(statements, []);
});

test('tenant Settings PUT persists valid company units in the scoped upsert', async () => {
  const calls = [];
  const handler = createSettingsHandler({
    query: async (strings, ...values) => {
      calls.push({ statement: strings.join('?'), values });
      return [{ unit_system: 'metric' }];
    },
    ensureSettingsSchema: async () => {},
    authorizeSettingsUser: async () => ({ id: 'owner-1', role: 'owner' }),
    serializeSettings: ({ row }) => row,
  });
  const res = createResponseRecorder();

  await handler({ method: 'PUT', body: { unitSystem: 'metric' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].statement, /insert into settings[\s\S]*unit_system/i);
  assert.match(calls[0].statement, /unit_system = case/i);
  assert.ok(calls[0].values.includes('metric'));
  assert.equal(res.body.unit_system, 'metric');
});

test('schema, UI, and saved-design contracts keep units company-scoped', async () => {
  const [db, settings, designState, newProjectDesignState] = await Promise.all([
    readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/SettingsPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/designState.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/newProjectDesignState.js', import.meta.url), 'utf8'),
  ]);

  assert.match(
    db,
    /alter table settings add column if not exists unit_system text not null default 'imperial' check \(unit_system in \('imperial', 'metric'\)\)/i,
  );
  assert.match(settings, /unitSystem:\s*row\.unit_system/);
  assert.match(settings, /unitSystem:\s*form\.unitSystem/);
  assert.match(settings, /id="settings-unit-system"[\s\S]*?<option value="imperial">Imperial[\s\S]*?<option value="metric">Metric/);
  assert.doesNotMatch(designState, /unitSystem|unit_system/);
  assert.doesNotMatch(newProjectDesignState, /unitSystem|unit_system/);
});
