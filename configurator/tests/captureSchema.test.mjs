import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CAPTURE_STATUSES, CAPTURE_TYPES, FIELD_SOURCES, ITEM_TYPES } from '../api/_lib/capturePolicy.js';

const requiredTables = [
  'capture_sessions', 'capture_assets', 'capture_fields', 'capture_review_comments',
  'capture_measurements', 'capture_claude_analyses', 'capture_tags',
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
  const sourceList = FIELD_SOURCES.map((source) => `'${source}'`).join(',');
  for (const source of await schemas()) {
    assert.ok(source.includes(`check (status in (${statusList}))`), 'session status constraint drifted from capturePolicy');
    assert.ok(source.includes(`check (capture_type in (${typeList}))`), 'capture_type constraint drifted from capturePolicy');
    assert.ok(source.includes(`check (source in (${sourceList}))`), 'field source constraint drifted from capturePolicy');
  }
});

test('asset purpose is an open vocabulary — no closed-list CHECK constrains it (flexible-tags slice)', async () => {
  for (const source of await schemas()) {
    const captureAssetsBlock = source.slice(
      source.indexOf('create table if not exists capture_assets'),
      source.indexOf('create index if not exists capture_assets_session_id_idx'),
    );
    assert.match(captureAssetsBlock, /purpose text not null,/, 'purpose should be a plain, unconstrained column');
    assert.doesNotMatch(captureAssetsBlock, /purpose in \(/, 'purpose must not carry a closed-list CHECK');
  }
});

test('capture_sessions carries the flexible tags/item_type columns and capture_tags matches the policy vocabulary', async () => {
  const itemTypeList = ITEM_TYPES.map((type) => `'${type}'`).join(',');
  for (const source of await schemas()) {
    assert.match(source, /tags jsonb not null default '\[\]'::jsonb/, 'capture_sessions.tags column missing');
    assert.ok(
      source.includes(`item_type text check (item_type is null or item_type in (${itemTypeList}))`)
      || source.includes(`item_type text\n        check (item_type is null or item_type in (${itemTypeList}))`),
      'capture_sessions.item_type CHECK drifted from capturePolicy ITEM_TYPES',
    );
  }
});

test('capture_tags is a tenant-scoped vocabulary table, unique per owner+tag', async () => {
  for (const source of await schemas()) {
    const block = source.slice(source.indexOf('create table if not exists capture_tags'));
    assert.match(block, /owner_id uuid not null references users\(id\)/);
    assert.match(block, /tag text not null/);
    assert.match(block, /unique \(owner_id, tag\)/);
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
