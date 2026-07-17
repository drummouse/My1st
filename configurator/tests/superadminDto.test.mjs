import test from 'node:test';
import assert from 'node:assert/strict';
import { toProjectDiagnostic, toTenantSummary } from '../api/_lib/superadminDto.js';

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
