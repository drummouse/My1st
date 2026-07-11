import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    const ownerId = await requireUserId(req, res);
    if (!ownerId) return;
    await ensureSchema();

    const [existing] = await sql`select owner_id from custom_services where id = ${id}`;
    if (!existing || existing.owner_id !== ownerId) {
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
