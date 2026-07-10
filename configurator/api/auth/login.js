import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { createSessionCookie } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    await ensureSchema();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [user] = await sql`select id, email, password_hash, company_name from users where email = ${normalizedEmail}`;
    // Same generic error whether the email doesn't exist or the password is
    // wrong — doesn't tell an attacker which emails have accounts.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    res.setHeader('Set-Cookie', await createSessionCookie(user.id));
    res.status(200).json({ id: user.id, email: user.email, companyName: user.company_name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal error — the accounts database may not be reachable yet.' });
  }
}
