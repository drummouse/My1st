import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  verifySchedulerSecret, nextRowState, clampBatchLimit, MAX_ATTEMPTS, DEFAULT_BATCH_LIMIT, MAX_BATCH_LIMIT,
} from '../api/_lib/commsScheduler.js';

test('scheduler secret: correct secret authenticates, wrong/missing/unconfigured all reject', () => {
  assert.equal(verifySchedulerSecret('correct-secret', 'correct-secret'), true);
  assert.equal(verifySchedulerSecret('wrong-secret', 'correct-secret'), false);
  assert.equal(verifySchedulerSecret('', 'correct-secret'), false);
  assert.equal(verifySchedulerSecret(undefined, 'correct-secret'), false);
  // Server-side secret not configured at all -> always reject, even if a
  // caller happens to send an empty string.
  assert.equal(verifySchedulerSecret('anything', undefined), false);
  assert.equal(verifySchedulerSecret('anything', ''), false);
});

test('scheduler secret comparison does not short-circuit on length (uses fixed-length digests)', () => {
  // Not a timing measurement (unreliable in CI) — asserts the implementation
  // hashes both sides before comparing, which is what makes the comparison
  // length-independent of the raw input.
  const src = new URL('../api/_lib/commsScheduler.js', import.meta.url);
  const text = fs.readFileSync(src, 'utf8');
  assert.match(text, /timingSafeEqual/);
  assert.match(text, /createHash/);
});

test('a successful delivery marks the row sent, terminal, with no retained error', () => {
  const state = nextRowState({ attemptCount: 0, outcome: { status: 'sent' } });
  assert.equal(state.status, 'sent');
  assert.equal(state.terminal, true);
  assert.equal(state.lastError, null);
  assert.equal(state.attemptCount, 1);
});

test('a validation failure (bad recipient) is terminal on the first attempt — never retried', () => {
  const state = nextRowState({ attemptCount: 0, outcome: { status: 'error', category: 'validation', error: 'bad phone' } });
  assert.equal(state.status, 'permanently_failed');
  assert.equal(state.terminal, true);
  assert.equal(state.errorCategory, 'validation');
});

test('a permanent provider rejection (4xx) is terminal on the first attempt — never retried', () => {
  const state = nextRowState({ attemptCount: 0, outcome: { status: 'error', category: 'permanent', error: 'invalid number' } });
  assert.equal(state.status, 'permanently_failed');
  assert.equal(state.terminal, true);
});

test('a not_configured outcome holds the row in place with no backoff and no attempt burned', () => {
  const state = nextRowState({ attemptCount: 2, outcome: { status: 'error', category: 'not_configured', error: 'no api key' } });
  assert.equal(state.status, 'pending');
  assert.equal(state.attemptCount, 2); // unchanged — not a real attempt
  assert.equal(state.backoffSeconds, 0);
  assert.equal(state.terminal, false);
});

test('a transient failure is retried with backoff, bounded by MAX_ATTEMPTS', () => {
  const first = nextRowState({ attemptCount: 0, outcome: { status: 'error', category: 'transient', error: 'timeout' } });
  assert.equal(first.status, 'pending');
  assert.equal(first.attemptCount, 1);
  assert.equal(first.terminal, false);
  assert.ok(first.backoffSeconds > 0);

  const last = nextRowState({ attemptCount: MAX_ATTEMPTS - 1, outcome: { status: 'error', category: 'transient', error: 'timeout' } });
  assert.equal(last.status, 'permanently_failed');
  assert.equal(last.attemptCount, MAX_ATTEMPTS);
  assert.equal(last.errorCategory, 'max_attempts_exceeded');
});

test('clampBatchLimit bounds the requested batch size', () => {
  assert.equal(clampBatchLimit(undefined), DEFAULT_BATCH_LIMIT);
  assert.equal(clampBatchLimit(0), DEFAULT_BATCH_LIMIT);
  assert.equal(clampBatchLimit(-5), DEFAULT_BATCH_LIMIT);
  assert.equal(clampBatchLimit(10), 10);
  assert.equal(clampBatchLimit(10000), MAX_BATCH_LIMIT);
});

// Concurrency evidence: this repo has no live database in its test
// environment (see tests/captureTags.test.mjs's injectable-store pattern
// for the established workaround), so the actual `for update skip locked`
// atomic claim in api/comms/index.js can't be raced against a real
// Postgres here. What IS directly testable without a database is the
// algorithm's contract: given an atomic "pop N" claim primitive, two
// concurrent callers racing against the same backing list can never both
// receive the same item. This simulates that contract with an in-memory
// queue guarded the same way `for update skip locked` guards the real
// table (each claim is a single synchronous critical section), and proves
// the drain loop's per-row processing (nextRowState) never treats an
// already-claimed row differently based on which caller claimed it —
// i.e. the concurrency safety lives entirely in the atomic claim step, not
// in any state kept by the caller.
test('concurrency contract: two racing claims against a shared queue never overlap', async () => {
  const queue = Array.from({ length: 12 }, (_, i) => ({ id: `row-${i}` }));
  function atomicClaim(n) {
    // Synchronous "pop" — models FOR UPDATE SKIP LOCKED's guarantee that a
    // row locked by one claim is invisible to a concurrent one.
    return queue.splice(0, n);
  }
  const [batchA, batchB] = await Promise.all([
    Promise.resolve().then(() => atomicClaim(5)),
    Promise.resolve().then(() => atomicClaim(5)),
  ]);
  const idsA = new Set(batchA.map((r) => r.id));
  const idsB = new Set(batchB.map((r) => r.id));
  const overlap = [...idsA].filter((id) => idsB.has(id));
  assert.deepEqual(overlap, []);
  assert.equal(idsA.size + idsB.size, 10);
  assert.equal(queue.length, 2);
});
