import { sql, ensureSchema } from '../_lib/db.js';
import { requireCapability } from '../_lib/access.js';
import {
  resolveAccountNoticeBrand, resolveClientNotifier, getOwnSenderIdentity, upsertSenderIdentity,
} from '../_lib/commsIdentity.js';
import { buildDeliverers } from '../_lib/commsDelivery.js';
import { deliverNotification } from '../_lib/notifications.js';

// Consolidated multi-tenant comms function — a reseller/owner's own
// notify-mode preference (platform sends for them vs. they handle it
// themselves) plus the outbox delivery worker. This is the last available
// Vercel Hobby function slot (12 of 12 — see CLAUDE.md); any further comms
// surface must extend this file's action dispatch rather than add a new
// route.
const capabilityByAction = {
  identity: 'comms.manage',
  drain: 'comms.operate',
};

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

// Draining is on-demand (superadmin-triggered, or an external scheduler
// hitting this route) — the Hobby plan has no built-in cron slot to spare,
// same constraint every other Capture/Library worker in this repo has
// accepted. Each channel's provider (Gmail SMTP, Twilio SMS) simply throws
// "not configured" until the platform's own shared credentials are set as
// env vars, so rows stay pending/failed harmlessly until then.
async function handleDrain(req, res) {
  if (req.method !== 'POST') return method(res, 'POST');
  const deliverers = buildDeliverers();
  const limit = Math.min(100, Number(req.body?.limit) || 25);
  const rows = await sql`
    select * from notification_outbox
    where status in ('pending', 'failed') and next_attempt_at <= now()
    order by created_at asc limit ${limit}
  `;
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    let identity = null;
    if (row.sender_user_id) {
      // Business notice — resolveClientNotifier re-confirms notify_mode is
      // still 'platform' at send time (not just at enqueue time), so
      // flipping a tenant back to 'self' after a notice was queued halts it
      // rather than sending anyway.
      identity = await resolveClientNotifier(row.sender_user_id);
      if (!identity) {
        await sql`
          update notification_outbox set status = 'failed', last_error = 'Tenant is not opted into platform-sent notices',
            attempt_count = attempt_count + 1 where id = ${row.id}
        `;
        failed++;
        continue;
      }
    } else if (row.user_id) {
      const [recipient] = await sql`select reseller_id from users where id = ${row.user_id}`;
      identity = recipient ? await resolveAccountNoticeBrand(recipient) : null;
    }
    const destination = row.to_email || row.to_phone || row.payload?.destination;
    try {
      const outcome = await deliverNotification(row, deliverers, { destination, identity });
      if (outcome.status === 'sent') {
        await sql`update notification_outbox set status = 'sent', sent_at = now() where id = ${row.id}`;
        sent++;
      } else {
        await sql`
          update notification_outbox set status = 'pending', last_error = ${outcome.error},
            attempt_count = attempt_count + 1 where id = ${row.id}
        `;
      }
    } catch (err) {
      await sql`
        update notification_outbox set status = 'failed', last_error = ${String(err?.message || err)},
          attempt_count = attempt_count + 1, next_attempt_at = now() + interval '15 minutes' where id = ${row.id}
      `;
      failed++;
    }
  }
  res.status(200).json({ processed: rows.length, sent, failed });
}

export default async function handler(req, res) {
  const action = String(req.query.action || 'identity');
  const capability = capabilityByAction[action];
  if (!capability) return res.status(404).json({ error: 'Unknown comms action' });
  try {
    await ensureSchema();
    const actor = await requireCapability(req, res, capability);
    if (!actor) return;
    if (action === 'identity') return handleIdentity(req, res, actor);
    if (action === 'drain') return handleDrain(req, res);
  } catch (err) {
    console.error('Comms API error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
}
