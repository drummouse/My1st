import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCaptureLocalStore,
  createMemoryDriver,
  normalizeQueueEntryOnRehydrate,
} from '../src/lib/captureLocalStore.js';

function makeStore(overrides = {}) {
  let clock = 1000;
  return createCaptureLocalStore({
    driver: createMemoryDriver(),
    now: () => clock++,
    isOnline: () => true,
    ...overrides,
  });
}

test('storage-interface contract: memory driver round-trips get/put/delete/getAll per table', async () => {
  const driver = createMemoryDriver();
  assert.equal(await driver.get('drafts', 'x'), null, 'missing key returns null, not undefined');
  await driver.put('drafts', 'x', { hello: 'world' });
  assert.deepEqual(await driver.get('drafts', 'x'), { hello: 'world' });
  assert.deepEqual(await driver.getAll('drafts'), [{ hello: 'world' }]);
  await driver.delete('drafts', 'x');
  assert.equal(await driver.get('drafts', 'x'), null);
  assert.deepEqual(await driver.getAll('drafts'), []);
  // Tables are isolated from each other.
  await driver.put('pendingAssets', 'a', { n: 1 });
  assert.deepEqual(await driver.getAll('drafts'), []);
  assert.deepEqual(await driver.getAll('pendingAssets'), [{ n: 1 }]);
});

test('draft record round-trip', async () => {
  const store = makeStore();
  assert.equal(await store.loadDraft('sess-1'), null);
  await store.saveDraft('sess-1', { phase: 'geometry', calibration: { unit: 'in' } });
  const draft = await store.loadDraft('sess-1');
  assert.equal(draft.sessionId, 'sess-1');
  assert.deepEqual(draft.state, { phase: 'geometry', calibration: { unit: 'in' } });
  assert.equal(typeof draft.savedAt, 'number');
  assert.equal(draft.lastSyncedAt, null, 'no sync has happened yet');

  // Saving again preserves lastSyncedAt rather than resetting it.
  await store.confirmSynced('sess-1', 'nonexistent-pending-id', { serverAssetId: 'srv-1' });
  const syncedAt = (await store.loadDraft('sess-1')).lastSyncedAt;
  assert.notEqual(syncedAt, null);
  await store.saveDraft('sess-1', { phase: 'measurements' });
  assert.equal((await store.loadDraft('sess-1')).lastSyncedAt, syncedAt);

  await store.deleteDraft('sess-1');
  assert.equal(await store.loadDraft('sess-1'), null);
});

test('pending asset record round-trip', async () => {
  const store = makeStore();
  const blob = { size: 1234, type: 'image/jpeg' };
  await store.savePendingAsset({
    id: 'pending-1',
    sessionId: 'sess-1',
    purpose: 'left_end',
    blob,
    checksum: 'abc123',
    requestedPose: { position: 'left end', angle: 'straight-on', distance: '1m', orientation: 'upright', requiredFeature: 'left edge', rulerVisible: true, reason: 'coverage' },
  });
  const record = await store.getPendingAsset('pending-1');
  assert.equal(record.sessionId, 'sess-1');
  assert.equal(record.purpose, 'left_end');
  assert.equal(record.checksum, 'abc123');
  assert.deepEqual(record.blob, blob);
  assert.equal(record.requestedPose.position, 'left end');
  assert.equal(typeof record.createdAt, 'number');

  const listed = await store.listPendingAssets('sess-1');
  assert.equal(listed.length, 1);
  assert.equal(await store.listPendingAssets('other-session').then((l) => l.length), 0);

  await store.deletePendingAsset('pending-1');
  assert.equal(await store.getPendingAsset('pending-1'), null);
});

test('queue rehydration logic: normalizes stuck "uploading" entries back to "waiting" and persists it', async () => {
  assert.equal(normalizeQueueEntryOnRehydrate({ status: 'uploading' }).status, 'waiting');
  assert.equal(normalizeQueueEntryOnRehydrate({ status: 'failed' }).status, 'failed', 'failed stays failed');
  assert.equal(normalizeQueueEntryOnRehydrate({ status: 'waiting' }).status, 'waiting');

  const store = makeStore();
  await store.saveQueueEntry({ id: 'p-1', sessionId: 'sess-1', status: 'uploading', attempts: 1 });
  await store.saveQueueEntry({ id: 'p-2', sessionId: 'sess-1', status: 'failed', attempts: 3, lastError: 'offline' });
  await store.saveQueueEntry({ id: 'p-3', sessionId: 'sess-1', status: 'done', attempts: 1 });

  const resumable = await store.rehydrateQueue('sess-1');
  assert.deepEqual(resumable.map((e) => e.id).sort(), ['p-1', 'p-2'], 'done entries are not resumable');
  const rehydratedUploading = resumable.find((e) => e.id === 'p-1');
  assert.equal(rehydratedUploading.status, 'waiting', 'an interrupted upload becomes waiting, not stuck');

  // The normalization was persisted, not just returned.
  assert.equal((await store.getQueueEntry('p-1')).status, 'waiting');
  assert.equal((await store.getQueueEntry('p-2')).status, 'failed');
});

