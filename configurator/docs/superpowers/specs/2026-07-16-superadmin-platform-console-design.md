# SuperAdmin Platform Console Design

**Status:** Approved  
**Date:** 2026-07-16  
**Scope:** SuperAdmin authorization, privacy-safe platform console, account restriction, auditing, and provider-neutral notification foundation.

## Context

IronWrap already has a working generic XML import flow, rotatable 3D generation, dynamic material skins and profiles, roof/wall/slope/facet recognition, measurement calculation, project persistence, sharing, and PDF generation. These capabilities are protected functionality and must not be rebuilt or weakened by this work.

The current application uses one `users` row as both login identity and tenant boundary. A legacy `developer` role grants direct cross-tenant access through `?asOwner=` and ownership bypasses. That behavior conflicts with the approved client-privacy model and must be removed.

## Decisions

- Extend the current user-as-tenant model for this sprint.
- Roles are `owner` and `superadmin`.
- Bootstrap SuperAdmin accounts from a normalized, comma-separated `SUPERADMIN_EMAILS` environment variable.
- No impersonation, tenant switching, or acting through a client's identity.
- Remove all legacy `developer` cross-tenant privileges.
- SuperAdmin sees tenant metadata and privacy-safe project diagnostics, never private project content.
- SuperAdmin may activate, freeze, block, and reactivate accounts.
- Freezing or blocking a tenant disables staff access and all customer-facing links immediately.
- Restrictions preserve tenant data.
- Every privileged operation is audited.
- Email/SMS delivery failure never prevents an account restriction.
- Notification delivery uses a durable, provider-neutral outbox.
- SuperAdmin may create users, soft-delete/restore users, reset passwords, and initiate opaque encrypted tenant transfers.
- SuperAdmin manages the global product/profile/colour Library and its taxonomy and relationships.
- Global catalog plus tenant-private catalogs and tenant overrides are supported.
- Capture/Scanner submissions are tenant-private and usable while pending review.
- Authorization uses named capabilities so future roles can be added without rewriting endpoints.

## Authorization and Bootstrap

The `users` table keeps `role text not null default 'owner'` and accepts only `owner` or `superadmin`. It gains:

- `status text not null default 'active'`: `active`, `frozen`, or `blocked`
- `status_reason text`
- `status_changed_at timestamptz`
- `status_changed_by uuid references users(id)`
- `last_login_at timestamptz`

On successful login and `GET /api/auth/me`, the server normalizes the account email and the `SUPERADMIN_EMAILS` entries by trimming whitespace and lowercasing. A match promotes the account to `superadmin`. Removing an email from the environment does not silently demote the database role. Demotion requires an explicit audited SuperAdmin action or direct database operation.

Existing `developer` rows have no elevated privileges after migration unless the account email is bootstrapped as SuperAdmin.

Central guards:

- `requireActiveUser(req, res)`: authenticated, active account
- `requireSuperAdmin(req, res)`: authenticated, active SuperAdmin
- `requireActiveTenantForPublicProject(projectId, res)`: owner account is active
- privacy-safe projection helpers for every SuperAdmin response

All authorization is server-side. Hiding console navigation is presentation only.

## Privacy Boundary

The SuperAdmin console may show:

- Tenant/user ID
- Company or business name
- Account email and phone used for account communication
- Account role and status
- Creation time and last login
- Project count
- Attachment/storage totals
- Enabled skin and platform configuration metadata
- Project ID
- Job number as technical operational metadata
- Project creation/update timestamps
- Approval state
- Import format and parser version
- Layer, roof, wall, slope, and facet counts
- Validation/error state

It must not return:

- Customer names
- Customer addresses or contact details
- Project design JSON
- Measurements
- Pricing or estimates
- Attachments or attachment URLs
- Generated reports
- Private design content

Dedicated DTO/projection functions construct SuperAdmin responses from explicit allowlists. Routes must never return raw database rows.


## Capability-Based Authorization

Application routes check named capabilities through `requireCapability(req, res, capability)` rather than scattering direct role comparisons. The built-in `superadmin` role receives every initial platform capability. The model leaves room for later roles such as catalog manager, catalog reviewer, catalog publisher, security administrator, or support administrator.

Initial capabilities include:

- `users.create`
- `users.freeze`
- `users.block`
- `users.delete`
- `users.restore`
- `users.password.reset`
- `tenants.transfer.export`
- `tenants.transfer.import`
- `catalog.read`
- `catalog.write`
- `catalog.import`
- `catalog.export`
- `catalog.review`
- `catalog.publish`
- `skins.manage`
- `platform.audit.read`
- `platform.diagnostics.read`

No actor may grant itself capabilities. Role/capability changes require a separately authorized, audited action. Role names remain convenient bundles; capabilities are the enforcement contract.

## User Administration

SuperAdmin can create accounts, freeze/block/reactivate them, soft-delete and restore them, and reset passwords.

Soft deletion:

