// Durable local storage for Capture drafts, pending source-image blobs, and
// the synchronization queue.
//
// Why this exists: before this module, "Saved on device" was aspirational —
// captureUploadQueue.js (Stage 2) is an in-memory serial queue only, and a
// draft session existed durably only once the server had it. A reload before
// the first successful sync silently lost local evidence. This module makes
// "Saved on device" true by construction: every accepted photo and every
// draft-state write goes here FIRST, before any network attempt, and is only
// removed after an explicit, server-confirmed sync (confirmSynced) — never
// on a timer, never optimistically.
//
// The storage engine is injected (createIndexedDbDriver for real browsers,
// createMemoryDriver for unit tests / environments without IndexedDB) so the
// queueing / rehydration / pruning logic here is unit-testable in node
// without a browser, matching the injected-dependency pattern already used
// by captureUploadQueue.js's `performUpload`/`wait`.

const STORE_NAMES = ['drafts', 'pendingAssets', 'syncQueue'];
const DB_NAME = 'ironwrap-capture';
const DB_VERSION = 1;

// --- Storage-interface contract ------------------------------------------
// Both drivers below implement the same four-method contract:
//   get(table, key) -> value | null
//   put(table, key, value) -> void
//   delete(table, key) -> void
//   getAll(table) -> value[]

export function createMemoryDriver() {
  const tables = Object.fromEntries(STORE_NAMES.map((name) => [name, new Map()]));
  return {
    async get(table, key) {
      return tables[table].get(key) ?? null;
    },
    async put(table, key, value) {
      tables[table].set(key, value);
    },
    async delete(table, key) {
      tables[table].delete(key);
    },
    async getAll(table) {
      return [...tables[table].values()];
    },
  };
}

export function createIndexedDbDriver({
  indexedDBImpl = (typeof indexedDB !== 'undefined' ? indexedDB : null),
  dbName = DB_NAME,
  version = DB_VERSION,
} = {}) {
  if (!indexedDBImpl) {
    throw new Error('IndexedDB is not available in this environment');
  }
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDBImpl.open(dbName, version);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function withStore(table, mode, run) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(table, mode);
      const store = tx.objectStore(table);
      const req = run(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async get(table, key) {
      const value = await withStore(table, 'readonly', (store) => store.get(key));
      return value ?? null;
    },
    async put(table, key, value) {
      await withStore(table, 'readwrite', (store) => store.put(value, key));
    },
    async delete(table, key) {
      await withStore(table, 'readwrite', (store) => store.delete(key));
    },
    async getAll(table) {
      return withStore(table, 'readonly', (store) => store.getAll());
    },
  };
}

// An entry that was "uploading" when the tab closed was not actually
// mid-flight by the time the page reloads — the in-memory upload it belonged
// to no longer exists. Rehydration treats it as "waiting" so it re-enters
// the retry loop instead of being stuck forever in a state nothing will ever
// resolve. "failed" entries are left as-is: they already represent a
// definite, user-visible outcome ("Upload failed — tap to retry").
export function normalizeQueueEntryOnRehydrate(entry) {
  if (entry.status === 'uploading') {
    return { ...entry, status: 'waiting' };
  }
  return entry;
}

function defaultIsOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export function createCaptureLocalStore({
  driver = createMemoryDriver(),
  now = () => Date.now(),
  isOnline = defaultIsOnline,
} = {}) {
  const store = {
    // --- Draft session state ------------------------------------------
    async saveDraft(sessionId, state) {
      const existing = await driver.get('drafts', sessionId);
      await driver.put('drafts', sessionId, {
        sessionId,
        state,
        savedAt: now(),
        lastSyncedAt: existing?.lastSyncedAt ?? null,
      });
    },
    async loadDraft(sessionId) {
      return driver.get('drafts', sessionId);
    },
    async deleteDraft(sessionId) {
      await driver.delete('drafts', sessionId);
    },
    async listDrafts() {
      return driver.getAll('drafts');
    },

    // --- Pending source-image blobs (accepted, not yet server-confirmed) --
    // record: { id, sessionId, purpose, blob, checksum, requestedPose, createdAt }
    async savePendingAsset(record) {
      if (!record?.id) throw new Error('savePendingAsset requires a stable id');
      const existing = await driver.get('pendingAssets', record.id);
      await driver.put('pendingAssets', record.id, {
        ...record,
        createdAt: existing?.createdAt ?? record.createdAt ?? now(),
      });
    },
    async getPendingAsset(id) {
      return driver.get('pendingAssets', id);
    },
    async deletePendingAsset(id) {
      await driver.delete('pendingAssets', id);
    },
    async listPendingAssets(sessionId) {
      const all = await driver.getAll('pendingAssets');
      return sessionId ? all.filter((item) => item.sessionId === sessionId) : all;
    },

    // --- Synchronization queue -----------------------------------------
    // Keyed 1:1 by pendingAssetId so re-enqueuing the same accepted photo
    // is a no-op rather than a duplicate queue row (duplicate-prevention).
    async enqueueForSync({ pendingAssetId, sessionId }) {
      const existing = await driver.get('syncQueue', pendingAssetId);
      if (existing) return existing;
      const entry = {
        id: pendingAssetId,
        sessionId,
        status: 'waiting',
        attempts: 0,
        lastError: null,
        createdAt: now(),
      };
      await driver.put('syncQueue', entry.id, entry);
      return entry;
    },
    async saveQueueEntry(entry) {
      await driver.put('syncQueue', entry.id, entry);
    },
    async getQueueEntry(id) {
      return driver.get('syncQueue', id);
    },
    async deleteQueueEntry(id) {
      await driver.delete('syncQueue', id);
    },
    async listQueue(sessionId) {
      const all = await driver.getAll('syncQueue');
      return sessionId ? all.filter((item) => item.sessionId === sessionId) : all;
    },

    // Called once per app load (or reconnect) to recover from an
    // interrupted session — normalizes stuck "uploading" rows back to
    // "waiting" and persists the correction, then returns the resumable set
    // so the caller can feed them back into captureUploadQueue.js.
    async rehydrateQueue(sessionId) {
      const all = await driver.getAll('syncQueue');
      const scoped = sessionId ? all.filter((item) => item.sessionId === sessionId) : all;
      const normalized = scoped.map(normalizeQueueEntryOnRehydrate);
      await Promise.all(
        normalized.map((entry, index) => (
          entry === scoped[index] ? null : driver.put('syncQueue', entry.id, entry)
        )),
      );
      return normalized.filter((entry) => entry.status === 'waiting' || entry.status === 'failed');
    },

    // --- Confirmation-before-prune ---------------------------------------
    // The ONLY path that removes local evidence. Must be called only after
    // the server has durably confirmed the asset (a 2xx finalize response
    // that itself came from a committed database write) — never
    // optimistically, never on a timer. A crash or reload at any point
    // before this call leaves the pending blob and queue entry intact for
    // retry, which is what makes "Upload failed — tap to retry" and
    // "Unsynced changes" honest.
    async confirmSynced(sessionId, pendingAssetId, { serverAssetId, syncedAt = now() } = {}) {
      await Promise.all([
        driver.delete('pendingAssets', pendingAssetId),
        driver.delete('syncQueue', pendingAssetId),
      ]);
      const draft = await driver.get('drafts', sessionId);
      await driver.put('drafts', sessionId, {
        sessionId,
        state: draft?.state ?? null,
        savedAt: draft?.savedAt ?? syncedAt,
        ...draft,
        lastSyncedAt: syncedAt,
      });
      return { pendingAssetId, serverAssetId, syncedAt };
    },

    async lastSuccessfulSync(sessionId) {
      const draft = await driver.get('drafts', sessionId);
      return draft?.lastSyncedAt ?? null;
    },

    // --- Honest sync-state derivation -------------------------------------
    // Never returns "synced" or "saved on device" from memory-only state —
    // it only ever reads what IndexedDB (or the injected driver) actually
    // holds right now, so the UI vocabulary this feeds is honest by
    // construction rather than by convention.
    async deriveSyncState(sessionId) {
      const [pending, queue] = await Promise.all([
        store.listPendingAssets(sessionId),
        store.listQueue(sessionId),
      ]);
      if (pending.length === 0 && queue.length === 0) {
        return { state: 'synced', unsyncedCount: 0 };
      }
      const failed = queue.filter((item) => item.status === 'failed');
      const uploading = queue.filter((item) => item.status === 'uploading');
      if (failed.length > 0) {
        return { state: 'upload_failed', unsyncedCount: pending.length, failedCount: failed.length };
      }
      if (uploading.length > 0) {
        return { state: 'uploading', unsyncedCount: pending.length, uploadingCount: uploading.length, total: pending.length };
      }
      if (!isOnline()) {
        return { state: 'waiting_for_connection', unsyncedCount: pending.length };
      }
      return { state: 'saved_on_device', unsyncedCount: pending.length };
    },

    // --- Local cleanup policy ---------------------------------------------
    // Unaccepted retakes never enter this store in the first place (the
    // camera component only calls savePendingAsset after the user taps
    // Accept), so there is nothing to sweep for them by definition — no
    // time-based cleanup is needed or implemented for that case. What IS
    // persisted here — accepted-but-not-yet-synced evidence — is pruned
    // ONLY by confirmSynced. forgetSession is the one explicit, deliberate
    // exception: used when a session itself is archived/deleted server-side
    // (not on any timer), so its local footprint doesn't linger forever.
    async forgetSession(sessionId) {
      const [draft, pending, queue] = await Promise.all([
        store.loadDraft(sessionId),
        store.listPendingAssets(sessionId),
        store.listQueue(sessionId),
      ]);
      await Promise.all([
        draft ? store.deleteDraft(sessionId) : null,
        ...pending.map((item) => store.deletePendingAsset(item.id)),
        ...queue.map((item) => store.deleteQueueEntry(item.id)),
      ]);
    },
  };

  return store;
}
