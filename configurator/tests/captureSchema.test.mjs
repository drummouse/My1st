import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAPTURE_STATUSES, CAPTURE_TYPES, ASSET_PURPOSES, FIELD_SOURCES } from '../api/_lib/capturePolicy.js';

const requiredTables = [
  'capture_sessions', 'capture_assets', 'capture_fields', 'capture_review_comments',
  'capture_measurements', 'capture_claude_analyses',
];

async function schemas() {
  return Promise.all([
    readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8'),
    readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'),
  ]);
}

test('runtime and reference schemas contain every Capture table', async () => {
  for (const source of await schemas()) {
    for (const table of requiredTables) {
      assert.match(source, new RegExp(`create table if not exists ${table}`));
    }
  }
});

test('the status CHECK constraint matches the policy state machine exactly', async () => {
  const statusList = CAPTURE_STATUSES.map((status) => `'${status}'`).join(',');
  const typeList = CAPTURE_TYPES.map((type) => `'${type}'`).join(',');
  const purposeList = ASSET_PURPOSES.map((purpose) => `'${purpose}'`).join(',');
  const sourceList = FIELD_SOURCES.map((source) => `'${source}'`).join(',');
  for (const source of await schemas()) {
    assert.ok(source.includes(`check (status in (${statusList}))`), 'session status constraint drifted from capturePolicy');
    assert.ok(source.includes(`check (capture_type in (${typeList}))`), 'capture_type constraint drifted from capturePolicy');
    assert.ok(source.includes(`check (purpose in (${purposeList}))`), 'asset purpose constraint drifted from capturePolicy');
    assert.ok(source.includes(`check (source in (${sourceList}))`), 'field source constraint drifted from capturePolicy');
  }
});

test('idempotency and scoping indexes exist in both schemas', async () => {
  for (const source of await schemas()) {
    assert.match(source, /capture_sessions_owner_client_ref_key on capture_sessions \(owner_id, client_ref\) where client_ref is not null/);
    assert.match(source, /capture_sessions_owner_status_idx on capture_sessions \(owner_id, status\)/);
    assert.match(source, /unique \(session_id, field_key\)/);
  }
});

test('capture assets store URLs and metadata, never image bytes', async () => {
  for (const source of await schemas()) {
    const captureBlock = source.slice(source.indexOf('create table if not exists capture_assets'));
    const tableBody = captureBlock.slice(0, captureBlock.indexOf(')`') > -1 ? captureBlock.indexOf('created_at') : undefined);
    assert.match(tableBody, /url text not null/);
    assert.doesNotMatch(tableBody, /bytea/);
  }
});
