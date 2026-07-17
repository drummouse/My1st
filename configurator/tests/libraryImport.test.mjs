import test from 'node:test';
import assert from 'node:assert/strict';
import { dryRunLibraryImport, commitLibraryImport } from '../api/_lib/libraryImport.js';

const packageWith = (records) => ({ schemaVersion: 1, records, details: [], documents: [], documentRecords: [], relationships: [] });

function repository(existing = []) {
  const batches = new Map();
  return {
    writeCount: 0,
    async findByIdentity(record) {
      return existing.find((item) => item.recordType === record.recordType
        && item.scope === record.scope && item.tenantId === record.tenantId
        && item.code?.toLowerCase() === record.code?.toLowerCase()) || null;
    },
    async saveDryRun(batch) { batches.set(batch.id, batch); },
    async getBatch(id) { return batches.get(id); },
    async transaction(work) { return work(); },
    async applyImport(items) { this.writeCount += items.length; },
    async completeBatch() {},
    async appendAudit() {},
  };
}

test('dry run classifies without writes', async () => {
  const repo = repository([{ id: 'existing', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Old' }]);
  const result = await dryRunLibraryImport({ id: 'u1', tenantId: 't1' }, packageWith([
    { id: 'a', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-2', name: 'New' },
    { id: 'b', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Changed' },
  ]), repo, { randomUUID: () => 'batch-1', supportReference: () => 'LIB-1' });
  assert.deepEqual(result.summary, { new: 1, matching: 0, conflicting: 1, invalid: 0 });
  assert.equal(repo.writeCount, 0);
});

test('matching rows are distinguished from conflicts', async () => {
  const same = { id: 'existing', recordType: 'color', scope: 'tenant', tenantId: 't1', code: 'BK', name: 'Black' };
  const result = await dryRunLibraryImport({ id: 'u1', tenantId: 't1' }, packageWith([same]), repository([same]));
  assert.equal(result.summary.matching, 1);
});

test('commit rejects missing decisions and invalid batches without writes', async () => {
  const repo = repository([{ id: 'existing', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Old' }]);
  await dryRunLibraryImport({ id: 'u1', tenantId: 't1' }, packageWith([
    { id: 'b', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Changed' },
  ]), repo, { randomUUID: () => 'batch-1', supportReference: () => 'LIB-1' });
  await assert.rejects(commitLibraryImport({ id: 'u1', tenantId: 't1' }, 'batch-1', {}, repo), {
    code: 'LIBRARY_IMPORT_DECISIONS_REQUIRED',
  });
  assert.equal(repo.writeCount, 0);
});

test('commit applies explicit conflict decisions once', async () => {
  const repo = repository([{ id: 'existing', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Old' }]);
  await dryRunLibraryImport({ id: 'u1', tenantId: 't1' }, packageWith([
    { id: 'b', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Changed' },
  ]), repo, { randomUUID: () => 'batch-1', supportReference: () => 'LIB-1' });
  const result = await commitLibraryImport({ id: 'u1', tenantId: 't1' }, 'batch-1', { b: 'update' }, repo);
  assert.equal(result.applied, 1);
  assert.equal(repo.writeCount, 1);
});
