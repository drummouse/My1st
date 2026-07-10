import { sql, ensureSchema } from '../_lib/db.js';
import { getUserId } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    await ensureSchema();
    const [user] = await sql`select id, email, company_name from users where id = ${userId}`;
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.status(200).json({ id: user.id, email: user.email, companyName: user.company_name });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
  }
}
