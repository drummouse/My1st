import { sql } from './db.js';

// `role` on the users table is 'owner' (default, every normal signup) or
// 'developer' — full cross-tenant access for support/debugging. Granting it
// is deliberately NOT self-service from inside the app (no API route sets
// it) — an existing developer (or direct DB access) has to promote an
// account by hand. See DEVELOPER_ACCESS.md for how and why.
export async function isDeveloper(userId) {
  if (!userId) return false;
  const [row] = await sql`select role from users where id = ${userId}`;
  return row?.role === 'developer';
}

// Which owner's data a request should read/list. Normally the caller's own
// id. A developer can pass `?asOwner=<id>` to explicitly view a different
// tenant's data (support/debugging) — always opt-in per request, never
// silent: a developer's plain request with no `asOwner` behaves exactly
// like a normal owner's, so day-to-day use of their own account is
// unaffected.
export async function resolveOwnerId(req, userId) {
  const asOwner = req.query.asOwner;
  if (asOwner && asOwner !== userId && (await isDeveloper(userId))) {
    return asOwner;
  }
  return userId;
}

// For a single row's ownership check (PUT/DELETE on something with an
// owner_id): true if the caller owns it outright, or is a developer acting
// on someone else's row for support purposes.
export async function canActOnOwner(userId, resourceOwnerId) {
  if (userId === resourceOwnerId) return true;
  return isDeveloper(userId);
}
