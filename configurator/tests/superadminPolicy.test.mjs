import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertAccountTransition,
  hasCapability,
  parseSuperAdminEmails,
  roleForBootstrap,
} from '../api/_lib/superadminPolicy.js';

test('bootstrap normalizes case and whitespace without silent demotion', () => {
  const allowed = parseSuperAdminEmails(' Admin@IronWrap.ca, ops@example.com ');

  assert.equal(
    roleForBootstrap({ email: 'admin@ironwrap.ca', role: 'owner' }, allowed),
    'superadmin',
  );
  assert.equal(
    roleForBootstrap({ email: 'removed@example.com', role: 'superadmin' }, new Set()),
    'superadmin',
  );
});

test('legacy developer and owner receive no platform capabilities', () => {
  assert.equal(hasCapability('developer', 'users.freeze'), false);
  assert.equal(hasCapability('owner', 'users.freeze'), false);
  assert.equal(hasCapability('superadmin', 'users.freeze'), true);
});

test('transitions require a reason and reject self-restriction', () => {
  assert.throws(
    () => assertAccountTransition(
      { id: 'same' },
      { id: 'same', status: 'active' },
      'frozen',
      'Security review',
    ),
    /own account/i,
  );
  assert.throws(
    () => assertAccountTransition(
      { id: 'actor' },
      { id: 'target', status: 'active' },
      'frozen',
      '  ',
    ),
    /reason/i,
  );
});

test('transitions enforce the account status state machine', () => {
  assert.deepEqual(
    assertAccountTransition(
      { id: 'actor' },
      { id: 'target', status: 'active' },
      'frozen',
      '  Security review  ',
    ),
    { nextStatus: 'frozen', reason: 'Security review' },
  );
  assert.throws(
    () => assertAccountTransition(
      { id: 'actor' },
      { id: 'target', status: 'blocked' },
      'frozen',
      'Invalid reversal',
    ),
    /invalid account status transition/i,
  );
});
