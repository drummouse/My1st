import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const runtimeSchema = fs.readFileSync(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
const referenceSchema = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

test('runtime and reference schemas add the sender_identities table with a notify_mode, no per-tenant Twilio number', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.equal(source.includes('create table if not exists sender_identities'), true);
    for (const fragment of [
      'user_id uuid not null references users(id)',
      "notify_mode text not null default 'self'",
      'display_name text',
      'contact_email text',
      'sender_identities_user_id_key',
    ]) {
      assert.equal(source.includes(fragment), true, `missing: ${fragment}`);
    }
    assert.equal(source.includes('twilio_phone_number'), false, 'no per-tenant Twilio number column');
  }
});

test('runtime and reference schemas widen notification_outbox for business-facing comms', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    for (const fragment of ['sender_user_id uuid references users(id)', 'to_email text', 'to_phone text']) {
      assert.equal(source.includes(fragment), true, `missing: ${fragment}`);
    }
  }
});

test('runtime and reference schemas add optional customer contact to projects', () => {
  for (const source of [runtimeSchema, referenceSchema]) {
    assert.equal(source.includes('customer_email text'), true);
    assert.equal(source.includes('customer_phone text'), true);
  }
});
