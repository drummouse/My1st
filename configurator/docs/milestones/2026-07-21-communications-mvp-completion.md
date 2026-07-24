# Communications MVP Completion

Date: 2026-07-21
Branch: `claude/communications-mvp-completion` (PR #28 → `claude/development`)
Starting SHA: `8d3d284c6913dd4407035b0655503471d4a44cb4`
Final head SHA: `7d18dabcd58a9987207451b2ee65e1b9f46ffcd7`
Related: decision log D-064–D-069, `docs/COMMUNICATIONS_RUNBOOK.md`.

## Scope delivered

1. Secure external-scheduler contract for `POST /api/comms/drain`
   (`x-comms-scheduler-secret` header, checked before any DB/provider
   work; atomic `FOR UPDATE SKIP LOCKED` claiming; bounded batch/time).
2. Root-caused and fixed the 2026-07-17 placeholder-phone incident
   (`api/auth/[action].js` accepted any non-empty phone at signup) —
   validated at signup/profile, every enqueue path, and again before
   provider dispatch.
3. Permanent-vs-transient error classification, so a permanent/validation
   failure terminates in one attempt instead of retrying forever.
4. Extended SuperAdmin operational visibility (status filter,
   provider/errorCategory/claimedAt fields) with zero recipient exposure.
5. `docs/COMMUNICATIONS_RUNBOOK.md` — full operational reference.
6. Exact (owner-actioned) Twilio Usage Trigger / SendGrid Alert setup
   instructions — no app-side config, no code change from these.

## Automated verification

| Check | Result |
| --- | --- |
| `npm ci` | Clean install |
| `npm test` | 289/289 (251 baseline + 38 new) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |

## Live verification (against the redeployed Preview, commit `7d18dab`)

| Check | Result |
| --- | --- |
| Deployment | `ironwrap-estimator-git-claude-commun-e3c82d-drummouses-projects.vercel.app`, READY |
| `npm run smoke` | 32/32, including 3 new scheduler-specific checks |
| Manual drain, no session | 401 |
| Scheduler drain, wrong secret | 401 (rejected before DB/provider work) |
| Scheduler drain, GET method | 405 (rejected before secret is even checked) |
| Dedicated Preview Neon branch | Confirmed provisioned: `preview/claude/communications-mvp-completion` = `br-icy-rain-adir3m53` |
| Preview vs. `main` row counts (users/projects/notifications) | Identical (5/7/12) both before and after — this PR's live checks wrote nothing to either branch |
| Test markers on `main` | None (`job_number`/`customer_name ilike '%test%'` → 0 rows) |
| Real SMS/email sent during this verification | **None** — the correct scheduler secret was never available to this session by design; the concurrency/claim/classification logic is verified by unit tests with injected/mocked providers instead (`commsDelivery.test.mjs`, `commsScheduler.test.mjs`) |

## Incidental infrastructure issue found and fixed

The first deployment attempt for this PR failed instantly with Vercel's
`BUILD_FAILED` / "Resource provisioning failed" (near-zero build time, no
build log lines) — not a code issue. Root cause: the Neon free-tier
project (`sparkling-dawn-12192874`) had hit its 10-branch cap (6 stale
preview branches from already-merged, closed PRs #19–24, #25, #26, #27),
so the Vercel↔Neon integration couldn't provision an 11th branch for this
PR. Fixed, with the owner's explicit approval, by deleting those 6 stale
branches (all from merged PRs, code fully preserved in
`claude/development`) — confirmed via the GPT-lab project (a separate
Neon project, not at its cap) deploying the identical commit successfully
the whole time, isolating this as project-specific rather than a real code
defect. A fresh empty-commit redeploy then succeeded cleanly.

## Historical rows preserved

Confirmed via direct query: the rows from 2026-07-17 remain `status =
'failed'`, untouched, unmodified, not retried, still visible via
`GET /api/superadmin?action=notifications&status=failed`. Recorded as 3 at
the time this doc was written; the correct, final count is **4** — see
decision log D-070 (a follow-up correction, `claude/communications-mvp-hardening`).

## Confirmations

- No Codex/GPT resource accessed or modified (the Neon branch cleanup was
  entirely within the Claude-lane project `sparkling-dawn-12192874`;
  `ironwrap-configurator-gpt-lab`/`wild-star-54366117` were never touched).
- `main` (git) and Neon production `main` (database) both unchanged
  throughout.
- PR #28 remains draft and unmerged, awaiting independent review.
