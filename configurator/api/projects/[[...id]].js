import { sql, ensureSchema } from '../_lib/db.js';
import { getUserId, requireUserId } from '../_lib/auth.js';

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
      const ownerId = await requireUserId(req, res);
      if (!ownerId) return;

      if (req.method === 'GET') {
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
          values (${jobNumber || null}, ${customerName || null}, ${address || null}, ${JSON.stringify(design)}::jsonb, ${ownerId})
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
        returning id, approved_at, approved_by_name
      `;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json(row);
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
      // permanently unownable.
      if (existing.owner_id && existing.owner_id !== userId) {
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
              owner_id = ${userId},
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
