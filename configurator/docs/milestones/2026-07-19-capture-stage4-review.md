# Capture Stage 4 — Review Workspace Verification

Date: 2026-07-19
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (PR #20 → `claude/development`)
Commit verified: `d8b7f9b`

## Scope delivered

A reviewer opens a permission-aware queue (status filter), inspects a
submission with source images beside its metadata (dimensions, exposure,
approximate-color chip, notes), comments for the record, claims it
(Start Review), and decides: Approve, Request Changes (written reason
required), or Reject (written reason required). Contributors see the
comment thread in their own capture view and resubmit via the Stage 3
flow. Zero new dependencies; zero new function slots (11 of 12).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 130/130 pass (9 new Stage 4 tests) |
| `npm run build` | Succeeds |
| `npm run smoke` against the live PR preview (deployment `JD4fMFgWy8oEMze9jUpWPaT9haZb`, READY) | 17/17 pass, including the new unauthenticated review-queue guard |

## Exit-gate status

1. **Contributors cannot perform reviewer actions** — every `review.*`
   action requires the `capture.review` capability via the route's
   `capabilityByAction` map (contract-tested); the state machine re-checks
   capability per transition. In single-seat tenancy the owner legitimately
   holds both roles for its own tenant (D-003); reseller holds neither.
2. **Reviewers cannot access unauthorized organization records** — the
   queue and every action are row-scoped; another tenant's session reads
   as not-found before capabilities are consulted (order verified by test).
3. **All decisions are auditable** — start/approve/request-changes/reject
   are audited transitions with recorded reasons; comments are permanent
   records with author and timestamp.

## Deferred from the roadplan (recorded, not skipped silently)

- Reviewer assignment (D-026): single-seat tenancy has no one to assign;
  revisit with multi-seat accounts.
- Reviewer metadata edits / audit diff (D-027): the request-changes →
  resubmit loop covers correction today; reviewer edits need a proper
  diff design.
- Crop preview and image-purpose correction: zoom is via full-resolution
  originals; crop/annotation tooling belongs with Stages 8–9 imaging work.

## Honest gaps

- Interactive walkthrough (submit as contributor → review → request
  changes → resubmit → approve) pending as the human review step.
- An `approved` capture currently parks — publication to the Library is
  exactly Stage 5's slice.
