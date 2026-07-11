import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

// Merged list/create/update/delete into one function via an optional
// catch-all path — see api/auth/[action].js for why.
export default async function handler(req, res) {
  const [id] = [].concat(req.query.id || []);

  try {
    await ensureSchema();

    if (!id) {
      if (req.method === 'GET') {
        // A customer viewing a shared project link knows that project's
        // owner_id (from its own, already-public project row) and passes it
        // here to see the same custom colors the owner picked from — no
        // login required, same "public single-project GET" precedent as
        // api/projects/[[...id]].js. Otherwise this is the admin's own
        // Colors Library management view, which needs a real session.
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
      return;
    }

    const userId = await requireUserId(req, res);
    if (!userId) return;

    const [existing] = await sql`select owner_id from colors where id = ${id}`;
    if (!existing || existing.owner_id !== userId) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (req.method === 'PUT') {
      const { name, code, hex, series, thumbnailUrl } = req.body || {};
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const [row] = await sql`
        update colors
        set name = ${name}, code = ${code || null}, hex = ${hex || '#888888'}, series = ${series || 'Custom'}, thumbnail_url = ${thumbnailUrl || null}
        where id = ${id}
        returning *
      `;
      res.status(200).json(row);
      return;
    }

    if (req.method === 'DELETE') {
      await sql`delete from colors where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Colors API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
