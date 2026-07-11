import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      // Same public-by-ownerId / private-to-self split as api/colors —
      // a customer viewing a shared project link passes that project's
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
  } catch (err) {
    console.error('Materials API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
