import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtimeSchema = fs.readFileSync(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
const referenceSchema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

// settings.singleton was the original single-global-row primary key; when
// owner_id-scoped multi-tenancy replaced that design, singleton's PRIMARY
// KEY was never dropped, so only one settings row could ever exist
// platform-wide (every row defaults singleton to the same value `true`).
// The fix moves the primary key to `id`, backfilling any pre-existing row
// that predates that column, without dropping `singleton` itself.
test('settings.id is the primary key, not the vestigial singleton column', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.equal(source.includes('id uuid primary key default gen_random_uuid()'), true,
      'settings.id must be declared as the primary key for fresh databases');
    assert.equal(/singleton boolean primary key/.test(source), false,
      'singleton must no longer carry the primary key');
    for (const fragment of [
      'update settings set id = gen_random_uuid() where id is null',
      'alter table settings alter column id set not null',
      'alter table settings drop constraint if exists settings_pkey',
      'alter table settings add constraint settings_pkey primary key (id)',
    ]) {
      assert.equal(source.includes(fragment), true, `missing fixup: ${fragment}`);
    }
  }
});

test('settings.owner_id scoping is unchanged by the primary-key fix', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.equal(source.includes('alter table settings add column if not exists owner_id uuid references users(id)'), true);
    assert.equal(source.includes('create unique index if not exists settings_owner_id_key on settings (owner_id)'), true);
  }
});
