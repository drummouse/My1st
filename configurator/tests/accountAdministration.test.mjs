import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRestrictionNotifications,
  buildDesignApprovedNotifications,
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
  const { notifications: rows, skipped } = buildRestrictionNotifications(
    { id: 'u1', email: 'owner@example.com', phone: '+17805550123' },
    'frozen',
    'Security review',
    'IW-ABC123',
  );
  assert.deepEqual(rows.map((row) => row.channel), ['in_app', 'email', 'sms']);
  assert.deepEqual(skipped, []);
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

test('a design-approved notice is only queued per channel the project actually has, signed with the resolved brand', () => {
  const { notifications: withBoth, skipped: withBothSkipped } = buildDesignApprovedNotifications(
    { id: 'p1', job_number: '26-180-ER', customer_name: 'Jim', customer_email: 'jim@example.com', customer_phone: '+17805550123' },
    'IW-ABC123',
    'https://example.com/?p=p1',
    'Acme Roofing',
  );
  assert.deepEqual(withBoth.map((row) => row.channel), ['email', 'sms']);
  assert.deepEqual(withBothSkipped, []);
  assert.equal(withBoth[0].destination, 'jim@example.com');
  assert.equal(withBoth[1].destination, '+17805550123');
  for (const row of withBoth) {
    assert.equal(row.supportReference, 'IW-ABC123');
    assert.match(row.payload.message, /Dear Jim/);
    assert.match(row.payload.message, /Best wishes,\nAcme Roofing team/);
    assert.equal(row.payload.shareUrl, 'https://example.com/?p=p1');
  }

  const { notifications: emailOnly } = buildDesignApprovedNotifications(
    { id: 'p2', customer_email: 'only@example.com' }, 'IW-DEF456', 'https://example.com/?p=p2', 'Acme Roofing',
  );
  assert.deepEqual(emailOnly.map((row) => row.channel), ['email']);
  assert.match(emailOnly[0].payload.message, /^Hello, /);

  const { notifications: neither, skipped: neitherSkipped } = buildDesignApprovedNotifications({ id: 'p3' }, 'IW-GHI789', 'https://example.com/?p=p3', 'Acme Roofing');
  assert.deepEqual(neither, []);
  assert.deepEqual(neitherSkipped, []);
});

test('deliverNotification resolves destination/identity from an explicit context, not a nonexistent row.destination column', async () => {
  const delivered = [];
  const result = await deliverNotification(
    { channel: 'sms', payload: { message: 'hi' } },
    { sms: async (payload, destination, identity) => delivered.push({ payload, destination, identity }) },
    { destination: '+17805550199', identity: { brandName: 'Acme Roofing', replyTo: 'owner@acme.example' } },
  );
  assert.deepEqual(result, { status: 'sent', error: null });
  assert.equal(delivered[0].destination, '+17805550199');
  assert.equal(delivered[0].identity.brandName, 'Acme Roofing');
});
