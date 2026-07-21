import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { requireCapability } from '../_lib/access.js';
import { assertAccountTransition, normalizeEmail } from '../_lib/superadminPolicy.js';
import { createSupportReference } from '../_lib/accountAdministration.js';
import { buildRestrictionNotifications } from '../_lib/notifications.js';
import { normalizePhoneE164, normalizeEmail as normalizeRecipientEmail } from '../_lib/commsValidation.js';
import { toAuditEvent, toNotification, toProjectDiagnostic, toTenantSummary } from '../_lib/superadminDto.js';
import { handleLibraryAction } from '../_lib/libraryRoutes.js';
import { LibraryValidationError } from '../_lib/libraryPolicy.js';

const capabilityByAction = {
  summary: 'platform.diagnostics.read',
  tenants: 'platform.diagnostics.read',
  users: 'users.create',
  status: 'users.freeze',
  'password-reset': 'users.password.reset',
  audit: 'platform.audit.read',
  notifications: 'platform.audit.read',
  'library.records': 'catalog.read',
  'library.record': 'catalog.write',
  'library.relationships': 'catalog.write',
  'library.documents': 'catalog.write',
  'library.export': 'catalog.export',
  'library.import.dry-run': 'catalog.import',
  'library.import.commit': 'catalog.import',
  'library.migration.status': 'catalog.read',
  'library.migration.run': 'catalog.import',
};

const requestIdFor = (req) => String(req.headers?.['x-vercel-id'] || req.headers?.['x-request-id'] || randomUUID());
const cleanLimit = (value, fallback = 50) => Math.min(100, Math.max(1, Number(value) || fallback));

function method(res, expected) {
  res.setHeader('Allow', expected);
  res.status(405).json({ error: 'Method not allowed' });
}

// D-066: an invalid stored phone/email is skipped, never enqueued — this is
// the same enqueue-time boundary buildRestrictionNotifications uses for the
// account-restriction path; password-reset notices go through this
// module-local helper instead, so the same check is applied here too. A
// channel skipped for one recipient never blocks the other.
function notificationQueries(user, template, payload, supportReference) {
  const destinations = [
    user.email && normalizeRecipientEmail(user.email) && ['email', normalizeRecipientEmail(user.email)],
    user.phone && normalizePhoneE164(user.phone) && ['sms', normalizePhoneE164(user.phone)],
  ].filter(Boolean);
  return destinations.map(([channel, destination]) => sql`
    insert into notification_outbox (user_id, channel, template, payload, support_reference)
    values (${user.id}, ${channel}, ${template}, ${JSON.stringify({ ...payload, destination })}::jsonb, ${supportReference})
  `);
}

function auditQuery(actor, action, targetId, reason, requestId, supportReference, metadata = {}) {
  return sql`
    insert into superadmin_audit_events
      (actor_id, action, target_type, target_id, reason, request_id, support_reference, metadata)
    values
      (${actor.id}, ${action}, 'user', ${targetId}, ${reason || null}, ${requestId}, ${supportReference || null}, ${JSON.stringify(metadata)}::jsonb)
  `;
}

async function handleSummary(res) {
  const [accounts, projects, pending, permanentlyFailed] = await Promise.all([
    sql`select status, count(*)::int as count from users group by status`,
    sql`select count(*)::int as count from projects`,
    // 'failed' is excluded on purpose — it's the frozen, pre-scheduler
    // legacy status (D-066/D-067); it's no longer actionable, so it
    // shouldn't read as a live operational backlog.
    sql`select count(*)::int as count from notification_outbox where status in ('pending', 'processing')`,
    sql`select count(*)::int as count from notification_outbox where status = 'permanently_failed'`,
  ]);
  res.status(200).json({
    accounts: Object.fromEntries(accounts.map((row) => [row.status || 'active', Number(row.count)])),
    projectCount: Number(projects[0]?.count || 0),
    pendingNotifications: Number(pending[0]?.count || 0),
    permanentlyFailedNotifications: Number(permanentlyFailed[0]?.count || 0),
  });
}

// A reseller only ever sees/acts on the owner accounts it created (reseller_id
// = its own id) — never another reseller's, never a superadmin's, never the
// platform at large. Superadmin has no such restriction. Written as a plain
// boolean OR'd into the WHERE clause (Neon's sql`` tag has no reusable
// fragment composition — see api/_lib/db.js's own note on this) rather than
// branching into two near-duplicate queries per call site.
const notScopedToReseller = (actor) => actor.role !== 'reseller';

