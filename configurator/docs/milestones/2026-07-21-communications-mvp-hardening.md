# Communications MVP Hardening

Date: 2026-07-21
Branch: `claude/communications-mvp-hardening` (PR #29 → `claude/development`)
Starting SHA: `81c27b1043643bec78324133a0df3ec997d0d6e2`
Final head SHA: `cefbad032b090a4113203e8ae58b9237f12dad5f`
Related: decision log D-070–D-072, `docs/COMMUNICATIONS_RUNBOOK.md`.

## Scope delivered

1. **429/408 → transient**, not permanent (`classifyProviderStatus`). Every
   other 4xx stays permanent.
2. **Real provider timeout** — `AbortController` deadline on every
   Twilio/SendGrid fetch (`withProviderDeadline`), bounded by the invocation's
   remaining time budget (`providerTimeoutFor`); a row with too little
   budget left is released, unattempted.
3. **Auth-before-schema ordering** — removed the manual (non-scheduler)
   path's premature `ensureSchema()` call; `requireCapability()`'s own
   chain already guarantees it only runs once a valid session exists.
4. **Historical-row-count correction** — D-065/D-068 said "3"; the correct
   count is **4**. Runbook and milestone docs corrected directly; decision
   log entries left as historical record with a new D-070 entry.

## Automated verification

| Check | Result |
| --- | --- |
| `npm ci` | Clean install |
| `npm test` | 303/303 (289 baseline + 14 new) |
| `npm run build` | Succeeds locally — both bundles, no Workbox/Terser failure this run |
| `git diff --check` | Clean |

New regression coverage: 429/408 classification for both providers (7
tests), genuine-4xx-still-permanent, a hung-request timeout test for both
providers (a fetch that never resolves until aborted, proving a real
deadline fires), a 429→retry-backoff-not-permanently_failed check at the
state-decision level, `providerTimeoutFor` bounds, and 5 **handler-level**
tests (not source-text ordering) using Node's
`--experimental-test-module-mocks` to mock `db.js`'s `sql`/`ensureSchema`
and invoke the real exported `handler` directly across both auth paths.

## Live verification

| Check | Result |
| --- | --- |
| PR #29 Claude-lane deployment | `dpl_A1kQkNEhN4hZ71vJninkqYxcCN2M`, `ironwrap-estimator-git-claude-commun-7a4247-drummouses-projects.vercel.app`, READY |
| `npm run smoke` | 32/32 |
| Applying the merged schema to `preview/claude/development` | An authenticated `GET /api/comms/identity` call (session-cookie, no-send, touches no `notification_outbox` row) against the **`claude/development` deployment itself** (not this PR's own throwaway preview) triggered `ensureSchema()` there. First attempt mistakenly hit this PR's own isolated preview branch (`preview/claude/communications-mvp-hardening`) — caught and corrected before drawing any conclusion. |
| `notification_outbox` on `preview/claude/development` has `claimed_at`/`error_category` | Confirmed via `information_schema.columns` |
| Outbox counts before/after | Unchanged: 8 `sent`, 4 `failed`, 0 `pending`, 0 `processing` |
| The 4 historical rows | Unchanged — same 4 IDs (`dae8db6d`/`f50085a7`/`0d057567`/`5de15b18`), all `channel=sms`, `template=account-restricted`, created 2026-07-17T07:09–07:12Z |
| Claude Neon `main` | Unchanged: 5 users, 7 projects, `notification_outbox` still 12 rows all `status='pending'` (never drained against production, by design) |
| Real SMS/email sent | **None** |

Not investigated or touched: `ironwrap-configurator-gpt-lab`'s deployment
for this same commit errored (unrelated Vercel/Neon project, GPT lane) —
explicitly out of scope per this session's lane boundaries.

## Confirmations

- No Codex/GPT resource accessed or modified.
- `main` (git) and Neon production `main` unchanged throughout.
- All 4 historical rows preserved exactly as they were.
- PR #29 remains draft and unmerged.
