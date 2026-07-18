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

test('runtime schema adds disabled-by-default tenant Expert Mode controls idempotently', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.match(
      source,
      /alter table settings add column if not exists expert_mode_enabled boolean not null default false/i,
    );
    assert.match(
      source,
      /alter table settings add column if not exists show_expert_mode boolean not null default false/i,
    );
  }
});

test('settings migration replaces the legacy singleton key without losing rows', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.doesNotMatch(source, /singleton boolean primary key/i);
    assert.doesNotMatch(source, /singleton boolean[^,\n]*default true/i);
    assert.doesNotMatch(source, /check\s*\(singleton\)/i);
    assert.match(source, /id uuid primary key default gen_random_uuid\(\)/i);
    assert.match(source, /alter table settings alter column singleton drop default/i);
    assert.match(source, /alter table settings alter column singleton drop not null/i);
    assert.match(source, /pg_get_constraintdef/i);
    assert.match(source, /attname = 'singleton'/i);
    assert.match(source, /create unique index if not exists settings_owner_id_key on settings \(owner_id\)/i);
  }
});
