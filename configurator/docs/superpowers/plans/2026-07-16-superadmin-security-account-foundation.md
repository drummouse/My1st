# SuperAdmin Security and Account Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace legacy developer cross-tenant access with capability-checked SuperAdmin administration, privacy-safe diagnostics, account restriction, auditing, and durable notification queuing.

**Architecture:** Keep the current user-as-tenant boundary. Put bootstrap, capabilities, state transitions, and privacy projections in small policy modules; persist state/audit/outbox data in Neon; expose one consolidated `/api/superadmin` handler to respect Vercel's function limit; render a dedicated Platform console without tenant impersonation.

**Tech Stack:** React 18, Vite 5, Vercel Functions, Neon serverless Postgres, jose, bcryptjs, Node test runner.

## Global Constraints

- Generic XML import, 3D generation, dynamic skins/profiles, roof/wall/slope/facet recognition, measurements, persistence, sharing, approval, HTML export, and PDF generation are protected behavior.
- Roles are `owner` and `superadmin`; legacy `developer` has no privilege.
- SuperAdmin never impersonates a tenant and never receives customer names, addresses, designs, measurements, pricing, attachments, or reports.
- Freeze/block takes effect immediately for authenticated and public access.
- Notification failure never reverses an account restriction.
- No self-service password recovery.
- Privileged mutations require a reason and audit record.
- Use consolidated handlers and rewrites rather than one function per endpoint.
- Never return or commit secrets.

---

### Task 1: Pure Policy Contracts

**Files:**
- Create: `configurator/api/_lib/superadminPolicy.js`
- Test: `configurator/tests/superadminPolicy.test.mjs`

**Interfaces:**
- Produces: `parseSuperAdminEmails(value)`, `roleForBootstrap(user, allowlist)`, `hasCapability(role, capability)`, `assertAccountTransition(actor, target, nextStatus, reason)`.

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSuperAdminEmails, roleForBootstrap, hasCapability, assertAccountTransition } from '../api/_lib/superadminPolicy.js';

test('bootstrap normalizes case and whitespace without silent demotion', () => {
  const allowed = parseSuperAdminEmails(' Admin@IronWrap.ca, ops@example.com ');
  assert.equal(roleForBootstrap({ email: 'admin@ironwrap.ca', role: 'owner' }, allowed), 'superadmin');
  assert.equal(roleForBootstrap({ email: 'removed@example.com', role: 'superadmin' }, new Set()), 'superadmin');
});

test('legacy developer and owner receive no platform capabilities', () => {
  assert.equal(hasCapability('developer', 'users.freeze'), false);
  assert.equal(hasCapability('owner', 'users.freeze'), false);
  assert.equal(hasCapability('superadmin', 'users.freeze'), true);
});

