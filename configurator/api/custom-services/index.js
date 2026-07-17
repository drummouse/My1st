import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

// Merged list/create/update/delete into one function (id supplied as ?id= by
// vercel.json's rewrites) — see api/auth/[action].js for why.
export default async function handler(req, res) {
  const [id] = [].concat(req.query.id || []);

  try {
    const userId = await requireUserId(req, res);
    if (!userId) return;
    await ensureSchema();

    if (!id) {
      if (req.method === 'GET') {
        const rows = await sql`select * from custom_services where owner_id = ${userId} order by created_at asc`;
        res.status(200).json(rows);
        return;
      }

      if (req.method === 'POST') {
        const { name, unit, price, description, linkUrl } = req.body || {};
        if (!name) {
          res.status(400).json({ error: 'name is required' });
          return;
        }
        const [row] = await sql`
          insert into custom_services (owner_id, name, unit, price, description, link_url)
          values (${userId}, ${name}, ${unit || 'each'}, ${price ?? 0}, ${description || null}, ${linkUrl || null})
          returning *
        `;
        res.status(201).json(row);
        return;
      }

      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const [existing] = await sql`select owner_id from custom_services where id = ${id}`;
    if (!existing || existing.owner_id !== userId) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (req.method === 'PUT') {
      const { name, unit, price, description, linkUrl } = req.body || {};
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const [row] = await sql`
        update custom_services
        set name = ${name}, unit = ${unit || 'each'}, price = ${price ?? 0},
            description = ${description || null}, link_url = ${linkUrl || null}
        where id = ${id}
        returning *
      `;
      res.status(200).json(row);
      return;
    }

    if (req.method === 'DELETE') {
      await sql`delete from custom_services where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Custom services API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