async function handleTenants(req, res, actor) {
  const id = req.query.id;
  if (!id) {
    const rows = await sql`
      select u.id, u.email, u.company_name, u.business_name, u.phone, u.role, u.status,
        u.status_reason, u.status_changed_at, u.created_at, u.last_login_at, u.deleted_at,
        u.purge_after, u.reseller_id, count(p.id)::int as project_count
      from users u left join projects p on p.owner_id = u.id
      where ${notScopedToReseller(actor)} or u.reseller_id = ${actor.id}
      group by u.id order by u.created_at desc limit ${cleanLimit(req.query.limit)}
    `;
    res.status(200).json({ tenants: rows.map(toTenantSummary) });
    return;
  }
  const [row] = await sql`
    select u.id, u.email, u.company_name, u.business_name, u.phone, u.role, u.status,
      u.status_reason, u.status_changed_at, u.created_at, u.last_login_at, u.deleted_at,
      u.purge_after, u.reseller_id, count(p.id)::int as project_count
    from users u left join projects p on p.owner_id = u.id
    where u.id = ${id} and (${notScopedToReseller(actor)} or u.reseller_id = ${actor.id})
    group by u.id
  `;
  if (!row) return res.status(404).json({ error: 'Account not found' });
  const projectRows = await sql`
    select id, job_number, created_at, updated_at, 0::int as layer_count, 0::int as facet_count
    from projects where owner_id = ${id} order by updated_at desc limit 100
  `;
  res.status(200).json({ tenant: toTenantSummary(row), projects: projectRows.map(toProjectDiagnostic) });
}

async function handleCreateUser(req, res, actor) {
  if (req.method !== 'POST') return method(res, 'POST');
  const email = normalizeEmail(req.body?.email);
  const temporaryPassword = String(req.body?.temporaryPassword || '');
  if (!email || temporaryPassword.length < 12) {
    return res.status(400).json({ error: 'Email and a temporary password of at least 12 characters are required' });
  }
  // Only a superadmin may create another reseller — a reseller's own
  // "create account" action always produces a plain owner underneath it,
  // scoped to that reseller (never another reseller, never a superadmin).
  const requestedRole = String(req.body?.role || 'owner');
  if (requestedRole !== 'owner' && !(requestedRole === 'reseller' && actor.role === 'superadmin')) {
    return res.status(403).json({ error: 'Not authorized to create an account with that role' });
  }
  const resellerId = actor.role === 'reseller' ? actor.id : null;
  const existing = await sql`select id from users where email = ${email}`;
  if (existing.length) return res.status(409).json({ error: 'An account with that email already exists' });
  const hash = await bcrypt.hash(temporaryPassword, 10);
  const supportReference = createSupportReference();
  const [created] = await sql.transaction([
    sql`insert into users (email, password_hash, company_name, business_name, phone, role, reseller_id, must_change_password)
        values (${email}, ${hash}, ${req.body?.companyName || null}, ${req.body?.companyName || null}, ${req.body?.phone || null}, ${requestedRole}, ${resellerId}, true)
        returning id, email, company_name, business_name, phone, role, status, reseller_id, created_at`,
    auditQuery(actor, 'user.created', null, String(req.body?.reason || 'SuperAdmin account creation'), requestIdFor(req), supportReference, { email, role: requestedRole }),
  ]);
  res.status(201).json({ user: toTenantSummary(created[0]), supportReference });
}

async function handleStatus(req, res, actor) {
  if (req.method !== 'POST') return method(res, 'POST');
  const targetId = String(req.query.id || req.body?.id || '');
  const nextStatus = String(req.body?.status || '');
  const [target] = await sql`
    select id, email, phone, role, status from users
    where id = ${targetId} and (${notScopedToReseller(actor)} or reseller_id = ${actor.id})
  `;
  if (!target) return res.status(404).json({ error: 'Account not found' });
  const transition = assertAccountTransition(actor, target, nextStatus, req.body?.reason);
  const needed = nextStatus === 'blocked' ? 'users.block'
    : nextStatus === 'deleted' ? 'users.delete'
      : nextStatus === 'active' && target.status === 'deleted' ? 'users.restore' : 'users.freeze';
  const authorized = await requireCapability(req, res, needed);
  if (!authorized) return;
  const supportReference = createSupportReference();
  const { notifications: noticeRows, skipped } = buildRestrictionNotifications(target, nextStatus, transition.reason, supportReference);
  const deletion = nextStatus === 'deleted';
  const queries = [
    sql`update users set status = ${nextStatus}, status_reason = ${transition.reason},
        status_changed_at = now(), status_changed_by = ${actor.id}, session_version = session_version + 1,
        deleted_at = case when ${deletion} then now() else null end,
        purge_after = case when ${deletion} then now() + interval '90 days' else null end
        where id = ${targetId} returning id`,
    auditQuery(actor, `account.${nextStatus}`, targetId, transition.reason, requestIdFor(req), supportReference),
    ...noticeRows.map((notice) => sql`
      insert into notification_outbox (user_id, channel, template, payload, support_reference)
      values (${notice.userId}, ${notice.channel}, ${notice.template}, ${JSON.stringify({ ...notice.payload, destination: notice.destination })}::jsonb, ${supportReference})
    `),
  ];
  await sql.transaction(queries);
  res.status(200).json({ ok: true, status: nextStatus, supportReference, notificationsQueued: noticeRows.length, notificationsSkipped: skipped });
}

