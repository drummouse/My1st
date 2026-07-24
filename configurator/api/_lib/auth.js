import { SignJWT, jwtVerify } from 'jose';
import { sql } from './db.js';
import {
  assertExpertEntitlementUpdate,
  serializeExpertEntitlement,
  TenantFeatureError,
} from './tenantFeatures.js';

const COOKIE_NAME = 'ironwrap_session';
const SESSION_DAYS = 30;

function secretKey() {
  if (!process.env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET is not set');
  }
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function createSessionCookie(userId, sessionVersion = 1) {
  const token = await new SignJWT({ sub: userId, sv: Number(sessionVersion) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  const match = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : null;
}

// Returns the authenticated user's id, or null if the request has no valid
// session — callers decide whether that's a 401 or just "no owner" (e.g. the
// public single-project GET route stays reachable either way).
export async function getSessionClaims(req) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.sub ? payload : null;
  } catch {
    return null;
  }
}

export async function getUserId(req) {
  const payload = await getSessionClaims(req);
  return payload?.sub || null;
}

export async function requireUserId(req, res) {
  const { requireActiveUser } = await import('./access.js');
  const user = await requireActiveUser(req, res);
  return user?.id || null;
}

function assertTenantFeatureRead(actor, tenantId) {
  const authorized = actor?.role === 'superadmin' || (actor?.id && actor.id === tenantId);
  if (!authorized) {
    throw new TenantFeatureError('Not authorized to read tenant features', {
      code: 'TENANT_FEATURE_READ_FORBIDDEN',
      status: 403,
    });
  }
}

// These helpers are the only database boundary for the hidden entitlement.
// Callers provide the authenticated server-side actor; client-supplied roles
// are never consulted. The narrow select also prevents unrelated settings
// fields from leaking through remote feature reads.
export async function readTenantExpertEntitlement({ actor, tenantId }) {
  assertTenantFeatureRead(actor, tenantId);
  const [row] = await sql`
    select u.id, u.role, coalesce(s.expert_mode_enabled, false) as expert_mode_enabled
    from users u
    left join settings s on s.owner_id = u.id
    where u.id = ${tenantId} and u.role = 'owner' and u.deleted_at is null
  `;
  if (!row) return null;
  return serializeExpertEntitlement({
    tenantId: row.id,
    role: row.role,
    tenantEntitlement: row.expert_mode_enabled,
  });
}

export async function writeTenantExpertEntitlement({
  actor,
  tenantId,
  value,
  reason,
  requestId,
  supportReference,
}) {
  const update = assertExpertEntitlementUpdate({ role: actor?.role, value, reason });
  if (!supportReference) {
    throw new TenantFeatureError('A support reference is required', {
      code: 'EXPERT_MODE_SUPPORT_REFERENCE_REQUIRED',
      status: 400,
    });
  }
  const [updatedRows] = await sql.transaction([
    sql`
      insert into settings (owner_id, expert_mode_enabled)
      select u.id, ${update.value}
      from users u
      where u.id = ${tenantId} and u.role = 'owner' and u.deleted_at is null
      on conflict (owner_id) do update set
        expert_mode_enabled = excluded.expert_mode_enabled,
        updated_at = now()
      returning owner_id, expert_mode_enabled
    `,
    sql`
      insert into superadmin_audit_events
        (actor_id, action, target_type, target_id, reason, request_id, support_reference, metadata)
      select ${actor.id}, 'tenant.expert-mode.updated', 'user', u.id, ${update.reason},
        ${requestId || null}, ${supportReference},
        ${JSON.stringify({ EXPERT_MODE_VAR: update.value })}::jsonb
      from users u
      where u.id = ${tenantId} and u.role = 'owner' and u.deleted_at is null
    `,
  ]);
  if (!updatedRows.length) return null;
  return serializeExpertEntitlement({
    tenantId: updatedRows[0].owner_id,
    role: 'owner',
    tenantEntitlement: updatedRows[0].expert_mode_enabled,
  });
}
