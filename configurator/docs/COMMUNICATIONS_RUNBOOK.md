# Communications Runbook

Operational reference for the Twilio SMS / SendGrid email pipeline. Covers
the outbox lifecycle, scheduled draining, recipient validation, SuperAdmin
inspection, provider cost alerts, and incident response. See decision log
D-040–D-045 (original design), D-062–D-065 (Twilio/SendGrid live
verification), D-066–D-069 (the MVP-completion slice), and D-070–D-072
(hardening: historical-row-count correction, 429/408 classification,
provider timeout, auth-before-schema ordering) for the full rationale
trail.

## Architecture

One shared platform Twilio number and one shared SendGrid sender serve
every tenant — there is no per-tenant phone number or sending domain. Only
the message signature (and, for email, the Reply-To) vary by tenant,
resolved by `api/_lib/commsIdentity.js`'s reseller→owner brand cascade. A
tenant who wants a genuinely distinct sender uses `notify_mode: 'self'`
(their own CRM/automation via `settings.notification_webhook_url`) instead
of the platform-sent path.

Two kinds of notices ride the same `notification_outbox` table:
- **Account notices** — password reset, account frozen/blocked/restored.
  Always sent under the platform's own (or the recipient's reseller's)
  brand. Enqueued by `api/superadmin/index.js`.
- **Business notices** — a tenant's own client-facing notice (currently
  just `design.approved`). Only enqueued when the tenant has opted into
  `notify_mode: 'platform'` (`PUT /api/comms?action=identity`). Enqueued by
  `api/projects/index.js`'s approve route.

## How messages enter the outbox

Every enqueue path validates the recipient (see "Recipient validation"
below) before inserting a row — an invalid destination is simply not
queued, it never reaches `notification_outbox` at all. Enqueuing one
channel never blocks the other: an invalid phone doesn't stop a valid
email from being queued, and vice versa.

## Outbox lifecycle

```
pending ──(claimed by drain)──► processing ──(delivered)──► sent
   ▲                                 │
   │                       (transient failure, retry < 5)
   └─────────────────────────────────┘
                                      │
                       (validation / permanent / max attempts)
                                      ▼
                             permanently_failed
```

| Status | Meaning |
| --- | --- |
| `pending` | Queued, eligible for the next drain (or held indefinitely if `not_configured` — see below). |
| `processing` | Claimed by an in-flight drain invocation. Self-heals: if the invocation crashes/times out, the claim's lease (`next_attempt_at`) expires after 120s and the row becomes eligible again automatically. |
| `sent` | Delivered — the provider accepted the request. Terminal. |
| `permanently_failed` | Won't be retried automatically. Terminal. |
| `failed` | **Legacy only.** Frozen status from before this scheduler existed (pre-2026-07-21 rows). New code never writes this status and the drain query never selects it — see "Historical failed rows" below. |

`error_category` on a row explains *why* it's in its current state:
- `validation` — the recipient failed our own format check; never reached the provider.
- `not_configured` — the platform's Twilio/SendGrid credentials are missing; not a per-message problem, held with no backoff.
- `permanent` — the provider itself rejected the request (bad number, unverified trial recipient, blocked sender, etc.); retrying the same input can't succeed.
- `transient` — network error, a provider request that hit its own deadline (see "Provider timeout" below), a provider 5xx, or a 429 (rate limited) / 408 (request timeout) response — 429/408 are the one exception to the "4xx = permanent" rule (D-071), since the identical request can succeed once the rate window clears or the network hiccup passes. Retried with backoff (1m, 5m, 15m, 1h, 6h) up to 5 attempts, then `permanently_failed` as `max_attempts_exceeded`.

### Provider timeout

Every Twilio/SendGrid request carries an `AbortController` deadline — at
most `PROVIDER_TIMEOUT_MS` (5s), and further capped at whatever's actually
left of the drain invocation's own 7s time budget for that row
(`providerTimeoutFor`, `api/_lib/commsScheduler.js`). A row with less than
`MIN_ROW_BUDGET_MS` (500ms) of budget remaining is released back to
`pending` without being attempted at all, rather than risk starting a
request with no realistic chance of a response in time. A timed-out
request classifies `transient` and retries with the normal backoff — it is
not treated as a recipient-side failure.

