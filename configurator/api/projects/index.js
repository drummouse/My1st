import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';
import { publicTenantAccess } from '../_lib/publicAccess.js';
import { buildDesignApprovedNotifications } from '../_lib/notifications.js';
import { createSupportReference } from '../_lib/accountAdministration.js';
import { resolveClientNotifier } from '../_lib/commsIdentity.js';

async function requirePublicProjectAccess(id, res) {
  const [project] = await sql`
    select p.id, u.status as owner_status
    from projects p
    left join users u on u.id = p.owner_id
    where p.id = ${id}
  `;
  if (!project) {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  const access = publicTenantAccess(project.owner_status);
  if (!access.allowed) {
    res.status(access.status).json(access.body);
    return false;
  }
  return true;
}

// Merged list/create/read/update/delete/approve into one function to stay
// under Vercel's Hobby-plan serverless function cap — see api/auth/[action].js
// for why. The path after /api/projects is supplied as query params by the
// rewrites in vercel.json (Vercel's zero-config /api routing doesn't support
// the optional-catch-all `[[...id]]` filename this project once used):
//   /api/projects            -> (no id)            list/create
//   /api/projects/<id>       -> ?id=<id>           single project
//   /api/projects/<id>/approve -> ?id=<id>&sub=approve
export default async function handler(req, res) {
  const id = [].concat(req.query.id || [])[0];
  const sub = req.query.sub;

  try {
    await ensureSchema();

    // /api/projects — list (authenticated) or create (authenticated)
    if (!id) {
      const userId = await requireUserId(req, res);
      if (!userId) return;

      if (req.method === 'GET') {
        const rows = await sql`
          select id, job_number, customer_name, address, created_at, updated_at
          from projects
          where owner_id = ${userId}
          order by updated_at desc
        `;
        res.status(200).json(rows);
        return;
      }

      if (req.method === 'POST') {
        const { jobNumber, customerName, address, customerEmail, customerPhone, design } = req.body || {};
        if (!design) {
          res.status(400).json({ error: 'design is required' });
          return;
        }
        const [row] = await sql`
          insert into projects (job_number, customer_name, address, customer_email, customer_phone, design, owner_id)
          values (${jobNumber || null}, ${customerName || null}, ${address || null}, ${customerEmail || null}, ${customerPhone || null}, ${JSON.stringify(design)}::jsonb, ${userId})
          returning id, job_number, customer_name, address, created_at, updated_at
        `;
        res.status(201).json(row);
        return;
      }

      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // /api/projects/<id>/approve — deliberately public, no owner check; a
    // customer approving a design they were sent has no account of their own.
    if (sub === 'approve') {
      // A standalone exported HTML file (opened from email/file:// or another
      // host) approves cross-origin — it's a "simple" POST (no body, no custom
      // headers) so there's no preflight, but the browser still needs this
      // header to let that file read the confirmation. Safe to open up: this
      // route is deliberately public (a customer has no account) and only ever
      // marks a design the owner already shared as approved.
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      if (!(await requirePublicProjectAccess(id, res))) return;
      const { approvedByName } = req.body || {};
      let [row] = await sql`
        update projects
        set approved_at = now(),
            approved_by_name = ${approvedByName || null}
        where id = ${id} and approved_at is null
        returning id, owner_id, job_number, customer_name, address, customer_email, customer_phone, approved_at, approved_by_name
      `;
      const newlyApproved = Boolean(row);

      // A repeated click is a successful no-op. Preserve the original
      // timestamp/name and do not notify the webhook again.
      if (!row) {
        [row] = await sql`
          select id, owner_id, job_number, customer_name, address, customer_email, customer_phone, approved_at, approved_by_name
          from projects
          where id = ${id}
        `;
      }
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // design.approved event — see INTEGRATIONS.md. Best-effort: a slow or
      // failing webhook (or no owner/no URL configured) never changes the
      // approval response the customer sees. Only the first approval emits it.
      if (newlyApproved && row.owner_id) {
        const proto = req.headers['x-forwarded-proto'] || 'https';
        const shareUrl = `${proto}://${req.headers.host}/?p=${id}`;
        try {
          const [settingsRow] = await sql`select notification_webhook_url from settings where owner_id = ${row.owner_id}`;
          if (settingsRow?.notification_webhook_url) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            await fetch(settingsRow.notification_webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event: 'design.approved',
                projectId: id,
                jobNumber: row.job_number,
                customerName: row.customer_name,
                address: row.address,
                approvedAt: row.approved_at,
                approvedByName: row.approved_by_name,
                shareUrl,
              }),
              signal: controller.signal,
            }).catch((err) => console.error('Approval webhook failed:', err));
            clearTimeout(timeout);
          }
        } catch (err) {
          console.error('Approval webhook lookup failed:', err);
        }

        // Direct customer email/SMS, only when this owner has opted into
        // 'platform' notify mode (see INTEGRATIONS.md's comms section) —
        // separate from, and in addition to, the webhook above, which
        // covers the 'self'/own-automation path independently. Skips
        // silently for a 'self' owner, a project with no customer_email/
        // customer_phone, or if the outbox insert itself fails (never
        // blocks the approval response the customer sees).
        try {
          const notifier = await resolveClientNotifier(row.owner_id);
          if (notifier) {
            const notices = buildDesignApprovedNotifications(row, createSupportReference(), shareUrl, notifier.brandName);
            for (const notice of notices) {
              await sql`
                insert into notification_outbox
                  (channel, template, payload, support_reference, sender_user_id, to_email, to_phone)
                values (${notice.channel}, ${notice.template}, ${JSON.stringify(notice.payload)}::jsonb,
                  ${notice.supportReference}, ${row.owner_id},
                  ${notice.channel === 'email' ? notice.destination : null},
                  ${notice.channel === 'sms' ? notice.destination : null})
              `;
            }
          }
        } catch (err) {
          console.error('Approval customer-notification enqueue failed:', err);
        }
      }
      res.status(200).json({ id: row.id, approved_at: row.approved_at, approved_by_name: row.approved_by_name });
      return;
    }

    // /api/projects/<id> — GET is deliberately public (customers open a
    // project by its ?p=<id> link with no account of their own); PUT/DELETE
    // require ownership.
    if (req.method === 'GET') {
      if (!(await requirePublicProjectAccess(id, res))) return;
      const [row] = await sql`select * from projects where id = ${id}`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json(row);
      return;
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      const userId = await requireUserId(req, res);
      if (!userId) return;
      const [existing] = await sql`select owner_id from projects where id = ${id}`;
      if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      // Projects saved before accounts existed have no owner yet — the first
      // authenticated user to edit one claims it, rather than leaving it
      // permanently unownable.
      if (existing.owner_id && existing.owner_id !== userId) {
        res.status(403).json({ error: 'This project belongs to a different account' });
        return;
      }

      if (req.method === 'PUT') {
        const { jobNumber, customerName, address, customerEmail, customerPhone, design } = req.body || {};
        if (!design) {
          res.status(400).json({ error: 'design is required' });
          return;
        }
        const [row] = await sql`
          update projects
          set job_number = ${jobNumber || null},
              customer_name = ${customerName || null},
              address = ${address || null},
              customer_email = ${customerEmail || null},
              customer_phone = ${customerPhone || null},
              design = ${JSON.stringify(design)}::jsonb,
              owner_id = ${existing.owner_id || userId},
              updated_at = now()
          where id = ${id}
          returning id, job_number, customer_name, address, created_at, updated_at
        `;
        res.status(200).json(row);
        return;
      }

      // DELETE
      await sql`delete from projects where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Projects API error:', err);
    res.status(500).json({ error: 'Internal error — the Projects database may not be reachable yet.' });
  }
}
