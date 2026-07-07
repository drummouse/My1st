import { sql, ensureSchema } from '../_lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();

    if (req.method === 'GET') {
      const rows = await sql`
        select id, job_number, customer_name, address, created_at, updated_at
        from projects
        order by updated_at desc
      `;
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      const { jobNumber, customerName, address, design } = req.body || {};
      if (!design) {
        res.status(400).json({ error: 'design is required' });
        return;
      }
      const [row] = await sql`
        insert into projects (job_number, customer_name, address, design)
        values (${jobNumber || null}, ${customerName || null}, ${address || null}, ${JSON.stringify(design)}::jsonb)
        returning id, job_number, customer_name, address, created_at, updated_at
      `;
      res.status(201).json(row);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Projects API error:', err);
    res.status(500).json({ error: 'Internal error — the Projects database may not be reachable yet.' });
  }
}