test('confirmation-before-prune: local evidence is removed only after explicit server confirmation', async () => {
  const store = makeStore();
  await store.savePendingAsset({ id: 'pending-1', sessionId: 'sess-1', purpose: 'front', blob: {}, checksum: 'c1' });
  await store.enqueueForSync({ pendingAssetId: 'pending-1', sessionId: 'sess-1' });

  // Not yet confirmed: both rows still exist.
  assert.notEqual(await store.getPendingAsset('pending-1'), null);
  assert.notEqual(await store.getQueueEntry('pending-1'), null);
  assert.deepEqual((await store.deriveSyncState('sess-1')).state, 'saved_on_device');

  await store.confirmSynced('sess-1', 'pending-1', { serverAssetId: 'srv-42' });

  assert.equal(await store.getPendingAsset('pending-1'), null, 'pending blob pruned only now');
  assert.equal(await store.getQueueEntry('pending-1'), null, 'queue entry pruned only now');
  assert.equal((await store.deriveSyncState('sess-1')).state, 'synced');
  assert.notEqual(await store.lastSuccessfulSync('sess-1'), null);
});

test('failed-upload retention: a failed queue entry keeps its pending asset until retried or confirmed', async () => {
  const store = makeStore();
  await store.savePendingAsset({ id: 'pending-1', sessionId: 'sess-1', purpose: 'front', blob: {}, checksum: 'c1' });
  await store.saveQueueEntry({ id: 'pending-1', sessionId: 'sess-1', status: 'failed', attempts: 3, lastError: 'server unreachable' });

  const state = await store.deriveSyncState('sess-1');
  assert.equal(state.state, 'upload_failed');
  assert.equal(state.failedCount, 1);
  assert.notEqual(await store.getPendingAsset('pending-1'), null, 'local evidence is never discarded on failure');

  // Only an explicit confirmation removes it.
  await store.confirmSynced('sess-1', 'pending-1', { serverAssetId: 'srv-1' });
  assert.equal(await store.getPendingAsset('pending-1'), null);
});

test('duplicate-prevention logic: re-enqueuing the same pending asset does not create a second queue row', async () => {
  const store = makeStore();
  const first = await store.enqueueForSync({ pendingAssetId: 'pending-1', sessionId: 'sess-1' });
  const second = await store.enqueueForSync({ pendingAssetId: 'pending-1', sessionId: 'sess-1' });
  assert.equal(first.id, second.id);
  assert.equal((await store.listQueue('sess-1')).length, 1, 'still exactly one queue row');
});

test('sync-state derivation never reports synced/saved-on-device from stale in-memory assumptions', async () => {
  const store = makeStore();
  assert.equal((await store.deriveSyncState('empty-session')).state, 'synced', 'nothing pending, nothing queued');

  await store.savePendingAsset({ id: 'p-1', sessionId: 'sess-2', purpose: 'front', blob: {}, checksum: 'c' });
  await store.saveQueueEntry({ id: 'p-1', sessionId: 'sess-2', status: 'uploading', attempts: 1 });
  assert.equal((await store.deriveSyncState('sess-2')).state, 'uploading');

  await store.saveQueueEntry({ id: 'p-1', sessionId: 'sess-2', status: 'waiting', attempts: 0 });
  assert.equal((await store.deriveSyncState('sess-2')).state, 'saved_on_device');
});

test('offline detection feeds "waiting for connection" instead of a misleading "saved on device"', async () => {
  const store = makeStore({ isOnline: () => false });
  await store.savePendingAsset({ id: 'p-1', sessionId: 'sess-3', purpose: 'front', blob: {}, checksum: 'c' });
  await store.saveQueueEntry({ id: 'p-1', sessionId: 'sess-3', status: 'waiting', attempts: 0 });
  assert.equal((await store.deriveSyncState('sess-3')).state, 'waiting_for_connection');
});

test('forgetSession clears a session\'s local footprint explicitly, not on a timer', async () => {
  const store = makeStore();
  await store.saveDraft('sess-4', { phase: 'setup' });
  await store.savePendingAsset({ id: 'p-1', sessionId: 'sess-4', purpose: 'front', blob: {}, checksum: 'c' });
  await store.saveQueueEntry({ id: 'p-1', sessionId: 'sess-4', status: 'waiting', attempts: 0 });

  await store.forgetSession('sess-4');

  assert.equal(await store.loadDraft('sess-4'), null);
  assert.equal((await store.listPendingAssets('sess-4')).length, 0);
  assert.equal((await store.listQueue('sess-4')).length, 0);
});
