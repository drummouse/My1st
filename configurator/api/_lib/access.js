import { sql, ensureSchema } from './db.js';
import { getSessionClaims } from './auth.js';
import { capabilitiesForRole, hasCapability } from './superadminPolicy.js';
import { authorizeUserRecord } from './accessPolicy.js';

export async function getAuthenticatedUser(req) {
  const session = await getSessionClaims(req);
  if (!session) return { user: null, code: 'NOT_AUTHENTICATED' };
  await ensureSchema();
  const [user] = await sql`select * from users where id = ${session.sub}`;
  const authorization = authorizeUserRecord(user, session);
  return authorization.ok ? { user, code: null } : { user: null, code: authorization.code };
}

export async function requireActiveUser(req, res) {
  const result = await getAuthenticatedUser(req);
  if (result.user) return result.user;
  const restricted = result.code === 'ACCOUNT_RESTRICTED';
  res.status(restricted ? 403 : 401).json({
    error: restricted ? 'Account access is restricted. Please contact the platform administrator.' : 'Not authenticated',
    code: result.code,
  });
  return null;
}

export async function requireCapability(req, res, capability) {
  const user = await requireActiveUser(req, res);
  if (!user) return null;
  if (!hasCapability(user.role, capability)) {
    res.status(403).json({ error: 'Not authorized', code: 'CAPABILITY_REQUIRED' });
    return null;
  }
  return { ...user, capabilities: capabilitiesForRole(user.role) };
}
