import test from 'node:test';
import assert from 'node:assert/strict';
import { planLegacyLibraryMigration } from '../api/_lib/libraryMigration.js';

test('migration preserves collision-free IDs and maps material-color compatibility', () => {
  const plan = planLegacyLibraryMigration('t1', {
    materials: [{ id: 'm1', name: 'Panel', kind: 'metal', price_per_sqft: 4.25, profiles: ['Standing Seam'], color_ids: ['c1'] }],
    colors: [{ id: 'c1', name: 'Black', code: 'BK', hex: '#111111', series: 'Standard' }],
    folders: [],
  }, { ids: new Set(), migrationKeys: new Set() }, { randomUUID: () => 'generated-id' });
  assert.equal(plan.records.find((item) => item.recordType === 'product').id, 'm1');
  assert.equal(plan.records.find((item) => item.recordType === 'color').id, 'c1');
  assert.deepEqual(plan.relationships.filter((item) => item.relationshipType === 'compatible_with' && item.targetRecordId === 'c1').map((item) => [item.sourceRecordId, item.targetRecordId]), [['m1', 'c1']]);
});

test('migration retains legacy IDs in provenance when collisions exist', () => {
  let sequence = 0;
  const plan = planLegacyLibraryMigration('t1', {
    materials: [{ id: 'm1', name: 'Panel', profiles: [], color_ids: [] }], colors: [], folders: [],
  }, { ids: new Set(['m1']), migrationKeys: new Set() }, { randomUUID: () => `generated-${++sequence}` });
  const product = plan.records[0];
  assert.equal(product.id, 'generated-1');
  assert.equal(product.metadata.provenance.legacyId, 'm1');
});

test('completed migration key produces a no-op plan', () => {
  const plan = planLegacyLibraryMigration('t1', { materials: [], colors: [], folders: [] }, {
    ids: new Set(), migrationKeys: new Set(['library-core-v1:t1']),
  });
  assert.equal(plan.status, 'already_completed');
  assert.deepEqual(plan.records, []);
});
