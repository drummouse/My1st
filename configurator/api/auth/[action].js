import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { createSessionCookie, clearSessionCookie, getUserId } from '../_lib/auth.js';

// Merged signup/login/logout/me into one function (dispatched on the
// [action] path segment) — Vercel's Hobby plan caps the number of
// serverless functions per deployment, and four auth routes plus the rest
// of this app's growing API surface pushed the project over that limit
// (the deploy that added colors/materials as their own routes actually
// failed for this reason). Behavior is unchanged; only the file layout is.
export default async function handler(req, res) {
  const { action } = req.query;

  if (action === 'signup') {
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
    return;
  }

  if (action === 'login') {
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
      // Same generic error whether the email doesn't exist or the password
      // is wrong — doesn't tell an attacker which emails have accounts.
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
    return;
  }

  if (action === 'logout') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    res.setHeader('Set-Cookie', clearSessionCookie());
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'me') {
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
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
