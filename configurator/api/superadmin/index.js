import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { sql, ensureSchema } from '../_lib/db.js';
import { readTenantExpertEntitlement, writeTenantExpertEntitlement } from '../_lib/auth.js';
import { requireCapability } from '../_lib/access.js';
import { assertAccountTransition, normalizeEmail } from '../_lib/superadminPolicy.js';
import { createSupportReference } from '../_lib/accountAdministration.js';
import { buildRestrictionNotifications } from '../_lib/notifications.js';
import { toAuditEvent, toNotification, toProjectDiagnostic, toTenantSummary } from '../_lib/superadminDto.js';
import { handleLibraryAction } from '../_lib/libraryRoutes.js';
import { LibraryValidationError } from '../_lib/libraryPolicy.js';
import { TenantFeatureError } from '../_lib/tenantFeatures.js';

const capabilityByAction = {
  summary: 'platform.diagnostics.read',
  tenants: 'platform.diagnostics.read',
  users: 'users.create',
  status: 'users.freeze',
  'password-reset': 'users.password.reset',
  audit: 'platform.audit.read',
  notifications: 'platform.audit.read',
  'expert-mode': 'platform.diagnostics.read',
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

function notificationQueries(user, template, payload, supportReference) {
  const destinations = [
    user.email && ['email', user.email],
    user.phone && ['sms', user.phone],
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
  const [accounts, projects, pending] = await Promise.all([
    sql`select status, count(*)::int as count from users group by status`,
    sql`select count(*)::int as count from projects`,
    sql`select count(*)::int as count from notification_outbox where status in ('pending', 'failed')`,
  ]);
  res.status(200).json({
    accounts: Object.fromEntries(accounts.map((row) => [row.status || 'active', Number(row.count)])),
    projectCount: Number(projects[0]?.count || 0),
    pendingNotifications: Number(pending[0]?.count || 0),
  });
}

async function handleTenants(req, res) {
  const id = req.query.id;
  if (!id) {
    const rows = await sql`
      select u.id, u.email, u.company_name, u.business_name, u.phone, u.role, u.status,
        u.status_reason, u.status_changed_at, u.created_at, u.last_login_at, u.deleted_at,
        u.purge_after, count(p.id)::int as project_count
      from users u left join projects p on p.owner_id = u.id
      group by u.id order by u.created_at desc limit ${cleanLimit(req.query.limit)}
    `;
    res.status(200).json({ tenants: rows.map(toTenantSummary) });
    return;
  }
  const [row] = await sql`
    select u.id, u.email, u.company_name, u.business_name, u.phone, u.role, u.status,
      u.status_reason, u.status_changed_at, u.created_at, u.last_login_at, u.deleted_at,
      u.purge_after, count(p.id)::int as project_count
    from users u left join projects p on p.owner_id = u.id where u.id = ${id}
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
  const existing = await sql`select id from users where email = ${email}`;
  if (existing.length) return res.status(409).json({ error: 'An account with that email already exists' });
  const hash = await bcrypt.hash(temporaryPassword, 10);
  const supportReference = createSupportReference();
  const [created] = await sql.transaction([
    sql`insert into users (email, password_hash, company_name, business_name, phone, role, must_change_password)
        values (${email}, ${hash}, ${req.body?.companyName || null}, ${req.body?.companyName || null}, ${req.body?.phone || null}, 'owner', true)
        returning id, email, company_name, business_name, phone, role, status, created_at`,
    auditQuery(actor, 'user.created', null, String(req.body?.reason || 'SuperAdmin account creation'), requestIdFor(req), supportReference, { email }),
  ]);
  res.status(201).json({ user: toTenantSummary(created[0]), supportReference });
}

async function handleStatus(req, res, actor) {
  if (req.method !== 'POST') return method(res, 'POST');
  const targetId = String(req.query.id || req.body?.id || '');
  const nextStatus = String(req.body?.status || '');
  const [target] = await sql`select id, email, phone, role, status from users where id = ${targetId}`;
  if (!target) return res.status(404).json({ error: 'Account not found' });
  const transition = assertAccountTransition(actor, target, nextStatus, req.body?.reason);
  const needed = nextStatus === 'blocked' ? 'users.block'
    : nextStatus === 'deleted' ? 'users.delete'
      : nextStatus === 'active' && target.status === 'deleted' ? 'users.restore' : 'users.freeze';
  const authorized = await requireCapability(req, res, needed);
  if (!authorized) return;
  const supportReference = createSupportReference();
  const noticeRows = buildRestrictionNotifications(target, nextStatus, transition.reason, supportReference);
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
  res.status(200).json({ ok: true, status: nextStatus, supportReference, notificationsQueued: noticeRows.length });
}

async function handlePasswordReset(req, res, actor) {
  if (req.method !== 'POST') return method(res, 'POST');
  const targetId = String(req.query.id || req.body?.id || '');
  const temporaryPassword = String(req.body?.temporaryPassword || '');
  const reason = String(req.body?.reason || '').trim();
  if (temporaryPassword.length < 12 || !reason) return res.status(400).json({ error: 'A reason and temporary password of at least 12 characters are required' });
  const [target] = await sql`select id, email, phone from users where id = ${targetId} and deleted_at is null`;
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

async function handleNotifications(req, res, actor) {
  if (req.method === 'GET') {
    const rows = await sql`select * from notification_outbox order by created_at desc limit ${cleanLimit(req.query.limit)}`;
    res.status(200).json({ notifications: rows.map(toNotification) });
    return;
  }
  if (req.method !== 'POST') return method(res, 'GET, POST');
  const id = String(req.query.id || req.body?.id || '');
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required' });
  const supportReference = createSupportReference();
  await sql.transaction([
    sql`update notification_outbox set status = 'pending', next_attempt_at = now(), last_error = null where id = ${id}`,
    auditQuery(actor, 'notification.retry', null, reason, requestIdFor(req), supportReference, { notificationId: id }),
  ]);
  res.status(200).json({ ok: true, supportReference });
}

async function handleExpertMode(req, res, actor) {
  const tenantId = String(req.query.id || '');
  if (!tenantId) return res.status(400).json({ error: 'A tenant id is required' });
  if (req.method === 'GET') {
    const feature = await readTenantExpertEntitlement({ actor, tenantId });
    return feature
      ? res.status(200).json(feature)
      : res.status(404).json({ error: 'Account not found' });
  }
  if (req.method !== 'PUT') return method(res, 'GET, PUT');
  const supportReference = createSupportReference();
  const feature = await writeTenantExpertEntitlement({
    actor,
    tenantId,
    value: req.body?.EXPERT_MODE_VAR,
    reason: req.body?.reason,
    requestId: requestIdFor(req),
    supportReference,
  });
  return feature
    ? res.status(200).json({ ...feature, supportReference })
    : res.status(404).json({ error: 'Account not found' });
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
    if (action === 'tenants' && req.query.sub === 'expert-mode') return handleExpertMode(req, res, actor);
    if (action === 'summary') return req.method === 'GET' ? handleSummary(res) : method(res, 'GET');
    if (action === 'tenants') return req.method === 'GET' ? handleTenants(req, res) : method(res, 'GET');
    if (action === 'users') return handleCreateUser(req, res, actor);
    if (action === 'status') return handleStatus(req, res, actor);
    if (action === 'password-reset') return handlePasswordReset(req, res, actor);
    if (action === 'audit') return req.method === 'GET' ? handleAudit(req, res) : method(res, 'GET');
    if (action === 'expert-mode') return handleExpertMode(req, res, actor);
    return handleNotifications(req, res, actor);
  } catch (error) {
    if (error instanceof TenantFeatureError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (error instanceof LibraryValidationError) {
      const status = error.code === 'LIBRARY_RECORD_NOT_FOUND' ? 404 : error.code === 'LIBRARY_VERSION_CONFLICT' ? 409 : 400;
      return res.status(status).json({ error: { code: error.code, message: error.message, details: error.details || {} }, requestId: requestIdFor(req) });
    }
    const expected = /reason|required|transition|own account/i.test(error.message || '');
    if (!expected) console.error('SuperAdmin request failed:', error);
    res.status(expected ? 400 : 500).json({ error: expected ? error.message : 'SuperAdmin operation failed' });
  }
}
