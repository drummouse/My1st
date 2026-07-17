import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryService } from '../api/_lib/libraryService.js';

function makeStore(record = { id: 'r1', version: 3, scope: 'tenant', tenant_id: 't1', record_type: 'product' }) {
  const state = { record, writes: [], audits: [], transactions: 0, listFilters: null };
  return {
    state,
    getRecord: async () => state.record,
    listRecords: async (filters) => { state.listFilters = filters; return state.record ? [state.record] : []; },
    createRecord: async (change) => { state.writes.push(change); return change; },
    updateRecord: async (change) => { state.writes.push(change); return change; },
    listCategoryEdges: async () => [],
    transaction: async (work) => { state.transactions += 1; return work(); },
    appendAudit: async (event) => { state.audits.push(event); },
  };
}

test('SuperAdmin with no tenant filter requests all tenant Library records', async () => {
  const store = makeStore();
  const service = createLibraryService({ randomUUID: () => 'new-id', store });
  await service.listRecords({ id: 'u1', role: 'superadmin', tenantId: null });
  assert.equal(store.state.listFilters.includeAllTenants, true);
  assert.equal(store.state.listFilters.actorTenantId, null);
});

test('selected tenant and owner lists remain tenant-scoped', async () => {
  const superStore = makeStore();
  await createLibraryService({ store: superStore }).listRecords({ id: 'u1', role: 'superadmin', tenantId: 't2' });
  assert.equal(superStore.state.listFilters.includeAllTenants, false);
  assert.equal(superStore.state.listFilters.actorTenantId, 't2');

  const ownerStore = makeStore();
  await createLibraryService({ store: ownerStore }).listRecords({ id: 'u2', role: 'owner', tenantId: 't1' });
  assert.equal(ownerStore.state.listFilters.includeAllTenants, false);
  assert.equal(ownerStore.state.listFilters.actorTenantId, 't1');
});

test('update uses optimistic version and increments it exactly once', async () => {
  const store = makeStore();
  const service = createLibraryService({ randomUUID: () => 'new-id', store });
  await service.updateRecord(
    { id: 'u1', tenantId: 't1' }, 'r1', 3,
    { recordType: 'product', scope: 'tenant', name: 'Panel 2' }, 'correct metadata',
  );
  assert.equal(store.state.writes[0].version, 4);
  assert.equal(store.state.transactions, 1);
  assert.equal(store.state.audits[0].reason, 'correct metadata');
});

test('archive is reversible and rejects stale versions', async () => {
  const store = makeStore({ id: 'r1', version: 4, scope: 'tenant', tenant_id: 't1', record_type: 'product' });
  const service = createLibraryService({ randomUUID: () => 'new-id', store });
  await assert.rejects(
    service.setRecordLifecycle({ id: 'u1', tenantId: 't1' }, 'r1', 3, 'archived', 'duplicate'),
    { code: 'LIBRARY_VERSION_CONFLICT' },
  );
  await service.setRecordLifecycle({ id: 'u1', tenantId: 't1' }, 'r1', 4, 'archived', 'duplicate');
  assert.equal(store.state.writes[0].lifecycleStatus, 'archived');
});

test('create requires a reason and writes an audit in the transaction', async () => {
  const store = makeStore(null);
  const service = createLibraryService({ randomUUID: () => 'new-id', store });
  await assert.rejects(
    service.createRecord({ id: 'u1', tenantId: 't1' }, { recordType: 'color', scope: 'tenant', name: 'Black' }, ''),
    { code: 'LIBRARY_REASON_REQUIRED' },
  );
  const result = await service.createRecord(
    { id: 'u1', tenantId: 't1' }, { recordType: 'color', scope: 'tenant', name: 'Black' }, 'new sample',
  );
  assert.equal(result.id, 'new-id');
  assert.equal(store.state.audits[0].action, 'library.record.created');
});

test('category relationships reject database-backed cycles', async () => {
  const store = makeStore({ id: 'a', version: 1, scope: 'global', tenant_id: null, record_type: 'category' });
  store.getRecord = async (id) => ({ id, version: 1, scope: 'global', tenant_id: null, record_type: 'category' });
  store.listCategoryEdges = async () => [{ sourceId: 'b', targetId: 'a' }, { sourceId: 'c', targetId: 'b' }];
  store.createRelationship = async (change) => change;
  const service = createLibraryService({ randomUUID: () => 'rel-id', store });
  await assert.rejects(service.createRelationship({ id: 'u1' }, {
    sourceRecordId: 'a', targetRecordId: 'c', relationshipType: 'categorized_as',
  }, 'reparent category'), { code: 'LIBRARY_CATEGORY_CYCLE' });
});