test('transitions require a reason and reject self-restriction', () => {
  assert.throws(() => assertAccountTransition({ id: 'x' }, { id: 'x', status: 'active' }, 'frozen', 'test'), /own account/i);
  assert.throws(() => assertAccountTransition({ id: 'a' }, { id: 'b', status: 'active' }, 'frozen', ' '), /reason/i);
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/superadminPolicy.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the minimal policy module**

```js
const ROLE_CAPABILITIES = {
  owner: [],
  superadmin: [
    'users.create', 'users.freeze', 'users.block', 'users.delete', 'users.restore',
    'users.password.reset', 'tenants.transfer.export', 'tenants.transfer.import',
    'catalog.read', 'catalog.write', 'catalog.import', 'catalog.export',
    'catalog.review', 'catalog.publish', 'skins.manage',
    'platform.audit.read', 'platform.diagnostics.read',
  ],
};

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
export const parseSuperAdminEmails = (value) => new Set(String(value || '').split(',').map(normalizeEmail).filter(Boolean));
export const roleForBootstrap = (user, allowed) => user.role === 'superadmin' || allowed.has(normalizeEmail(user.email)) ? 'superadmin' : 'owner';
export const hasCapability = (role, capability) => (ROLE_CAPABILITIES[role] || []).includes(capability);

export function assertAccountTransition(actor, target, nextStatus, reason) {
  const clean = String(reason || '').trim();
  if (!clean) throw new Error('A reason is required');
  if (actor.id === target.id && nextStatus !== 'active') throw new Error('Cannot restrict your own account');
  const allowed = { active: ['frozen', 'blocked', 'deleted'], frozen: ['active', 'blocked', 'deleted'], blocked: ['active', 'deleted'], deleted: ['active'] };
  if (!allowed[target.status]?.includes(nextStatus)) throw new Error('Invalid account status transition');
  return { nextStatus, reason: clean };
}
```

- [ ] **Step 4: Run GREEN**

Run: `cd configurator && node --test tests/superadminPolicy.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add configurator/api/_lib/superadminPolicy.js configurator/tests/superadminPolicy.test.mjs
git commit -m "feat: define SuperAdmin policy contracts"
```

### Task 2: Additive Schema and Legacy Role Migration

**Files:**
- Modify: `configurator/api/_lib/db.js`
- Modify: `configurator/db/schema.sql`
- Test: `configurator/tests/superadminSchema.test.mjs`

**Interfaces:**
- Produces: account status/session fields, `superadmin_audit_events`, and `notification_outbox`.

- [ ] **Step 1: Write a failing source-contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('runtime schema includes account, audit, and outbox contracts', () => {
  const source = fs.readFileSync(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  for (const text of ['session_version integer not null default 1', 'must_change_password boolean not null default false', 'superadmin_audit_events', 'notification_outbox']) {
    assert.equal(source.includes(text), true, text);
  }
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/superadminSchema.test.mjs`

Expected: missing schema fragments.

- [ ] **Step 3: Add identical idempotent migrations to both schema sources**

```sql
update users set role = 'owner' where role = 'developer';
alter table users add column if not exists status text not null default 'active';
alter table users add column if not exists status_reason text;
alter table users add column if not exists status_changed_at timestamptz;
alter table users add column if not exists status_changed_by uuid references users(id);
alter table users add column if not exists last_login_at timestamptz;
alter table users add column if not exists session_version integer not null default 1;
alter table users add column if not exists must_change_password boolean not null default false;
alter table users add column if not exists deleted_at timestamptz;
alter table users add column if not exists purge_after timestamptz;

create table if not exists superadmin_audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null references users(id),
  action text not null, target_type text not null, target_id uuid, reason text,
  metadata jsonb not null default '{}'::jsonb, request_id text, support_reference text,
  result text not null default 'succeeded', created_at timestamptz not null default now()
);

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id),
  channel text not null, template text not null, payload jsonb not null,
  status text not null default 'pending', attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(), last_error text, sent_at timestamptz,
  support_reference text not null, created_at timestamptz not null default now()
);
```

Add guarded check constraints limiting role to `owner|superadmin` and status to `active|frozen|blocked|deleted`.

- [ ] **Step 4: Run GREEN and the suite**

Run: `cd configurator && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add configurator/api/_lib/db.js configurator/db/schema.sql configurator/tests/superadminSchema.test.mjs
git commit -m "feat: add SuperAdmin account and audit schema"
```

### Task 3: Versioned Sessions, Bootstrap, and Active Guards

**Files:**
- Modify: `configurator/api/_lib/auth.js`
- Create: `configurator/api/_lib/access.js`
- Modify: `configurator/api/auth/[action].js`
- Test: `configurator/tests/accessPolicy.test.mjs`

**Interfaces:**
- Produces: JWT claims `{ sub, sv }`, `requireActiveUser(req,res)`, and `requireCapability(req,res,capability)`.

- [ ] **Step 1: Write failing pure-policy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeUserRecord } from '../api/_lib/access.js';

test('active matching session is accepted', () => assert.equal(authorizeUserRecord({ status: 'active', session_version: 3 }, { sv: 3 }).ok, true));
test('frozen and stale sessions are rejected', () => {
  assert.equal(authorizeUserRecord({ status: 'frozen', session_version: 3 }, { sv: 3 }).code, 'ACCOUNT_RESTRICTED');
  assert.equal(authorizeUserRecord({ status: 'active', session_version: 4 }, { sv: 3 }).code, 'SESSION_REVOKED');
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/accessPolicy.test.mjs`

Expected: missing `access.js`.

- [ ] **Step 3: Implement policy and database-backed guards**

```js
export function authorizeUserRecord(user, session) {
  if (!user || user.deleted_at) return { ok: false, code: 'NOT_AUTHENTICATED' };
  if (user.status !== 'active') return { ok: false, code: 'ACCOUNT_RESTRICTED' };
  if (Number(user.session_version) !== Number(session.sv)) return { ok: false, code: 'SESSION_REVOKED' };
  return { ok: true };
}
```

Change session creation to `createSessionCookie(userId, sessionVersion)`. During login and `me`, apply normalized `SUPERADMIN_EMAILS` bootstrap, persist promotion, reject inactive/deleted accounts, and serialize role, status, capabilities, and `mustChangePassword`. Update `last_login_at` only on login.

- [ ] **Step 4: Run GREEN and full tests**

Run: `cd configurator && node --test tests/accessPolicy.test.mjs && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add configurator/api/_lib/auth.js configurator/api/_lib/access.js configurator/api/auth/'[action].js' configurator/tests/accessPolicy.test.mjs
git commit -m "feat: enforce active versioned sessions"
```

### Task 4: Remove Legacy Cross-Tenant Access

**Files:**
- Delete: `configurator/api/_lib/roles.js`
- Modify: `configurator/api/projects/index.js`
- Modify: `configurator/api/settings/index.js`
- Modify: `configurator/api/custom-services/index.js`
- Modify: `configurator/api/colors/index.js`
- Modify: `configurator/api/materials/index.js`
- Modify: `configurator/api/attachments/index.js`
- Modify: `configurator/DEVELOPER_ACCESS.md`
- Test: `configurator/tests/noLegacyDeveloperAccess.test.mjs`

**Interfaces:**
- Consumes: `requireActiveUser`; produces strict owner-only CRUD outside SuperAdmin APIs.

- [ ] **Step 1: Write the failing regression test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of ['projects','settings','custom-services','colors','materials','attachments']) {
  test(`${file} has no developer bypass`, () => {
    const source = fs.readFileSync(new URL(`../api/${file}/index.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /isDeveloper|resolveOwnerId|canActOnOwner|asOwner/);
  });
}
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/noLegacyDeveloperAccess.test.mjs`

Expected: failures on current role imports and `asOwner` handling.

- [ ] **Step 3: Remove bypasses**

Resolve every authenticated request to its active user and compare resource `owner_id` directly. Preserve only deliberate customer-facing public reads. Replace legacy developer documentation with the no-impersonation SuperAdmin privacy contract.

- [ ] **Step 4: Run GREEN and full tests**

Run: `cd configurator && node --test tests/noLegacyDeveloperAccess.test.mjs && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A configurator/api configurator/DEVELOPER_ACCESS.md configurator/tests/noLegacyDeveloperAccess.test.mjs
git commit -m "security: remove developer cross-tenant access"
```

### Task 5: Public-Link Restriction

**Files:**
- Create: `configurator/api/_lib/publicAccess.js`
- Modify: `configurator/api/projects/index.js`
- Test: `configurator/tests/publicAccess.test.mjs`

**Interfaces:**
- Produces: `publicTenantAccess(status)`; consumes owner status for public project reads and approval.

- [ ] **Step 1: Write failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { publicTenantAccess } from '../api/_lib/publicAccess.js';

test('active tenant is public', () => assert.equal(publicTenantAccess('active').allowed, true));
for (const status of ['frozen', 'blocked', 'deleted']) test(`${status} is neutrally unavailable`, () => {
  assert.deepEqual(publicTenantAccess(status), { allowed: false, status: 503, body: { error: 'This design is temporarily unavailable. Please contact the contractor.' } });
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/publicAccess.test.mjs`

Expected: missing module.

- [ ] **Step 3: Implement policy and owner-status joins**

Apply the exact pure response above. For public project GET and approval, join `projects.owner_id` to `users.status` and apply the policy before returning data or mutating approval.

- [ ] **Step 4: Run GREEN and full tests**

Run: `cd configurator && node --test tests/publicAccess.test.mjs && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add configurator/api/_lib/publicAccess.js configurator/api/projects/index.js configurator/tests/publicAccess.test.mjs
git commit -m "security: restrict public links for inactive tenants"
```

### Task 6: Transactional Audit and Notification Outbox

**Files:**
- Create: `configurator/api/_lib/accountAdministration.js`
- Create: `configurator/api/_lib/notifications.js`
- Test: `configurator/tests/accountAdministration.test.mjs`

**Interfaces:**
- Produces: `buildRestrictionNotifications(user,state,reason,reference)`, `changeAccountStatus(input)`, and `deliverNotification(row,deliverers)`.

- [ ] **Step 1: Write failing notification tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRestrictionNotifications } from '../api/_lib/notifications.js';

test('restriction queues email and sms with reason and reference', () => {
  const rows = buildRestrictionNotifications({ id:'u1', email:'owner@example.com', phone:'+17805550123' }, 'frozen', 'Security review', 'IW-ABC123');
  assert.deepEqual(rows.map((row) => row.channel), ['email', 'sms']);
  for (const row of rows) {
    assert.equal(row.payload.reason, 'Security review');
    assert.equal(row.supportReference, 'IW-ABC123');
  }
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/accountAdministration.test.mjs`

Expected: missing module.

- [ ] **Step 3: Implement transactional state change**

Within one Neon transaction: lock target `FOR UPDATE`; assert transition; increment `session_version`; update status fields; insert an append-only audit row; enqueue email/SMS rows using one generated `IW-...` support reference; commit before attempting delivery.

```js
export async function deliverNotification(row, deliverers) {
  const deliver = deliverers[row.channel];
  if (!deliver) return { status: 'pending', error: 'Provider is not configured' };
  await deliver(row.payload);
  return { status: 'sent', error: null };
}
```

- [ ] **Step 4: Run GREEN and full tests**

Run: `cd configurator && node --test tests/accountAdministration.test.mjs && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add configurator/api/_lib/accountAdministration.js configurator/api/_lib/notifications.js configurator/tests/accountAdministration.test.mjs
git commit -m "feat: add audited restrictions and notification outbox"
```

### Task 7: Privacy-Safe API and User Administration

**Files:**
- Create: `configurator/api/superadmin/index.js`
- Create: `configurator/api/_lib/superadminDto.js`
- Modify: `configurator/vercel.json`
- Test: `configurator/tests/superadminDto.test.mjs`
- Test: `configurator/tests/superadminRoutes.test.mjs`

**Interfaces:**
- Produces: explicit tenant/project DTOs and consolidated SuperAdmin endpoints.

- [ ] **Step 1: Write a failing privacy projection test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toProjectDiagnostic } from '../api/_lib/superadminDto.js';

test('diagnostic excludes private content', () => {
  const dto = toProjectDiagnostic({ id:'p1', job_number:'26-180', customer_name:'Private', address:'Private', design:{ private:true }, layer_count:2, facet_count:16 });
  assert.equal(dto.id, 'p1');
  assert.equal(dto.jobNumber, '26-180');
  assert.equal(JSON.stringify(dto).includes('Private'), false);
  assert.equal('design' in dto, false);
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/superadminDto.test.mjs`

Expected: missing DTO module.

- [ ] **Step 3: Implement DTOs and consolidated routes**

Implement summary, tenant list/detail, create user, freeze/block/activate, soft delete/restore, temporary-password reset, audit list, notification list/retry. Create/reset hashes the temporary password, sets `must_change_password`, increments `session_version`, audits, and queues notices. Soft deletion sets `status='deleted'`, `deleted_at`, and `purge_after`; it never cascades.

Add rewrites:

```json
{ "source": "/api/superadmin/tenants/:id/:sub", "destination": "/api/superadmin?action=tenants&id=:id&sub=:sub" },
{ "source": "/api/superadmin/:action", "destination": "/api/superadmin?action=:action" }
```

- [ ] **Step 4: Run GREEN, route tests, and full tests**

Run: `cd configurator && node --test tests/superadminDto.test.mjs tests/superadminRoutes.test.mjs && npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add configurator/api/superadmin/index.js configurator/api/_lib/superadminDto.js configurator/vercel.json configurator/tests/superadminDto.test.mjs configurator/tests/superadminRoutes.test.mjs
git commit -m "feat: add privacy-safe SuperAdmin API"
```

### Task 8: Platform Console, Forced Password Change, and Verification

**Files:**
- Modify: `configurator/src/components/AuthGate.jsx`
- Create: `configurator/src/components/PlatformConsole.jsx`
- Create: `configurator/src/lib/superadminClient.js`
- Modify: `configurator/src/App.jsx`
- Modify: `configurator/src/index.css`
- Modify: `configurator/scripts/smoke-test.mjs`
- Modify: `configurator/README.md`
- Create: `configurator/docs/SUPERADMIN_OPERATIONS.md`
- Test: `configurator/tests/platformConsoleContract.test.mjs`

**Interfaces:**
- Consumes: `/api/auth/me` role, capabilities, status, and `mustChangePassword`.
- Produces: capability-gated Platform console and mandatory password-change flow.

- [ ] **Step 1: Write a failing UI contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Platform UI is capability gated and has no impersonation', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const platform = fs.readFileSync(new URL('../src/components/PlatformConsole.jsx', import.meta.url), 'utf8');
  assert.match(app, /platform\.diagnostics\.read/);
  assert.doesNotMatch(app + platform, /asOwner|impersonat|switch tenant/i);
});
```

- [ ] **Step 2: Run RED**

Run: `cd configurator && node --test tests/platformConsoleContract.test.mjs`

Expected: missing `PlatformConsole.jsx`.

- [ ] **Step 3: Implement the console and password-change gate**

Retain the authenticated `/api/auth/me` response and pass it to `App`. If `mustChangePassword` is true, render only a password-change form until the authenticated change-password endpoint succeeds. Show Platform navigation only with `platform.diagnostics.read`. Include summary, tenant metadata/diagnostics, status controls with mandatory reason, user creation, reset, audit, and notification retry. Do not add project-content viewing or tenant switching.

- [ ] **Step 4: Document operations and extend smoke coverage**

Document `SUPERADMIN_EMAILS`, explicit demotion, capability extension, privacy fields, restrictions, notification providers, soft-delete retention, password reset, and rollback. Smoke-test unauthenticated SuperAdmin rejection and active/restricted public-link behavior.

- [ ] **Step 5: Run complete verification**

Run:

```bash
cd configurator
npm test
npm run build
npm run smoke -- http://localhost:3000
```

Expected: all tests and builds pass; smoke checks pass; logs contain no secrets or private project content.

- [ ] **Step 6: Commit**

```bash
git add configurator/src configurator/scripts/smoke-test.mjs configurator/README.md configurator/docs/SUPERADMIN_OPERATIONS.md configurator/tests/platformConsoleContract.test.mjs
git commit -m "feat: add SuperAdmin platform console"
```

## Follow-On Plans

1. Global/tenant Library, many-to-many manufacturers/suppliers/collections/catalogs/categories, tenant deactivation, JSON/CSV import/export.
2. Opaque encrypted complete-tenant transfer.
3. Capture/Scanner pending review, revision, merge, and publication with contributor attribution.
4. Skin import, validation, activation, and rollback.
5. Semantic design system and IronWrap red-direction UI.
