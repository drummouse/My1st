import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredTables = [
  'library_records', 'library_product_details', 'library_profile_details',
  'library_color_details', 'library_relationships', 'library_documents',
  'library_document_records', 'library_import_batches', 'library_migrations',
];

test('runtime and reference schemas contain every Library Core table and critical constraints', async () => {
  const runtime = await readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  const reference = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  for (const table of requiredTables) {
    assert.match(runtime, new RegExp(`create table if not exists ${table}`));
    assert.match(reference, new RegExp(`create table if not exists ${table}`));
  }
  for (const source of [runtime, reference]) {
    assert.match(source, /version integer not null default 1 check \(version > 0\)/);
    assert.match(source, /library_record_code_scope_unique/);
    assert.match(source, /unique \(migration_key\)/);
    assert.match(source, /scope = 'global' and tenant_id is null/);
    // D-076: 'texture' joins the record-type vocabulary (asset-graph mapping).
    assert.match(source, /record_type in \('product','profile','color','texture','category','manufacturer','supplier','collection','catalog'\)/);
  }
  // The widening must drop-and-re-add the constraint for tables created by
  // an earlier stage's narrower CHECK, same as capture_type/asset_purpose.
  assert.match(runtime, /alter table library_records drop constraint if exists library_records_record_type_check/);
});
