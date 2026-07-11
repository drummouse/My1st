import { sql, ensureSchema } from '../_lib/db.js';
import { requireUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  try {
    const ownerId = await requireUserId(req, res);
    if (!ownerId) return;
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`select * from custom_services where owner_id = ${ownerId} order by created_at asc`;
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
        values (${ownerId}, ${name}, ${unit || 'each'}, ${price ?? 0}, ${description || null}, ${linkUrl || null})
        returning *
      `;
      res.status(201).json(row);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Custom services API error:', err);
    res.status(500).json({ error: 'Internal error — the database may not be reachable yet.' });
  }
}