- Immediately disables authenticated and public access.
- Records deletion actor, reason, and retention deadline.
- Preserves data during a configurable retention period.
- Permits restoration before purge.
- Requires a separately authorized permanent purge workflow after retention.

Password reset:

- Generates or accepts a temporary password.
- Stores only its password hash.
- Revokes all existing sessions.
- Sets `must_change_password = true`.
- Forces password replacement at the next successful login.
- Creates an audit event and notification outbox entries.
- Provides no self-service forgot-password or account-recovery route.

## Opaque Tenant Transfer

SuperAdmin can initiate complete tenant export/import without browsing private contents in the console.

A transfer package includes account/company profile, settings, branding, skin assignment, private catalog and overrides, projects, designs, measurements, attachments, and report metadata. Packages are encrypted, integrity-protected, schema-versioned, and assigned an expiry. Plain customer/project contents are never rendered in SuperAdmin responses or audit records.

Every transfer requires a reason, audit event, support reference, and explicit target confirmation. Import performs validation and a dry run before commit.

## Global and Tenant Library

The Library supports:

- Products
- Profiles
- Colours
- Product, profile, and colour categories
- Manufacturers
- Suppliers
- Collections
- Catalogs
- Compatibility rules
- Swatches, textures, profile geometry, and supporting assets

Products, profiles, and colours each have many-to-many relationships with manufacturers, suppliers, collections, catalogs, and categories. Relationships are independently versioned and manageable.

Every record includes a stable ID, global or tenant-private scope, name/code/description, lifecycle status, version, actor/timestamps, import source, external reference, extensible metadata, and asset references.

Global records are SuperAdmin-controlled. Tenant-private records remain isolated. A tenant may deactivate any inherited global product, profile, colour, manufacturer, supplier, collection, catalog, or category in its own Library without changing or deleting the global record. Tenant overrides are stored separately from the shared source.

SuperAdmin can add, modify, soft-delete, restore, import, and export global catalog records. Initial transfer formats are lossless versioned JSON and CSV for simple bulk editing. Asset ZIP packages are a later catalog slice.

Imports require schema validation, dry-run preview, conflict reporting, and explicit confirmation. Destructive conflict resolution is never implicit.

## Capture/Scanner Contribution Workflow

IronWrap Capture/Scanner creates tenant-private Library records with `pending_review` status. The submitting tenant may use them immediately in its private Library, clearly marked Pending Review.

An authorized SuperAdmin or company representative with the appropriate capability may:

- Approve for global publication
- Reject with a reason
- Request revisions
- Merge into an existing global record

Approval and publication are separate capabilities. Publication preserves contributor attribution, source lineage, review history, and version history.

The data model records contribution attribution and approved contributions for a future configurable incentive program. No points, monetary credits, badges, or other reward values are activated in this sprint.


## Account States

### Active

Normal authenticated and public-link behavior.

### Frozen

A reversible operational restriction. Staff authentication and authenticated API access are rejected. Public project links, design links, approvals, and customer-facing exports return a neutral unavailable response. Data remains preserved.

### Blocked

A stronger security restriction with the same access denial. It requires an explicit unblock/reactivation action. Data remains preserved.

Every freeze, block, or activation request requires a non-empty reason. A SuperAdmin cannot freeze or block their own account through the console.

## Restriction Transaction

A restriction request executes in one database transaction:

1. Lock the target user row.
2. Recheck actor role/status and target state.
3. Reject invalid transitions and self-restriction.
4. Update target status, reason, timestamp, and actor.
5. Create an audit event.
6. Enqueue email and SMS notifications.
7. Commit.
8. Trigger best-effort notification processing.

The access restriction is effective immediately after commit. Notification delivery failure cannot roll it back.

## Notifications

The first sprint implements:

- Durable `notification_outbox`
- Email and SMS channel records
- Provider-neutral adapter interfaces
- In-app restriction/status notice
- Retry count, next-attempt timestamp, last error, sent timestamp, and delivery state
- Manual retry through the SuperAdmin console

Restriction messages include:

- Account frozen/blocked state
- SuperAdmin-provided reason
- Restriction timestamp
- Contact-SuperAdmin instruction
- Support reference ID

Provider credentials and provider-specific network adapters can be configured without changing account restriction logic. Unconfigured adapters retain pending notification records and report configuration status.

## Audit Log

`superadmin_audit_events` records:

- Event ID and timestamp
- Actor SuperAdmin ID
- Action
- Target type and target ID
- Mandatory reason for state changes
- Before/after metadata limited to non-private fields
- Request correlation ID
- Technical result
- Notification support reference ID when applicable

Audit events are append-only through application APIs.

## Platform Console

A `Platform` navigation item renders only for `role === 'superadmin'`.

Initial sections:

1. **Summary:** active/frozen/blocked account counts, project totals, notification failures, and recent platform errors.
2. **Tenants:** privacy-safe directory with status, usage totals, skin, creation, and last-login metadata.
3. **Tenant Detail:** account configuration metadata and privacy-safe project diagnostics.
4. **Account Controls:** activate, freeze, block, and reactivate with mandatory reason.
5. **Skins:** package inventory, validation state, tenant assignment, and active version.
6. **Audit:** actor, action, target, reason, time, and result.
7. **Notifications:** pending, sent, failed, retry state, and manual retry.
8. **Diagnostics:** schema/deployment/integration health with secrets redacted.

There is no client impersonation or tenant-context switch.

## API Surface

Initial routes:

Account administration:

- `POST /api/superadmin/users`
- `POST /api/superadmin/users/:id/password-reset`
- `POST /api/superadmin/users/:id/delete`
- `POST /api/superadmin/users/:id/restore`
- `POST /api/superadmin/tenants/:id/export`
- `POST /api/superadmin/tenants/import`

Platform and restriction routes:

- `GET /api/superadmin/summary`
- `GET /api/superadmin/tenants`
- `GET /api/superadmin/tenants/:id`
- `POST /api/superadmin/tenants/:id/freeze`
- `POST /api/superadmin/tenants/:id/block`
- `POST /api/superadmin/tenants/:id/activate`
- `GET /api/superadmin/audit`
- `GET /api/superadmin/notifications`
- `POST /api/superadmin/notifications/:id/retry`

Skin inventory and assignment endpoints use the same guard and audit boundary. Skin ZIP validation/import is a subsequent implementation slice after the console authorization foundation.

## Legacy Developer Migration

Remove privilege from:

- `isDeveloper`
- `resolveOwnerId`
- `canActOnOwner`
- `?asOwner=` handling
- Cross-tenant resource mutation bypasses

Normal owner requests continue to operate only on their own rows. Documentation describing legacy developer cross-tenant access is replaced with the SuperAdmin privacy model.

## Error Handling

- `401`: missing or invalid authentication
- `403`: authenticated but not SuperAdmin, inactive account, self-restriction, or forbidden transition
- `404`: unknown target without leaking cross-tenant details
- `409`: stale or conflicting account-state transition
- `422`: missing/invalid reason or request data
- `503`: required platform dependency unavailable

Public links for restricted tenants receive a neutral unavailable response without exposing whether the tenant is frozen or blocked.

## Testing

Tests must prove:

- Case-insensitive, whitespace-tolerant `SUPERADMIN_EMAILS` bootstrap
- Allowlisted account promotion
- No silent demotion when the allowlist changes
- Legacy `developer` has no elevated access
- Owner rejection from every SuperAdmin endpoint
- Inactive SuperAdmin rejection
- Raw rows/private fields never appear in SuperAdmin DTOs
- Valid and invalid state transitions
- Mandatory reasons
- Self-restriction rejection
- Existing-session denial after restriction
- Public project/design/approval denial for restricted tenants
- Transactional audit and outbox creation
- Notification failure does not undo restriction
- Retry state and manual retry
- Secret redaction in diagnostics

Regression verification covers login, signup, generic XML import, 3D model generation, dynamic skins/profiles, roof/wall/slope/facet recognition, measurements, persistence, refresh restoration, sharing, approval, HTML export, and IronWrap-generated PDF reports.

## Delivery Order

1. Schema additions and migration constraints.
2. Bootstrap and authorization guards.
3. Remove legacy developer cross-tenant access.
4. Account-state enforcement on authenticated and public routes.
5. Audit log and notification outbox.
6. Privacy-safe SuperAdmin APIs.
7. SuperAdmin console.
8. User creation, soft deletion/restoration, and temporary-password reset.
9. Capability-based authorization foundation for future roles.
10. Global/tenant Library schema and relationship model.
11. JSON/CSV catalog import/export with dry-run validation.
12. Opaque encrypted tenant transfer jobs.
13. Capture/Scanner review and publication workflow foundation.
14. Regression verification and Vercel Preview.
15. Skin package import/validation as the next isolated slice.
16. Semantic design system and red-direction UI as the following subproject.

## Definition of Done

- No API path permits tenant impersonation or unrestricted cross-tenant content access.
- SuperAdmin bootstrap, capability enforcement, and dedicated APIs work server-side.
- SuperAdmin can create, soft-delete/restore, and reset users without self-service recovery.
- Complete tenant transfer is encrypted and opaque to the console.
- Global and tenant-private Library records support many-to-many manufacturer, supplier, collection, catalog, and category relationships.
- Tenants can deactivate inherited Library records without mutating the global source.
- Capture/Scanner submissions remain tenant-private while pending and retain attribution through review/publication.
- Freeze/block immediately disables authenticated and public access.
- Owner notifications are durably queued for email and SMS and shown in-app.
- Audit records are complete and privacy-safe.
- Existing generic XML, 3D, measurement, project, sharing, and PDF behavior passes regression verification.
- CI and production builds pass.
- A Vercel Preview is reviewed before merge.