async function handlePasswordReset(req, res, actor) {
  if (req.method !== 'POST') return method(res, 'POST');
  const targetId = String(req.query.id || req.body?.id || '');
  const temporaryPassword = String(req.body?.temporaryPassword || '');
  const reason = String(req.body?.reason || '').trim();
  if (temporaryPassword.length < 12 || !reason) return res.status(400).json({ error: 'A reason and temporary password of at least 12 characters are required' });
  const [target] = await sql`
    select id, email, phone from users
    where id = ${targetId} and deleted_at is null and (${notScopedToReseller(actor)} or reseller_id = ${actor.id})
  `;
  if (!target) return res.status(404).json({ error: 'Account not found' });
  const hash = await bcrypt.hash(temporaryPassword, 10);
  const supportReference = createSupportReference();
  await sql.transaction([
    sql`update users set password_hash = ${hash}, must_change_password = true, session_version = session_version + 1 where id = ${targetId}`,
    auditQuery(actor, 'user.password.reset', targetId, reason, requestIdFor(req), supportReference),
    ...notificationQueries(target, 'account.temporary-password', { reason, supportReference }, supportReference),
  ]);
  res.status(200).json({ ok: true, supportReference });
}

async function handleAudit(req, res) {
  const rows = await sql`select * from superadmin_audit_events order by created_at desc limit ${cleanLimit(req.query.limit)}`;
  res.status(200).json({ events: rows.map(toAuditEvent) });
}

const NOTIFICATION_STATUSES = ['pending', 'processing', 'sent', 'permanently_failed', 'failed'];

async function handleNotifications(req, res, actor) {
  if (req.method === 'GET') {
    const status = String(req.query.status || '');
    const rows = status
      ? (NOTIFICATION_STATUSES.includes(status)
        ? await sql`select * from notification_outbox where status = ${status} order by created_at desc limit ${cleanLimit(req.query.limit)}`
        : [])
      : await sql`select * from notification_outbox order by created_at desc limit ${cleanLimit(req.query.limit)}`;
    res.status(200).json({ notifications: rows.map(toNotification) });
    return;
  }
  if (req.method !== 'POST') return method(res, 'GET, POST');
  const id = String(req.query.id || req.body?.id || '');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  const supportReference = createSupportReference();
  await sql.transaction([
    sql`update notification_outbox set status = 'pending', next_attempt_at = now(), last_error = null, error_category = null where id = ${id}`,
    auditQuery(actor, 'notification.retry', null, reason, requestIdFor(req), supportReference, { notificationId: id }),
  ]);
  res.status(200).json({ ok: true, supportReference });
}

export default async function handler(req, res) {
  const action = String(req.query.action || 'summary');
  const capability = capabilityByAction[action];
  if (!capability) return res.status(404).json({ error: 'Unknown SuperAdmin action' });
  try {
    await ensureSchema();
    const actor = await requireCapability(req, res, capability);
    if (!actor) return;
    if (action.startsWith('library.')) return handleLibraryAction({ req, res, actor, action, requestId: requestIdFor(req) });
    if (action === 'summary') return req.method === 'GET' ? handleSummary(res) : method(res, 'GET');
    if (action === 'tenants') return req.method === 'GET' ? handleTenants(req, res, actor) : method(res, 'GET');
    if (action === 'users') return handleCreateUser(req, res, actor);
    if (action === 'status') return handleStatus(req, res, actor);
    if (action === 'password-reset') return handlePasswordReset(req, res, actor);
    if (action === 'audit') return req.method === 'GET' ? handleAudit(req, res) : method(res, 'GET');
    return handleNotifications(req, res, actor);
  } catch (error) {
    if (error instanceof LibraryValidationError) {
      const status = error.code === 'LIBRARY_RECORD_NOT_FOUND' ? 404 : error.code === 'LIBRARY_VERSION_CONFLICT' ? 409 : 400;
      return res.status(status).json({ error: { code: error.code, message: error.message, details: error.details || {} }, requestId: requestIdFor(req) });
    }
    const expected = /reason|required|transition|own account/i.test(error.message || '');
    if (!expected) console.error('SuperAdmin request failed:', error);
    res.status(expected ? 400 : 500).json({ error: expected ? error.message : 'SuperAdmin operation failed' });
  }
}
