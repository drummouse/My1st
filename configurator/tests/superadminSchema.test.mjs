import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtimeSchema = fs.readFileSync(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
const referenceSchema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

test('runtime and reference schemas include SuperAdmin account contracts', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    for (const fragment of [
      "status text not null default 'active'",
      'session_version integer not null default 1',
      'must_change_password boolean not null default false',
      'deleted_at timestamptz',
      'create table if not exists superadmin_audit_events',
      'create table if not exists notification_outbox',
    ]) {
      assert.equal(source.includes(fragment), true, `missing: ${fragment}`);
    }
  }
});

test('runtime schema removes the legacy developer role', () => {
  assert.match(runtimeSchema, /update users set role = 'owner' where role = 'developer'/);
});

test('runtime and reference schemas add the reseller role and scoping column', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.match(source, /reseller_id uuid references users\(id\)/);
    assert.match(source, /check \(role in \('owner', 'reseller', 'superadmin'\)\)/);
  }
});
