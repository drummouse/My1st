import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRestrictionNotifications,
  deliverNotification,
} from '../api/_lib/notifications.js';
import { changeAccountStatus } from '../api/_lib/accountAdministration.js';

test('account restriction updates status, audits, and queues notifications in one transaction', async () => {
  const calls = [];
  const target = {
    id: 'tenant-1', email: 'owner@example.com', phone: '+17805550123', status: 'active',
  };
  const transaction = async (operation) => {
    calls.push('transaction:start');
    const result = await operation({
      lockUser: async (id) => {
        calls.push(['lock', id]);
        return target;
      },
      updateUserStatus: async (input) => {
        calls.push(['update', input]);
        return { ...target, status: input.nextStatus };
      },
      insertAudit: async (input) => calls.push(['audit', input]),
      insertNotifications: async (rows) => calls.push(['notifications', rows]),
    });
    calls.push('transaction:commit');
    return result;
  };

  const result = await changeAccountStatus({
    transaction,
    actor: { id: 'admin-1' },
    targetId: target.id,
    nextStatus: 'frozen',
    reason: ' Security review ',
    requestId: 'request-1',
  });

  assert.equal(result.user.status, 'frozen');
  assert.equal(result.notificationsQueued, 3);
  assert.match(result.supportReference, /^IW-[A-F0-9]{10}$/);
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call), [
    'transaction:start', 'lock', 'update', 'audit', 'notifications', 'transaction:commit',
  ]);
  assert.equal(calls[2][1].reason, 'Security review');
  assert.equal(calls[3][1].supportReference, result.supportReference);
  assert.equal(calls[4][1][0].supportReference, result.supportReference);
});

test('restriction queues email and sms with reason and support reference', () => {
  const rows = buildRestrictionNotifications(
    { id: 'u1', email: 'owner@example.com', phone: '+17805550123' },
    'frozen',
    'Security review',
    'IW-ABC123',
  );
  assert.deepEqual(rows.map((row) => row.channel), ['in_app', 'email', 'sms']);
  for (const row of rows) {
    assert.equal(row.payload.reason, 'Security review');
    assert.equal(row.supportReference, 'IW-ABC123');
  }
});

test('an unconfigured provider leaves delivery pending', async () => {
  assert.deepEqual(
    await deliverNotification({ channel: 'sms', payload: {} }, {}),
    { status: 'pending', error: 'Provider is not configured' },
  );
});

test('configured provider marks delivery sent', async () => {
  const delivered = [];
  const result = await deliverNotification(
    { channel: 'email', payload: { subject: 'Frozen' } },
    { email: async (payload) => delivered.push(payload) },
  );
  assert.deepEqual(result, { status: 'sent', error: null });
  assert.equal(delivered.length, 1);
});
