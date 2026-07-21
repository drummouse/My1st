import { sql, ensureSchema } from '../_lib/db.js';
import { requireCapability } from '../_lib/access.js';
import {
  resolveAccountNoticeBrand, resolveClientNotifier, getOwnSenderIdentity, upsertSenderIdentity,
} from '../_lib/commsIdentity.js';
import { buildDeliverers } from '../_lib/commsDelivery.js';
import { deliverNotification } from '../_lib/notifications.js';
import { redactRecipientFromText } from '../_lib/commsValidation.js';
import {
  verifySchedulerSecret, nextRowState, clampBatchLimit, CLAIM_LEASE_SECONDS, MAX_RUNTIME_MS,
} from '../_lib/commsScheduler.js';

// Consolidated multi-tenant comms function — a reseller/owner's own
// notify-mode preference (platform sends for them vs. they handle it
// themselves) plus the outbox delivery worker. This is the last available
// Vercel Hobby function slot (12 of 12 — see CLAUDE.md); any further comms
// surface must extend this file's action dispatch rather than add a new
// route. See docs/COMMUNICATIONS_RUNBOOK.md for the full operational
// picture (scheduler setup, secret rotation, incident response).
const capabilityByAction = {
  identity: 'comms.manage',
  drain: 'comms.operate',
};

const SCHEDULER_SECRET_HEADER = 'x-comms-scheduler-secret';

function method(res, expected) {
  res.setHeader('Allow', expected);
  res.status(405).json({ error: 'Method not allowed' });
}

async function handleIdentity(req, res, actor) {
  if (req.method === 'GET') {
    const identity = await getOwnSenderIdentity(actor.id);
    res.status(200).json({ identity });
    return;
  }
  if (req.method !== 'PUT') return method(res, 'GET, PUT');
  const { notifyMode, displayName, contactEmail } = req.body || {};
  if (notifyMode && !['platform', 'self'].includes(notifyMode)) {
    res.status(400).json({ error: "notifyMode must be 'platform' or 'self'" });
    return;
  }
  if (notifyMode === 'platform' && (!displayName || !contactEmail)) {
    res.status(400).json({ error: 'displayName and contactEmail are required before the platform can send on your behalf' });
    return;
  }
  const identity = await upsertSenderIdentity(actor.id, { notifyMode, displayName, contactEmail });
  res.status(200).json({ identity });
}

// Atomically claims up to `limit` eligible rows — `FOR UPDATE SKIP LOCKED`
// inside the subquery means a second, concurrent invocation of this exact
// query can never select a row this one has already locked; it simply skips
// it and claims the next one instead. That's what makes overlapping drain
// invocations (two scheduler ticks racing, or a manual + scheduled drain at
// the same moment) safe from double-sending — no row is ever claimed by two
// invocations at once. This is a single statement, so Postgres runs the
// whole thing (select + lock + update) as one implicit transaction; the
// Neon HTTP driver sends it as one request.
//
// Eligibility is deliberately `status in ('pending', 'processing')` only —
// 'failed' is excluded on purpose and permanently: it is now a frozen,
// legacy-only status from before this scheduler existed (the 2026-07-17
// placeholder-phone rows, D-066/D-067). New code never writes 'failed'
// again, so nothing currently in that status will ever be picked up here —
// preserved for the historical record, never retried automatically. A
// SuperAdmin can still deliberately move a row back to 'pending' via the
// existing manual retry action if they choose to.
//
// `processing` rows re-enter eligibility once their lease
// (`next_attempt_at`) expires, so a worker that crashes or times out
// mid-batch self-heals on the next invocation instead of leaking claimed
// rows forever.
async function claimBatch(limit) {
  const leaseUntil = new Date(Date.now() + CLAIM_LEASE_SECONDS * 1000).toISOString();
  return sql`
    update notification_outbox
    set status = 'processing', claimed_at = now(), next_attempt_at = ${leaseUntil}
    where id in (
      select id from notification_outbox
      where status in ('pending', 'processing') and next_attempt_at <= now()
      order by created_at asc
      limit ${limit}
      for update skip locked
    )
    returning *
  `;
}

async function releaseRow(id) {
  // Returns a claimed-but-not-yet-attempted row to immediate eligibility —
  // used only when the time budget runs out mid-batch (see handleDrain).
  await sql`update notification_outbox set status = 'pending', next_attempt_at = now() where id = ${id}`;
}

