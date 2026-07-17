# SuperAdmin Operations

SuperAdmin is IronWrap's platform-operations role. It is capability-checked on the server and is intentionally separate from contractor workspaces. It cannot enter another tenant, read customer content, or retrieve project designs, measurements, pricing, attachments, reports, customer names, or addresses.

## Bootstrap and role changes

Set `SUPERADMIN_EMAILS` to a comma-separated list of normalized account emails in Vercel and local development. On that account's next login or `/api/auth/me` request, the server promotes it to the persistent `superadmin` role. Never put this value or any password in source control.

Removing an email from `SUPERADMIN_EMAILS` does not silently demote an existing SuperAdmin. Demotion is an explicit database operation and should be recorded as a reviewed operational change. Keep at least two independently controlled SuperAdmin accounts.

Capabilities are defined in `api/_lib/superadminPolicy.js`. Add or remove powers there and gate every corresponding server operation with `requireCapability`; hiding a UI control is not authorization.

## Privacy boundary

The Platform Console may show account identity/contact metadata, account state, timestamps, project counts, job numbers, technical layer/facet counts, audit events, and notification delivery state. It must never select or return customer names, property addresses, design JSON, geometry, measurements, pricing, attachments, exported HTML, or PDF reports.

SuperAdmin does not impersonate users and does not switch into a tenant workspace. Support requiring customer content must be performed by the contractor in their own account.

## Account operations

- Create user: creates an owner account with a temporary password and `must_change_password=true`.
- Reset password: replaces the password with a temporary password, revokes existing sessions, and forces password change. There is no self-service recovery.
- Freeze: immediate reversible restriction, including authenticated sessions and public project links.
- Block: immediate stronger reversible restriction, including authenticated sessions and public project links.
- Delete: soft-deletes the account, revokes sessions, preserves tenant data, and schedules a 90-day purge marker. It does not cascade-delete data.
- Activate/restore: returns an eligible restricted account to active state.

Every privileged mutation requires a reason and writes an append-only audit event with a support reference. A SuperAdmin cannot restrict their own account.

## Notifications

Restriction operations enqueue in-app, email, and SMS notices in `notification_outbox`; password resets enqueue the available direct-contact channels. The restriction commits even if a provider is unavailable. Delivery workers are provider-neutral: configure provider adapters outside the policy layer, mark successful rows `sent`, retain errors for review, and retry from the Platform Console with a new audited reason.

Messages include the state, reason, instruction to contact SuperAdmin promptly, and support reference. Do not include passwords in notification payloads or logs; temporary passwords must be communicated through an approved secure channel.

## Verification and rollback

Before release, run `npm test`, `npm run build`, and `SMOKE_BASE_URL=<preview> npm run smoke`. Verify a SuperAdmin sees Platform navigation, an owner does not, a temporary-password account cannot enter the app before changing its password, and frozen/blocked public links return a neutral unavailable response.

To roll back application code, redeploy the previous known-good Vercel deployment. Schema changes are additive and should not be destructively reversed. To restore access after an erroneous restriction, activate the account from a second SuperAdmin account and record the reason. If all SuperAdmins are inaccessible, use controlled database access to restore one account to `role='superadmin'`, `status='active'`, clear deletion markers, and increment `session_version`.
