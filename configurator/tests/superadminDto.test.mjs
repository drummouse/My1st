import test from 'node:test';
import assert from 'node:assert/strict';
import { toProjectDiagnostic, toTenantSummary, toNotification } from '../api/_lib/superadminDto.js';

test('project diagnostic excludes private customer and design content', () => {
  const dto = toProjectDiagnostic({
    id: 'p1', job_number: '26-180', customer_name: 'Private Customer',
    address: 'Private Address', design: { private: true }, layer_count: 2,
    facet_count: 16, created_at: '2026-01-01', updated_at: '2026-01-02',
  });
  assert.deepEqual(dto, {
    id: 'p1', jobNumber: '26-180', layerCount: 2, facetCount: 16,
    createdAt: '2026-01-01', updatedAt: '2026-01-02',
  });
  assert.equal(JSON.stringify(dto).includes('Private'), false);
  assert.equal('design' in dto, false);
});

test('tenant summary exposes account metadata but not private profile fields', () => {
  const dto = toTenantSummary({
    id: 'u1', email: 'owner@example.com', business_name: 'Roof Co',
    address_line: 'Private Address', password_hash: 'secret', status: 'active',
    role: 'owner', created_at: '2026-01-01', last_login_at: null,
    project_count: 7,
  });
  assert.equal(dto.email, 'owner@example.com');
  assert.equal(dto.companyName, 'Roof Co');
  assert.equal(dto.projectCount, 7);
  assert.equal('address' in dto, false);
  assert.equal(JSON.stringify(dto).includes('secret'), false);
});

test('notification DTO exposes operational status but never a recipient value', () => {
  const dto = toNotification({
    id: 'n1', user_id: 'u1', channel: 'sms', template: 'design-approved', status: 'permanently_failed',
    attempt_count: 1, next_attempt_at: '2026-07-21T05:00:00Z', claimed_at: '2026-07-21T04:59:00Z',
    error_category: 'validation', last_error: 'Recipient phone number failed E.164/NANP validation',
    sent_at: null, support_reference: 'REF-1', created_at: '2026-07-21T04:58:00Z',
    to_phone: '+15873777663', payload: { message: 'Dear Customer, your design is approved.' },
  });
  assert.equal(dto.provider, 'twilio');
  assert.equal(dto.errorCategory, 'validation');
  assert.equal(dto.claimedAt, '2026-07-21T04:59:00Z');
  assert.equal('to_phone' in dto, false);
  assert.equal('toPhone' in dto, false);
  assert.equal('payload' in dto, false);
  assert.equal(JSON.stringify(dto).includes('+15873777663'), false);
  assert.equal(JSON.stringify(dto).includes('Dear Customer'), false);
});

test('notification DTO derives provider from channel, null for in_app', () => {
  assert.equal(toNotification({ channel: 'email' }).provider, 'sendgrid');
  assert.equal(toNotification({ channel: 'in_app' }).provider, null);
});
