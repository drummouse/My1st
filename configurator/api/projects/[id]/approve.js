import { sql, ensureSchema } from '../../_lib/db.js';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    await ensureSchema();

    if (req.method === 'POST') {
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

    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Approve API error:', err);
    res.status(500).json({ error: 'Internal error — the Projects database may not be reachable yet.' });
  }
}
