import { sql, ensureSchema } from '../_lib/db.js';

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) {
    res.status(400).json({ error: 'id is required' });
    return;
  }

  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const [row] = await sql`select * from projects where id = ${id}`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json(row);
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
            updated_at = now()
        where id = ${id}
        returning id, job_number, customer_name, address, created_at, updated_at
      `;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json(row);
      return;
    }

    if (req.method === 'DELETE') {
      const [row] = await sql`delete from projects where id = ${id} returning id`;
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
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