The deadline covers the *entire* request — including reading the response
body, not just waiting for headers (D-072). `fetch()` resolves as soon as
headers arrive; a naive timer cleared at that point would leave a hung
`.json()`/`.text()` call completely unguarded. `withProviderDeadline`
(`api/_lib/commsDelivery.js`) instead wraps the caller's whole unit of work
— the fetch and whichever body method it needs — under one
`AbortController`, clearing the timer only once that entire task settles.

## External scheduled draining

Vercel's Hobby plan has no native cron capacity for a five-minute interval
(its cron feature is Pro-plan only), so `POST /api/comms/drain` is
triggered externally by **Make.com**, sending an authenticated POST every
5 minutes.

### Scheduler authentication contract

- **Method**: `POST` only. A `GET` (or anything else) is rejected before
  any other work.
- **Header**: `x-comms-scheduler-secret: <COMMS_SCHEDULER_SECRET>`.
- **Order of checks**: method → secret → (only then) database/provider
  work. A request with a missing/wrong secret costs nothing beyond a
  header comparison — no `ensureSchema()`, no query, no provider call.
- **Comparison**: both sides are SHA-256-hashed before
  `crypto.timingSafeEqual`, so the comparison never leaks the secret's
  length or short-circuits early.
- **A request with no scheduler-secret header at all** falls through
  unchanged to the pre-existing session-cookie + `comms.operate`
  capability path — the manual SuperAdmin "drain now" trigger keeps
  working exactly as before, unauthenticated by the scheduler mechanism.

### Response shape (deliberately migrated from the pre-scheduler `{processed, sent, failed}` — D-067)

```json
{ "claimed": 12, "sent": 9, "retried": 2, "failed": 1, "skipped": 0 }
```

- `claimed` — rows atomically claimed this invocation.
- `sent` — delivered successfully.
- `retried` — transient failures, re-queued with backoff.
- `failed` — became `permanently_failed` this invocation.
- `skipped` — claimed but not attempted because the 7-second time budget
  ran out; released back to `pending` immediately (not left stuck), picked
  up by the next invocation.

### Concurrency and idempotency

Claiming is one atomic SQL statement:

```sql
update notification_outbox
set status = 'processing', claimed_at = now(), next_attempt_at = <lease>
where id in (
  select id from notification_outbox
  where status in ('pending', 'processing') and next_attempt_at <= now()
  order by created_at asc limit <batch>
  for update skip locked
)
returning *
```

`for update skip locked` means a second, concurrent invocation of this
exact query can never select a row this one has already locked — it skips
it and claims the next one instead. Two drain invocations racing (two
Make.com ticks overlapping, or a manual trigger firing mid-scheduled-run)
can never claim, and therefore never deliver, the same row twice. This is
the row-claim-as-idempotency-unit pattern already used elsewhere in this
codebase (`client_ref` for capture sessions, `(owner_id, tag)` for tags) —
no provider-level idempotency key was added or is needed, since a row can
only ever be attempted by one invocation at a time.

### Batch size and time budget

- Default batch: 25 rows. Caller-requestable, capped at 50
  (`clampBatchLimit`).
- Time budget: 7 seconds (Vercel Hobby functions cap at 10s; this leaves
  headroom to write back any claimed-but-unprocessed rows before the
  function itself would be killed).

## Recipient validation (D-066)

**Root cause traced**: the 2026-07-17 failed SMS rows (`users.phone =
"58777502024"`) trace to `api/auth/[action].js`'s signup handler, which
only checked `phone` was non-empty — no format validation at all. That
value flowed unchanged into `buildRestrictionNotifications` (account
notices) and was used verbatim as an SMS destination, which Twilio
correctly rejected (error 21211) every time, forever, since nothing ever
stopped it from being retried.

