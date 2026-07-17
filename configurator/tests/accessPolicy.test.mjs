import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeUserRecord } from '../api/_lib/accessPolicy.js';

test('active account with a matching session version is authorized', () => {
  assert.deepEqual(
    authorizeUserRecord({ status: 'active', session_version: 3 }, { sv: 3 }),
    { ok: true },
  );
});

test('frozen and blocked accounts are rejected', () => {
  assert.equal(
    authorizeUserRecord({ status: 'frozen', session_version: 3 }, { sv: 3 }).code,
    'ACCOUNT_RESTRICTED',
  );
  assert.equal(
    authorizeUserRecord({ status: 'blocked', session_version: 3 }, { sv: 3 }).code,
    'ACCOUNT_RESTRICTED',
  );
});

test('deleted accounts and stale sessions are rejected', () => {
  assert.equal(
    authorizeUserRecord({ status: 'active', session_version: 3, deleted_at: new Date() }, { sv: 3 }).code,
    'NOT_AUTHENTICATED',
  );
  assert.equal(
    authorizeUserRecord({ status: 'active', session_version: 4 }, { sv: 3 }).code,
    'SESSION_REVOKED',
  );
});
