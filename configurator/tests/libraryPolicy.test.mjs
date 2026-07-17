import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLibraryRecord,
  validateRelationship,
  assertNoCategoryCycle,
} from '../api/_lib/libraryPolicy.js';

test('tenant records require and retain the actor tenant', () => {
  const record = normalizeLibraryRecord({
    recordType: 'product',
    scope: 'tenant',
    tenantId: 'tenant-1',
    name: '24 ga Coil',
    reviewStatus: 'draft',
    qualityLevel: 'test',
    sourceType: 'manual',
    metadata: {},
  }, 'tenant-1');
  assert.equal(record.tenantId, 'tenant-1');
  assert.equal(record.lifecycleStatus, 'active');
});

test('global records reject tenant ids and unsafe URLs', () => {
  assert.throws(() => normalizeLibraryRecord({
    recordType: 'color', scope: 'global', tenantId: 'tenant-1', name: 'Black',
  }, 'tenant-1'), { code: 'LIBRARY_SCOPE_INVALID' });
  assert.throws(() => normalizeLibraryRecord({
    recordType: 'color', scope: 'global', name: 'Black', thumbnailUrl: 'javascript:alert(1)',
  }, null), { code: 'LIBRARY_URL_INVALID' });
});

test('relationship matrix permits supported compatibility only', () => {
  assert.doesNotThrow(() => validateRelationship('product', 'profile', 'compatible_with'));
  assert.throws(() => validateRelationship('manufacturer', 'color', 'compatible_with'), {
    code: 'LIBRARY_RELATIONSHIP_INVALID',
  });
});

test('relationship matrix enforces organizational targets', () => {
  assert.doesNotThrow(() => validateRelationship('product', 'manufacturer', 'manufactured_by'));
  assert.throws(() => validateRelationship('product', 'supplier', 'manufactured_by'), {
    code: 'LIBRARY_RELATIONSHIP_INVALID',
  });
});

test('category parent graph rejects a cycle', () => {
  const edges = [{ sourceId: 'b', targetId: 'a' }, { sourceId: 'c', targetId: 'b' }];
  assert.throws(() => assertNoCategoryCycle(edges, 'a', 'c'), {
    code: 'LIBRARY_CATEGORY_CYCLE',
  });
});