**Fix** — `api/_lib/commsValidation.js`, a pure module:
- `normalizePhoneE164(raw)` — Canadian/US only (NANP), returns `+1XXXXXXXXXX`
  or `null`. Never guesses or substitutes a default.
- `normalizeEmail(raw)` — conservative format check, not full RFC 5322.
- `maskPhone`/`maskEmail` — for logs/API responses.
- `redactRecipientFromText` — strips phone/email fragments out of raw
  provider error text before it's stored (providers sometimes echo the
  submitted destination back in error messages).

**Enforced twice** (defense in depth):
1. **Earliest trustworthy boundary** — signup and profile update
   (`api/auth/[action].js`) reject an unparseable phone with a 400 before
   the account is created/updated.
2. **Before enqueue** — `buildRestrictionNotifications`,
   `buildDesignApprovedNotifications`, and the password-reset
   `notificationQueries` helper each validate/normalize independently per
   channel; an invalid channel is simply not queued (returned in a
   `skipped` array), the other channel is queued regardless.
3. **Before provider dispatch** (a third, defense-in-depth layer) —
   `commsDelivery.js`'s `sendTwilioSms`/`sendGridEmail` re-validate the
   destination before making any network call at all. This protects
   against pre-existing bad data already in the table (a SuperAdmin
   manually retrying an old row) without ever contacting Twilio/SendGrid
   for a value that can't be valid.

## Historical failed rows (do not touch)

The 4 rows from 2026-07-17 (`account-restricted` SMS notices to the
invalid `users.phone` above) are preserved exactly as they were —
untouched, not deleted, not modified, not retried by any automated path.
The drain claim query's eligibility (`status in ('pending', 'processing')`)
permanently excludes `'failed'`, which is now a legacy-only status new
code never writes. They remain visible via `GET
/api/superadmin?action=notifications&status=failed`. A SuperAdmin *can*
still deliberately reset one to `pending` via the existing manual retry
action if they choose to — if they do, the pre-provider-dispatch
validation layer above will immediately reclassify it as
`permanently_failed` without ever contacting Twilio, since the underlying
phone number still doesn't validate.

Deleting these rows requires separate, explicit owner approval — not part
of this MVP.

## SuperAdmin inspection

- `GET /api/superadmin?action=notifications` — lists recent rows
  (`?status=pending|processing|sent|permanently_failed|failed` to filter,
  `?limit=`). Never returns a recipient value (email/phone/`payload`) —
  only `id`, `userId`, `channel`, `provider` (derived: `twilio`/`sendgrid`/
  `null`), `template`, `status`, `attemptCount`, `nextAttemptAt`,
  `claimedAt`, `errorCategory`, `lastError` (already redacted of recipient
  text at write time), `sentAt`, `supportReference`, `createdAt`.
- `GET /api/superadmin?action=summary` — `pendingNotifications` (`pending`
  + `processing`) and `permanentlyFailedNotifications` counts, for an
  at-a-glance operational check.
- `POST /api/superadmin?action=notifications&id=<id>` with `{"reason":
  "..."}` — manually retries one row (resets to `pending`, clears
  `last_error`/`error_category`, audited).

### How to tell if the scheduler is running

Check `GET /api/superadmin?action=summary`'s `pendingNotifications` over
time — if it's climbing and never drops, either the scheduler has stopped
firing or the batch/time budget can't keep up with volume. There is no
separate "last scheduler run" timestamp; use Make.com's own scenario
execution history (see below) as the authoritative record of whether it's
actually firing.

### Distinguishing recipient-validation failures from provider failures

Filter `?status=permanently_failed` and read `errorCategory`:
`validation` = our own check rejected the recipient before any provider
call; `permanent` = the provider itself rejected it; `max_attempts_exceeded`
= a transient issue that never cleared within 5 attempts.

### Responding if the scheduler stops

1. Confirm in Make.com: Scenarios → the drain scenario → check the
   execution history for errors or a paused/disabled state.
