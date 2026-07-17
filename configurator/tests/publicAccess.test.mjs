import test from 'node:test';
import assert from 'node:assert/strict';
import { publicTenantAccess } from '../api/_lib/publicAccess.js';

test('active tenant public links remain available', () => {
  assert.deepEqual(publicTenantAccess('active'), { allowed: true });
});

for (const status of ['frozen', 'blocked', 'deleted']) {
  test(`${status} tenant receives a neutral unavailable response`, () => {
    assert.deepEqual(publicTenantAccess(status), {
      allowed: false,
      status: 503,
      body: { error: 'This design is temporarily unavailable. Please contact the contractor.' },
    });
  });
}
