# Communications — Live Twilio/SendGrid Delivery Verification

Date: 2026-07-21
Branch: `claude/comms-live-verification` (docs only, no code change)
Related: PR #24 (`Add multi-tenant client communications`), decision log D-040–D-045, D-064–D-065.

## Why this exists

PR #24 shipped the full comms pipeline (`sender_identities`, widened
`notification_outbox`, `/api/comms` identity + drain worker, the
`design.approved` trigger) but `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/
`PLATFORM_DEFAULT_PHONE`/`SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL` were all
unset at merge time, so every send attempt threw `"...not configured"` and
rows stayed `pending`/`failed` harmlessly. The owner has since added real
values for all five (Vercel project, All Environments scope). This doc
records the live verification that the pipeline actually sends through
those credentials, not just that the env vars are present.

## Method

Against the `claude/development` preview
(`ironwrap-estimator-git-claude-development-drummouses-projects.vercel.app`,
whose latest deployment — the PR #25 merge — postdates the env var
additions), using the existing `info@iroofalberta.ca` superadmin account:

1. `PUT /api/comms?action=identity` — set `notifyMode: 'platform'`,
   `displayName`, `contactEmail`.
2. `POST /api/projects` — created a throwaway project with
   `customerEmail`/`customerPhone` set to a real test destination.
3. `POST /api/projects/:id/approve` (public route) — triggered the
   `design.approved` notice, queuing one `email` and one `sms` row in
   `notification_outbox`.
4. `POST /api/comms?action=drain` (superadmin) — twice, since the first
   call's `limit=10` only reached older stale rows ahead of these two in
   the FIFO (`order by created_at asc`) queue; the second call with a
   larger limit reached them.
5. Queried `notification_outbox` directly (Neon, `preview/claude/development`
   branch) to confirm final row state rather than trusting the drain
   response's aggregate counts alone.
6. Cleaned up: deleted the test project and its two outbox rows; reverted
   the test tenant's `notify_mode` back to `'self'`.

## Result

| Check | Result |
| --- | --- |
| SMS row (`to_phone`, real number) | `status: 'sent'`, `sent_at` set, `last_error: null` |
| Email row (`to_email`, real address) | `status: 'sent'`, `sent_at` set, `last_error: null` |
| Test data cleanup | Project + both outbox rows deleted; sender identity reverted to `'self'` |

Both channels' provider calls (`sendTwilioSms`, `sendGridEmail` in
`api/_lib/commsDelivery.js`) only mark a row `sent` if the provider's HTTP
response is `ok` — a `status: 'sent'` result is real acceptance by Twilio
and SendGrid, not just a successful outbox insert.

## Honest gaps / notes

- Did not confirm actual inbox/phone delivery (that's outside what an API
  response can prove) — only that Twilio/SendGrid accepted the send
  request, which is the boundary this app's code controls.
- The drain worker is on-demand only (no cron slot available on the Hobby
  plan, per PR #24) — a real deployment needs something (superadmin action,
  or an external scheduler) to call `?action=drain` periodically, or queued
  notices will sit `pending` indefinitely.
- Found, but did not touch: 3 pre-existing `failed` SMS rows from
  2026-07-17 with an invalid placeholder destination number, unrelated to
  this verification (D-065).