2. If Make.com looks healthy but calls are failing, check
   `pendingNotifications` growth and try a manual drain (SuperAdmin →
   Notification outbox, or `POST /api/comms?action=drain` with a session
   cookie) to confirm the endpoint itself still works independent of the
   scheduler path.
3. If the manual drain also fails, check Vercel function logs for
   `/api/comms` for the actual error.

### Rotating the scheduler secret

1. Generate a new random secret (e.g. `openssl rand -hex 32`).
2. Update `COMMS_SCHEDULER_SECRET` in Vercel → Project → Settings →
   Environment Variables for the affected environment(s).
3. Update the same value in the Make.com scenario's HTTP module header.
4. Redeploy (or wait for the next deploy) so the new Vercel env var takes
   effect, then confirm the next Make.com run succeeds.
5. Old and new secrets are never valid simultaneously — there's a brief
   window between steps 2 and 3 where scheduled calls will 401 until
   Make.com is updated; expected and harmless (rows just wait one extra
   cycle).

## Provider cost/usage alerts

Configuring these requires the owner's own Twilio Console / SendGrid
dashboard login — not something reachable via the app's send-only API
credentials. Exact steps:

**Twilio** — Console → **Billing and Usage** → **Usage and Spend** →
**Usage Triggers** tab → **Create Usage Trigger**. Set a usage-value
threshold (suggested initial value for low-volume Preview testing: **$5**,
well above one test message's cost but far below anything indicating a
runaway loop) and choose **Email** as the notification method, addressed
to the owner's own account email. Adjust the threshold later from the same
Usage Triggers tab — existing triggers are editable, not just
delete-and-recreate.

**SendGrid** — Dashboard → **Settings** → **Alerts** → **Create New
Alert** → **Usage Alert** type → set the percentage-of-plan-credits
threshold (suggested initial value: **50%**, early enough to react before
hitting a sending cap) → enter the recipient email. Adjust later from the
same Alerts page — existing alerts are editable.

Neither of these is app configuration — no code, env var, or messaging
behavior changes as a result. This app-side PR does not touch either
provider's dashboard.

## Incident response

- **A wave of failures with the same `errorCategory: 'permanent'` or
  `'validation'`** — likely a systemic recipient-data problem (a bad import,
  a broken form field) rather than isolated bad input; check
  `GET ?action=notifications&status=permanently_failed` for a pattern.
- **A wave of `'transient'` failures** — check the relevant provider's own
  status page before assuming an app-side bug.
- **`not_configured` rows piling up** — the platform's own
  `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`PLATFORM_DEFAULT_PHONE` or
  `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` env vars are missing on this
  environment; these rows hold indefinitely with no backoff until fixed,
  by design.
- **Suspected credential compromise** — rotate the relevant provider
  credential first (Twilio/SendGrid dashboard), then update the Vercel env
  var; rotate `COMMS_SCHEDULER_SECRET` separately if the scheduler
  endpoint itself is the suspected exposure (see rotation steps above).

## Already-completed live verification

One real SMS (Twilio) and one real email (SendGrid) were sent, received,
and independently confirmed `status: 'sent'` via direct database query
against the `claude/development` preview on 2026-07-21 (decision log
D-064, milestone `2026-07-21-comms-live-verification.md`). **Per the
accepted baseline for this MVP-completion slice, that test is not
repeated here** — this slice verifies the scheduler/validation/
concurrency mechanics through unit tests, a dry-run/auth-check against the
live endpoint, and code review, not another real send.

## Deferred (not blockers to Communications MVP)

- Owner-facing delivery-status UI (SuperAdmin-only visibility for now).
- An in-app cost/usage dashboard (provider dashboards are authoritative).
- Deletion of the 4 historical failed rows (needs separate, explicit owner
  approval).
- Advanced communication analytics (open/click tracking, delivery-rate
  trends, etc.).
- Production scheduling (the Make.com scenario targets the Claude Preview
  environment only during this verification; wiring it against production
  is a separate, explicitly-approved step).
