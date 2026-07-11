import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      // A customer viewing a shared project link knows that project's
      // owner_id (from its own, already-public project row) and passes it
      // here to see the same custom colors the owner picked from — no
      // login required, same "public single-project GET" precedent as
      // api/projects/[id].js. Otherwise this is the admin's own Colors
      // Library management view, which needs a real session.
      const { ownerId } = req.query;
      if (ownerId) {
        const rows = await sql`select * from colors where owner_id = ${ownerId} order by created_at asc`;
        res.status(200).json(rows);
        return;
      }
      const userId = await requireUserId(req, res);
      if (!userId) return;
      const rows = await sql`select * from colors where owner_id = ${userId} order by created_at asc`;
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const userId = await requireUserId(req, res);
      if (!userId) return;
      const { name, code, hex, series, thumbnailUrl } = req.body || {};
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const [row] = await sql`
        insert into colors (owner_id, name, code, hex, series, thumbnail_url)
        values (${userId}, ${name}, ${code || null}, ${hex || '#888888'}, ${series || 'Custom'}, ${thumbnailUrl || null})
        returning *
      `;
      res.status(201).json(row);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Colors API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
