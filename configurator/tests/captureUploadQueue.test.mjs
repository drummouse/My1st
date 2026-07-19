import test from 'node:test';
import assert from 'node:assert/strict';
import { createUploadQueue } from '../src/lib/captureUploadQueue.js';

const instantWait = () => Promise.resolve();

test('uploads run serially and settle as done', async () => {
  const order = [];
  const queue = createUploadQueue({
    performUpload: async (job) => { order.push(job.name); return `ok-${job.name}`; },
    wait: instantWait,
  });
  const a = queue.enqueue({ name: 'a' });
  const b = queue.enqueue({ name: 'b' });
  await Promise.all([a.settled, b.settled]);
  assert.deepEqual(order, ['a', 'b']);
  assert.deepEqual(queue.snapshot().map((item) => item.status), ['done', 'done']);
  assert.equal(queue.snapshot()[0].result, 'ok-a');
});

test('an interrupted upload retries automatically and finishes exactly once', async () => {
  let calls = 0;
  const queue = createUploadQueue({
    performUpload: async () => {
      calls += 1;
      if (calls < 3) throw new Error('network dropped');
      return 'finalized';
    },
    maxAttempts: 3,
    wait: instantWait,
  });
  const { settled } = queue.enqueue({ name: 'photo' });
  await settled;
  const [item] = queue.snapshot();
  assert.equal(item.status, 'done');
  assert.equal(item.attempts, 3);
  assert.equal(calls, 3, 'the successful upload must not be re-run after finishing');
});

test('exhausted attempts mark the item failed with the error kept for the UI', async () => {
  const queue = createUploadQueue({
    performUpload: async () => { throw new Error('server unreachable'); },
    maxAttempts: 2,
    wait: instantWait,
  });
  const { settled } = queue.enqueue({ name: 'photo' });
  await settled;
  const [item] = queue.snapshot();
  assert.equal(item.status, 'failed');
  assert.equal(item.error, 'server unreachable');
});

test('manual retry after failure resets attempts and can succeed', async () => {
  let failing = true;
  const queue = createUploadQueue({
    performUpload: async () => {
      if (failing) throw new Error('offline');
      return 'finalized';
    },
    maxAttempts: 1,
    wait: instantWait,
  });
  const { settled } = queue.enqueue({ name: 'photo' });
  await settled;
  assert.equal(queue.snapshot()[0].status, 'failed');

  failing = false;
  await queue.retry(queue.snapshot()[0].id);
  assert.equal(queue.snapshot()[0].status, 'done');
  assert.equal(queue.retry(queue.snapshot()[0].id), null, 'only failed items are retryable');
});

test('a failure never blocks later items in the queue', async () => {
  const queue = createUploadQueue({
    performUpload: async (job) => {
      if (job.name === 'bad') throw new Error('boom');
      return 'ok';
    },
    maxAttempts: 1,
    wait: instantWait,
  });
  const bad = queue.enqueue({ name: 'bad' });
  const good = queue.enqueue({ name: 'good' });
  await Promise.all([bad.settled, good.settled]);
  assert.deepEqual(queue.snapshot().map((item) => item.status), ['failed', 'done']);
});

test('observers see every state change', async () => {
  const seen = [];
  const queue = createUploadQueue({
    performUpload: async () => 'ok',
    wait: instantWait,
    onChange: (items) => seen.push(items[0]?.status),
  });
  await queue.enqueue({ name: 'photo' }).settled;
  assert.deepEqual(seen, ['waiting', 'uploading', 'done']);
});
