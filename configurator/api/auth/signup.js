import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { createSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, password, companyName } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    await ensureSchema();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await sql`select id from users where email = ${normalizedEmail}`;
    if (existing) {
      res.status(409).json({ error: 'An account with that email already exists' });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await sql`
      insert into users (email, password_hash, company_name)
      values (${normalizedEmail}, ${passwordHash}, ${companyName || null})
      returning id, email, company_name
    `;
    res.setHeader('Set-Cookie', await createSessionCookie(user.id));
    res.status(201).json({ id: user.id, email: user.email, companyName: user.company_name });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
  }
}
