import { sql, ensureSchema } from '../_lib/db.js';
import { getUserId, requireUserId } from '../_lib/auth.js';
import { resolveOwnerId, canActOnOwner } from '../_lib/roles.js';

// Merged list/create/read/update/delete/approve into one function via an
// optional catch-all path — see api/auth/[action].js for why (Vercel's
// Hobby-plan serverless function cap). `id` is the path after /api/projects:
// [] -> list/create, ['<id>'] -> single project, ['<id>', 'approve'] -> approve.
export default async function handler(req, res) {
  const segments = [].concat(req.query.id || []);
  const [id, sub] = segments;

  try {
    await ensureSchema();

    // /api/projects — list (authenticated) or create (authenticated)
    if (!id) {
      const userId = await requireUserId(req, res);
      if (!userId) return;

      if (req.method === 'GET') {
        // A developer can pass ?asOwner=<id> to list a different tenant's
        // projects for support/debugging — see api/_lib/roles.js. A plain
        // request (no asOwner, or a non-developer caller) always lists just
        // the caller's own.
        const ownerId = await resolveOwnerId(req, userId);
        const rows = await sql`
          select id, job_number, customer_name, address, created_at, updated_at
          from projects
          where owner_id = ${ownerId}
          order by updated_at desc
        `;
        res.status(200).json(rows);
        return;
      }

      if (req.method === 'POST') {
        const { jobNumber, customerName, address, design } = req.body || {};
        if (!design) {
          res.status(400).json({ error: 'design is required' });
          return;
        }
        const [row] = await sql`
          insert into projects (job_number, customer_name, address, design, owner_id)
          values (${jobNumber || null}, ${customerName || null}, ${address || null}, ${JSON.stringify(design)}::jsonb, ${userId})
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
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      const { approvedByName } = req.body || {};
      const [row] = await sql`
        update projects
        set approved_at = now(),
            approved_by_name = ${approvedByName || null}
        where id = ${id}
        returning id, owner_id, job_number, customer_name, address, approved_at, approved_by_name
      `;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      // design.approved event — see INTEGRATIONS.md. Best-effort: a slow or
      // failing webhook (or no owner/no URL configured) never changes the
      // approval response the customer sees.
      if (row.owner_id) {
        try {
          const [settingsRow] = await sql`select notification_webhook_url from settings where owner_id = ${row.owner_id}`;
          if (settingsRow?.notification_webhook_url) {
            const proto = req.headers['x-forwarded-proto'] || 'https';
            const shareUrl = `${proto}://${req.headers.host}/?p=${id}`;
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
      }
      res.status(200).json({ id: row.id, approved_at: row.approved_at, approved_by_name: row.approved_by_name });
      return;
    }

    // /api/projects/<id> — GET is deliberately public (customers open a
    // project by its ?p=<id> link with no account of their own); PUT/DELETE
    // require ownership.
    if (req.method === 'GET') {
      const [row] = await sql`select * from projects where id = ${id}`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json(row);
      return;
    }

    if (req.method === 'PUT' || req.method === 'DELETE') {
      const userId = await getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }
      const [existing] = await sql`select owner_id from projects where id = ${id}`;
      if (!existing) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      // Projects saved before accounts existed have no owner yet — the first
      // authenticated user to edit one claims it, rather than leaving it
      // permanently unownable. A developer can act on any owner's project
      // for support/debugging — see api/_lib/roles.js.
      if (existing.owner_id && existing.owner_id !== userId && !(await canActOnOwner(userId, existing.owner_id))) {
        res.status(403).json({ error: 'This project belongs to a different account' });
        return;
      }

      if (req.method === 'PUT') {
        const { jobNumber, customerName, address, design } = req.body || {};
        if (!design) {
          res.status(400).json({ error: 'design is required' });
          return;
        }
        const [row] = await sql`
          update projects
          set job_number = ${jobNumber || null},
              customer_name = ${customerName || null},
              address = ${address || null},
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
