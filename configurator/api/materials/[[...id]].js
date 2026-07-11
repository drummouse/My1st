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
        // Same public-by-ownerId / private-to-self split as api/colors — a
        // customer viewing a shared project link passes that project's
        // (already-public) owner_id to see the same custom materials the
        // owner added, no login required.
        const { ownerId } = req.query;
        if (ownerId) {
          const rows = await sql`select * from materials where owner_id = ${ownerId} order by created_at asc`;
          res.status(200).json(rows);
          return;
        }
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const rows = await sql`select * from materials where owner_id = ${userId} order by created_at asc`;
        res.status(200).json(rows);
        return;
      }

      if (req.method === 'POST') {
        const userId = await requireUserId(req, res);
        if (!userId) return;
        const { name, kind, pricePerSqft, profiles } = req.body || {};
        if (!name) {
          res.status(400).json({ error: 'name is required' });
          return;
        }
        const [row] = await sql`
          insert into materials (owner_id, name, kind, price_per_sqft, profiles)
          values (${userId}, ${name}, ${kind === 'wall' ? 'wall' : 'roof'}, ${pricePerSqft ?? 0}, ${profiles?.length ? JSON.stringify(profiles) : null}::jsonb)
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

    const [existing] = await sql`select owner_id from materials where id = ${id}`;
    if (!existing || existing.owner_id !== userId) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (req.method === 'PUT') {
      const { name, kind, pricePerSqft, profiles } = req.body || {};
      if (!name) {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const [row] = await sql`
        update materials
        set name = ${name}, kind = ${kind === 'wall' ? 'wall' : 'roof'}, price_per_sqft = ${pricePerSqft ?? 0},
            profiles = ${profiles?.length ? JSON.stringify(profiles) : null}::jsonb
        where id = ${id}
        returning *
      `;
      res.status(200).json(row);
      return;
    }

    if (req.method === 'DELETE') {
      await sql`delete from materials where id = ${id}`;
      res.status(204).end();
      return;
    }

    res.setHeader('Allow', 'PUT, DELETE');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Materials API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
