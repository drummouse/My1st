import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureService } from '../api/_lib/captureService.js';

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };
const SUPER = { id: 'admin', role: 'superadmin' };

function makeStore(session) {
  const state = {
    session: session === undefined
      ? { id: 's1', owner_id: 'user-a', status: 'draft', capture_type: 'guided_product', completeness: 0 }
      : session,
    byClientRef: null,
    writes: [],
    fields: [],
    audits: [],
    transactions: 0,
    listFilters: null,
  };
  return {
    state,
    transaction: async (work) => { state.transactions += 1; return work(); },
    listSessions: async (filters) => { state.listFilters = filters; return state.session ? [state.session] : []; },
    getSession: async () => state.session,
    getSessionByClientRef: async () => state.byClientRef,
    createSession: async (change) => { state.writes.push({ kind: 'create', change }); return change; },
    updateSessionContent: async (id, patch) => { state.writes.push({ kind: 'content', id, patch }); return { ...state.session, ...patch }; },
    updateSessionStatus: async (id, from, to) => { state.writes.push({ kind: 'status', id, from, to }); return { ...state.session, status: to }; },
    listFields: async () => state.fields,
    listAssets: async () => [],
    listComments: async () => [],
    listMeasurements: async () => [],
    upsertField: async (id, fieldKey, value) => { state.writes.push({ kind: 'field', id, fieldKey, value }); },
    appendAudit: async (event) => { state.audits.push(event); },
  };
}

test('owner lists stay owner-scoped; superadmin sees all tenants', async () => {
  const ownerStore = makeStore();
  await createCaptureService({ store: ownerStore }).listSessions(OWNER, {});
  assert.equal(ownerStore.state.listFilters.ownerId, 'user-a');
  assert.equal(ownerStore.state.listFilters.includeAllOwners, false);

  const superStore = makeStore();
  await createCaptureService({ store: superStore }).listSessions(SUPER, {});
  assert.equal(superStore.state.listFilters.includeAllOwners, true);
});

test('create writes the session and an audit event atomically', async () => {
  const store = makeStore(null);
  const service = createCaptureService({ store, randomUUID: () => 'new-id' });
  const { session, created } = await service.createSession(OWNER, {
    captureType: 'quick', title: 'Gutter sample', clientRef: 'ref-1',
  });
  assert.equal(created, true);
  assert.equal(session.id, 'new-id');
  assert.equal(session.status, 'draft');
  assert.equal(store.state.transactions, 1);
  assert.equal(store.state.audits[0].action, 'capture.session.created');
  assert.equal(store.state.audits[0].targetId, 'new-id');
});

test('create is idempotent by client reference — no duplicate, no audit', async () => {
  const store = makeStore(null);
  store.state.byClientRef = { id: 'existing', owner_id: 'user-a', status: 'draft', capture_type: 'quick' };
  const service = createCaptureService({ store, randomUUID: () => 'unused' });
  const { session, created } = await service.createSession(OWNER, { clientRef: 'ref-1' });
  assert.equal(created, false);
  assert.equal(session.id, 'existing');
  assert.equal(store.state.writes.length, 0);
  assert.equal(store.state.audits.length, 0);
});

test('another tenant cannot read, edit, or archive the session', async () => {
  const service = createCaptureService({ store: makeStore() });
  for (const call of [
    () => service.getSession(OTHER, 's1'),
    () => service.updateDraft(OTHER, 's1', { title: 'stolen' }),
    () => service.archiveSession(OTHER, 's1'),
  ]) {
    await assert.rejects(call, { code: 'CAPTURE_SESSION_NOT_FOUND' });
  }
  const detail = await service.getSession(SUPER, 's1');
  assert.equal(detail.session.id, 's1');
});

test('draft update persists content and upserts fields; no audit noise', async () => {
  const store = makeStore();
  const service = createCaptureService({ store });
  const { session } = await service.updateDraft(OWNER, 's1', {
    title: 'Standing seam', category: 'roofing', fields: { notes: 'dark grey' },
  });
  assert.equal(session.title, 'Standing seam');
  assert.deepEqual(store.state.writes.filter((w) => w.kind === 'field'),
    [{ kind: 'field', id: 's1', fieldKey: 'notes', value: 'dark grey' }]);
  assert.equal(store.state.audits.length, 0);
});

test('content is locked outside draft and changes_requested', async () => {
  const store = makeStore({ id: 's1', owner_id: 'user-a', status: 'submitted', capture_type: 'quick' });
  const service = createCaptureService({ store });
  await assert.rejects(service.updateDraft(OWNER, 's1', { title: 'late edit' }), { code: 'CAPTURE_SESSION_LOCKED' });

  const returned = makeStore({ id: 's1', owner_id: 'user-a', status: 'changes_requested', capture_type: 'quick' });
  const { session } = await createCaptureService({ store: returned }).updateDraft(OWNER, 's1', { title: 'fixed' });
  assert.equal(session.title, 'fixed');
});

test('archiving a draft records the audited transition', async () => {
  const store = makeStore();
  const service = createCaptureService({ store });
  const { session } = await service.archiveSession(OWNER, 's1');
  assert.equal(session.status, 'archived');
  const statusWrite = store.state.writes.find((w) => w.kind === 'status');
  assert.deepEqual({ from: statusWrite.from, to: statusWrite.to }, { from: 'draft', to: 'archived' });
  assert.equal(store.state.audits[0].action, 'capture.session.archived');
});

test('invalid transitions are refused before any write happens', async () => {
  const store = makeStore();
  const service = createCaptureService({ store });
  await assert.rejects(service.transitionSession(OWNER, 's1', 'approved'), { code: 'CAPTURE_TRANSITION_INVALID' });
  assert.equal(store.state.writes.length, 0);
  assert.equal(store.state.audits.length, 0);
});

test('resubmission after changes carries the audit flag', async () => {
  const store = makeStore({ id: 's1', owner_id: 'user-a', status: 'changes_requested', capture_type: 'quick' });
  const service = createCaptureService({ store });
  await service.transitionSession(OWNER, 's1', 'submitted');
  assert.equal(store.state.audits[0].action, 'capture.session.submitted');
  assert.equal(store.state.audits[0].metadata.resubmission, true);
});
