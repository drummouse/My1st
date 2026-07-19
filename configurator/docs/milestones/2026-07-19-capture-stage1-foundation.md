# Capture Stage 1 — Domain Foundation Verification

Date: 2026-07-19
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (PR #19 → `claude/development`)
Commit verified: `99d24ea`

## Scope delivered

An authorized contributor can create, edit, resume, and archive draft
capture sessions. Capability-guarded consolidated `/api/capture` function,
tenant-scoped service, full state-machine policy module, additive schema
(`capture_sessions`, `capture_assets`, `capture_fields`,
`capture_review_comments`), capability additions (`capture.create`,
`capture.review`, `capture.publish.tenant` for owner/superadmin), and a
mobile-first Capture nav panel. Zero new dependencies. No camera, uploads,
submission, or review UI yet (Stages 2–4).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 95/95 pass (69 existing + 26 new Capture tests) |
| `npm run build` | Succeeds (main, artifact, snapshot template) |
| `npm run smoke` against the live PR preview (`ironwrap-estimator-git-claude-ironwr-41229d…vercel.app`, deployment `AiBC4BoMLne7DuZGofo1sTAQj5fd`, READY) | 14/14 pass — app shell, `/api/health` + Neon, all pre-existing auth guards, and the two new unauthenticated Capture guards (GET and POST `/api/capture/sessions` → 401) |
| Additive DDL | Applied by `ensureSchema()` to the isolated Neon preview branch on first request (`database health` returned `reachable` post-deploy); production untouched |

## Acceptance criteria status

1. Unauthenticated Capture API rejected — verified live in smoke (401 read and write).
2. Cross-tenant access reads as not-found — `captureService.test.mjs`.
3. Idempotent create by `(owner, client_ref)` — unit-tested; DB race backstopped by partial unique index.
4. Draft update persists content/fields; create and archive audited — unit-tested.
5. Invalid transitions rejected with typed codes — exhaustive matrix in `capturePolicy.test.mjs`.
6. Capture tab renders for capability-holding users; drafts resume across sessions — implemented; interactive end-to-end run on the preview requires a logged-in account (manual step for the account owner).
7. Existing shell, health, Neon, and auth-guard smoke checks unchanged and passing.

## Honest gaps

- Criterion 6's interactive path (login → create draft → reopen → resume on
  the preview) is code-complete and API-verified but has not been exercised
  by a human in a browser; recommended as the PR review step.
- `capture_assets` / `capture_review_comments` exist in schema but have no
  writers until Stages 2 and 4 — intentional (decision D-014).
