// Pure decision logic for the outbox drain worker — no I/O, unit-testable
// without a live database or provider (mirrors capturePolicy.js/
// captureEvidence.js's shared-module idiom). api/comms/index.js wires this
// to the real `sql` client and the real Twilio/SendGrid calls.
import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_ATTEMPTS = 5;
// Exponential-ish backoff per attempt number (1-indexed): 1m, 5m, 15m, 1h, 6h.
export const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];
// How long a claimed row is considered "in flight" before another
// invocation is allowed to reclaim it (self-healing if a worker crashes or
// times out mid-batch without ever updating the row again).
export const CLAIM_LEASE_SECONDS = 120;
export const DEFAULT_BATCH_LIMIT = 25;
export const MAX_BATCH_LIMIT = 50;
// Vercel Hobby functions cap out at 10s; leave headroom to write back any
// claimed-but-unprocessed rows before the function itself gets killed.
export const MAX_RUNTIME_MS = 7000;
// Per-provider-request deadline (D-071 hardening) — the drain time budget
// above only checked *before* starting a row; the provider fetch itself had
// no timeout, so one hung request could consume the entire remaining
// budget (or run past it, risking the function being killed mid-request).
// Every Twilio/SendGrid call gets an AbortController deadline of at most
// this, further capped by whatever's actually left of the drain's own
// budget for that row.
export const PROVIDER_TIMEOUT_MS = 5000;
// Below this much remaining budget, don't even start a row — release it
// back to pending immediately rather than attempt a request with too
// little time to plausibly get a real response.
export const MIN_ROW_BUDGET_MS = 500;

// Bounds the per-request provider timeout to whatever's actually left of
// the drain invocation's own time budget, so a request can never run the
// function past its safe execution window. Pure — takes the already-computed
// remaining-ms value rather than reading the clock itself.
export function providerTimeoutFor(remainingBudgetMs) {
  return Math.max(0, Math.min(PROVIDER_TIMEOUT_MS, remainingBudgetMs));
}

// Constant-time-ish secret comparison: hashing both sides first means the
// comparison itself (timingSafeEqual) always compares equal-length buffers,
// so it can't leak the expected secret's length via early mismatch, and a
// missing/misconfigured secret always fails closed.
export function verifySchedulerSecret(provided, expected) {
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(String(provided)).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

// Given the outcome of exactly one delivery attempt, decides the row's next
// status/attempt bookkeeping. `outcome` is either { status: 'sent' } or
// { status: 'error', category, error } — category is one of
// 'validation' | 'not_configured' | 'permanent' | 'transient' (see
// commsDelivery.js's DeliveryError). Pure function: same input always
// produces the same decision, independent of wall-clock time (the caller
// turns `backoffSeconds` into an actual timestamp).
export function nextRowState({ attemptCount, outcome }) {
  if (outcome.status === 'sent') {
    return { status: 'sent', attemptCount: attemptCount + 1, errorCategory: null, lastError: null, terminal: true };
  }
  const category = outcome.category || 'transient';
  const attempts = attemptCount + 1;

  if (category === 'validation' || category === 'permanent') {
    // Retrying the exact same input can't produce a different result —
    // burns the row down to a terminal state in one attempt, never retried
    // again automatically. This is the fix for the class of bug that left
    // the 2026-07-17 rows retrying forever against an unparseable number.
    return { status: 'permanently_failed', attemptCount: attempts, errorCategory: category, lastError: outcome.error, terminal: true };
  }
  if (category === 'not_configured') {
    // A platform-side config gap, not a per-message failure — leave the row
    // exactly where it was (no attempt burned, no backoff) so it's picked
    // up immediately once credentials are set, matching pre-existing
    // behavior for this case.
    return { status: 'pending', attemptCount, errorCategory: category, lastError: outcome.error, terminal: false, backoffSeconds: 0 };
  }
  // transient — worth retrying, but bounded: after MAX_ATTEMPTS, stop
  // rather than retry an apparently-permanent provider issue forever.
  if (attempts >= MAX_ATTEMPTS) {
    return { status: 'permanently_failed', attemptCount: attempts, errorCategory: 'max_attempts_exceeded', lastError: outcome.error, terminal: true };
  }
  const backoffSeconds = RETRY_BACKOFF_SECONDS[Math.min(attempts - 1, RETRY_BACKOFF_SECONDS.length - 1)];
  return { status: 'pending', attemptCount: attempts, errorCategory: category, lastError: outcome.error, terminal: false, backoffSeconds };
}

export function clampBatchLimit(requested) {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BATCH_LIMIT;
  return Math.min(MAX_BATCH_LIMIT, Math.floor(n));
}
