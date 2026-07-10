import { sql, ensureSchema } from '../_lib/db.js';
import { getUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    await ensureSchema();

    // Deliberately public — customers open a project by its ?p=<id> link
    // with no account of their own.
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
