import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRestrictionNotifications, buildDesignApprovedNotifications } from '../api/_lib/notifications.js';

test('buildRestrictionNotifications skips an invalid phone but still queues a valid email (D-066)', () => {
  const user = { id: 'user-1', email: 'owner@example.com', phone: '58777502024' };
  const { notifications, skipped } = buildRestrictionNotifications(user, 'frozen', 'policy violation', 'REF-1');
  assert.equal(notifications.some((n) => n.channel === 'sms'), false);
  assert.equal(notifications.some((n) => n.channel === 'email' && n.destination === 'owner@example.com'), true);
  assert.deepEqual(skipped, [{ channel: 'sms', reason: 'invalid_recipient' }]);
});

test('buildRestrictionNotifications normalizes a valid phone to E.164', () => {
  const user = { id: 'user-1', email: null, phone: '(587) 377-7663' };
  const { notifications, skipped } = buildRestrictionNotifications(user, 'blocked', 'reason', 'REF-2');
  const sms = notifications.find((n) => n.channel === 'sms');
  assert.equal(sms.destination, '+15873777663');
  assert.deepEqual(skipped, []);
});

test('buildDesignApprovedNotifications never enqueues a known-invalid SMS destination, and does not block email', () => {
  const project = {
    id: 'proj-1', job_number: 'J-1', customer_name: 'Test Customer',
    customer_email: 'customer@example.com', customer_phone: '58777502024',
  };
  const { notifications, skipped } = buildDesignApprovedNotifications(project, 'REF-3', 'https://example.com/?p=proj-1', 'IronWrap');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].channel, 'email');
  assert.equal(notifications[0].destination, 'customer@example.com');
  assert.deepEqual(skipped, [{ channel: 'sms', reason: 'invalid_recipient' }]);
});

test('buildDesignApprovedNotifications never enqueues a known-invalid email, and does not block a valid SMS', () => {
  const project = {
    id: 'proj-2', job_number: 'J-2', customer_name: 'Test Customer',
    customer_email: 'not-an-email', customer_phone: '5873777663',
  };
  const { notifications, skipped } = buildDesignApprovedNotifications(project, 'REF-4', 'https://example.com/?p=proj-2', 'IronWrap');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].channel, 'sms');
  assert.equal(notifications[0].destination, '+15873777663');
  assert.deepEqual(skipped, [{ channel: 'email', reason: 'invalid_recipient' }]);
});

test('buildDesignApprovedNotifications with no contact info on the project queues nothing and skips nothing', () => {
  const project = { id: 'proj-3', job_number: 'J-3', customer_name: null, customer_email: null, customer_phone: null };
  const { notifications, skipped } = buildDesignApprovedNotifications(project, 'REF-5', 'https://example.com/?p=proj-3', 'IronWrap');
  assert.deepEqual(notifications, []);
  assert.deepEqual(skipped, []);
});
