import { sql } from './db.js';
import { publicTenantAccess } from './publicAccess.js';

export async function requirePublicTenant(ownerId, res) {
  const [owner] = await sql`select status, deleted_at from users where id = ${ownerId}`;
  if (!owner || owner.deleted_at) {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  const access = publicTenantAccess(owner.status);
  if (!access.allowed) {
    res.status(access.status).json(access.body);
    return false;
  }
  return true;
}
