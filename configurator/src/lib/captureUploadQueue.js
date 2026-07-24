// Serial upload queue with retry for Capture images. Pure module — the
// actual upload work is injected — so interruption/retry behavior is
// unit-testable in node without a browser or network. Queue persistence
// across a full page reload (IndexedDB) is Stage 6; within a session this
// keeps every photo's sync state explicit: waiting → uploading →
// done | failed(retryable).
export function createUploadQueue({ performUpload, maxAttempts = 3, backoffMs = 500, onChange, wait }) {
  const delay = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const items = [];
  let processing = false;
  let nextId = 1;

  const notify = () => { onChange?.(items.map((item) => ({ ...item }))); };
  const findItem = (id) => items.find((item) => item.id === id);

  async function runItem(item) {
    while (item.status !== 'done') {
      item.status = 'uploading';
      item.error = null;
      notify();
      try {
        item.attempts += 1;
        item.result = await performUpload(item.job);
        item.status = 'done';
        notify();
        return;
      } catch (error) {
        item.error = error?.message || 'Upload failed';
        if (item.attempts >= maxAttempts) {
          item.status = 'failed';
          notify();
          return;
        }
        item.status = 'waiting';
        notify();
        await delay(backoffMs * 2 ** (item.attempts - 1));
      }
    }
  }

  async function process() {
    if (processing) return;
    processing = true;
    try {
      for (;;) {
        const next = items.find((item) => item.status === 'waiting');
        if (!next) return;
        await runItem(next);
      }
    } finally {
      processing = false;
    }
  }

  return {
    enqueue(job) {
      const item = { id: nextId++, job, status: 'waiting', attempts: 0, error: null, result: null };
      items.push(item);
      notify();
      const settled = process();
      return { id: item.id, settled };
    },
    // Manual retry for an item that exhausted its automatic attempts.
    retry(id) {
      const item = findItem(id);
      if (!item || item.status !== 'failed') return null;
      item.status = 'waiting';
      item.attempts = 0;
      item.error = null;
      notify();
      return process();
    },
    snapshot() {
      return items.map((item) => ({ ...item }));
    },
  };
}