async function applyRowState(id, state) {
  const lastError = state.lastError ? redactRecipientFromText(String(state.lastError)) : null;
  if (state.status === 'sent') {
    await sql`update notification_outbox set status = 'sent', sent_at = now(), attempt_count = ${state.attemptCount}, last_error = null, error_category = null where id = ${id}`;
    return;
  }
  if (state.status === 'permanently_failed') {
    await sql`
      update notification_outbox set status = 'permanently_failed', attempt_count = ${state.attemptCount},
        last_error = ${lastError}, error_category = ${state.errorCategory} where id = ${id}
    `;
    return;
  }
  // 'pending' — either a not_configured hold (backoffSeconds 0) or a
  // transient failure being retried with backoff.
  const nextAttemptAt = new Date(Date.now() + (state.backoffSeconds || 0) * 1000).toISOString();
  await sql`
    update notification_outbox set status = 'pending', attempt_count = ${state.attemptCount},
      last_error = ${lastError}, error_category = ${state.errorCategory}, next_attempt_at = ${nextAttemptAt} where id = ${id}
  `;
}

async function attemptDelivery(row, deliverers) {
  let identity = null;
  if (row.sender_user_id) {
    // Business notice — resolveClientNotifier re-confirms notify_mode is
    // still 'platform' at send time (not just at enqueue time), so
    // flipping a tenant back to 'self' after a notice was queued halts it
    // rather than sending anyway. Not a delivery error — a deliberate,
    // terminal business-rule stop; retrying won't change today's outcome.
    identity = await resolveClientNotifier(row.sender_user_id);
    if (!identity) {
      return { status: 'error', category: 'permanent', error: 'Tenant is not opted into platform-sent notices' };
    }
  } else if (row.user_id) {
    const [recipient] = await sql`select reseller_id from users where id = ${row.user_id}`;
    identity = recipient ? await resolveAccountNoticeBrand(recipient) : null;
  }
  const destination = row.to_email || row.to_phone || row.payload?.destination;
  try {
    const outcome = await deliverNotification(row, deliverers, { destination, identity });
    return outcome.status === 'sent'
      ? { status: 'sent' }
      : { status: 'error', category: 'not_configured', error: outcome.error };
  } catch (err) {
    return { status: 'error', category: err?.category || 'transient', error: err?.message || String(err) };
  }
}

// Shared by both the scheduler and the manual SuperAdmin trigger — a single
// bounded, time-boxed pass: claim, attempt each claimed row once, and stop
// attempting (releasing whatever's left back to immediate eligibility)
// once the time budget is spent, rather than risk the function itself
// being killed mid-row. Response shape is a deliberate migration from the
// pre-scheduler `{processed, sent, failed}` shape — see
// docs/COMMUNICATIONS_RUNBOOK.md and decision log D-067.
async function runDrain(limit) {
  const deliverers = buildDeliverers();
  const claimed = await claimBatch(limit);
  const result = { claimed: claimed.length, sent: 0, retried: 0, failed: 0, skipped: 0 };
  const startedAt = Date.now();
  for (const row of claimed) {
    if (Date.now() - startedAt > MAX_RUNTIME_MS) {
      await releaseRow(row.id);
      result.skipped++;
      continue;
    }
    const outcome = await attemptDelivery(row, deliverers);
    const state = nextRowState({ attemptCount: row.attempt_count, outcome });
    await applyRowState(row.id, state);
    if (state.status === 'sent') result.sent++;
    else if (state.status === 'permanently_failed') result.failed++;
    else result.retried++;
  }
  return result;
}

async function handleDrain(req, res, actor) {
  // actor is null on the scheduler-secret path (see handler()) — there is
  // no session/capability check to redo here, the caller already decided
  // this request is authorized before any of this ran.
  const limit = clampBatchLimit(req.body?.limit);
  const result = await runDrain(limit);
  res.status(200).json(result);
}

export default async function handler(req, res) {
  const action = String(req.query.action || 'identity');
  const capability = capabilityByAction[action];
  if (!capability) return res.status(404).json({ error: 'Unknown comms action' });

  // Scheduler path for `drain` only: method + secret are checked before any
  // database or provider work at all — no ensureSchema(), no query, nothing
  // — a bad or missing secret costs nothing beyond the header comparison.
  // A request with no scheduler-secret header at all falls through
  // unchanged to the existing session-cookie + comms.operate capability
  // path below (manual SuperAdmin trigger, exactly as before).
  if (action === 'drain' && req.headers[SCHEDULER_SECRET_HEADER] !== undefined) {
    if (req.method !== 'POST') return method(res, 'POST');
    const ok = verifySchedulerSecret(req.headers[SCHEDULER_SECRET_HEADER], process.env.COMMS_SCHEDULER_SECRET);
    if (!ok) {
      res.status(401).json({ error: 'Invalid or missing scheduler credentials' });
      return;
    }
    try {
      await ensureSchema();
      return await handleDrain(req, res, null);
    } catch (err) {
      console.error('Comms scheduler drain error:', err);
      res.status(500).json({ error: 'Internal error' });
    }
    return;
  }

  try {
    await ensureSchema();
    const actor = await requireCapability(req, res, capability);
    if (!actor) return;
    if (action === 'identity') return handleIdentity(req, res, actor);
    if (action === 'drain') return handleDrain(req, res, actor);
  } catch (err) {
    console.error('Comms API error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
