# Capture/Scanner → Library Core Handoff

**Status note (R2.6, 2026-07-20):** this document originally described an
aspirational submission contract that the shipped implementation did not
end up following exactly. It has been corrected below to match actual
behavior as of Capture Stage 5 (PR #21) and Scanner R2. See
`configurator/docs/CAPTURE_STUDIO_CONTRACT.md` for the authoritative
Studio-facing contract and `configurator/docs/CAPTURE_DECISION_LOG.md`
(D-029–D-032, D-043–D-046) for the decisions behind the actual design.

## Objective

IronWrap Capture submits measured profiles, sampled colors, and captured
products into a tenant-private Library record. It does not publish
directly to the global Library.

## What actually happens today (two distinct steps, not one)

**1. Approve → Publish (existing, unchanged by R2).** Once a capture
session is reviewed and **approved** (Stage 4's review workflow), an
explicit publish action (`POST /api/capture/review/:id/publish`,
capability `capture.publish.tenant`) creates a tenant-private
`library_records` row **directly with `review_status = 'approved'`** —
*not* via a `pending_review` intake queue. This is a deliberate, audited,
create-only, idempotent action (`external_reference = capture:<sessionId>`,
safe to retry, never overwrites an existing record) — see decision D-029 in
the decision log. There is no separate Library-side review step after
Capture's own review approves it.

**2. Material-package dry-run (new in R2.6).** Before submission, a
contributor may call `GET /api/capture/sessions/:id/material-package/dry-run`
(capability `capture.create`) to validate the shape of a *proposed* future
submission — the R2 material-package manifest subset (identity, evidence,
calibration/measurement, deterministic analysis, Claude analysis,
reviewer-reserved, material readiness). This call is **strictly
side-effect-free**: it creates no Library record, changes no session
status, transitions no review status, and publishes nothing. Its
`identity.proposedReviewStatus` field is always the literal string
`pending_review` — describing what a *future* real submission would
target, not something this call writes anywhere. The session's actual
current status (`draft`, `submitted`, `approved`, `published`, …) is
reported separately and is the only authoritative lifecycle value.

So: `pending_review` as a genuine intake state that a human reviewer acts
on does **not** exist in the shipped system — Capture's own multi-step
review (submitted → in_review → approved/changes_requested/rejected) is
that gate, and publication happens straight to `approved` afterward. The
dry-run's use of `pending_review` is deliberately a *label describing
proposed intent*, not a live database state, and must not be read as
resurrecting the older intake-queue design this document used to describe.

## Submission-time fields (what a session's own review/publish flow uses)

- `scope: tenant` with the authenticated tenant ID (enforced in SQL, not just in DTOs).
- `sourceType: capture`.
- `review_status: approved` at the moment of publish (see above — not `pending_review`).
- `qualityLevel`: not currently modeled as a discrete field on the published record.
- `captureConfidence`: available server-side (`evaluateProfileEvidence().confidence`) but not yet written onto the published `library_records` row — R2's dry-run manifest exposes it under `identity.captureConfidence` for inspection.
- Contributor attribution plus non-secret device and session references — carried through `capturePublish.js`'s DTO mapping.
- External Blob (thumbnail today; texture/geometry remain null pending later stages) URLs; binary upload never passes through Library Core.
- Stable source lineage (`external_reference`) retained through republish/retry.

## Review Lifecycle (as implemented)

1. Contributor drafts and submits a capture session (`submitted`).
2. A reviewer claims it (`in_review`), then approves, requests changes, or rejects.
3. On approval, an explicit publish action creates the tenant-private Library record directly (no separate intake queue).
4. Global/cross-tenant publication is a separate, more privileged action outside Capture's scope entirely.
5. Contributor attribution and original capture/session references survive via provenance metadata on the published record.

## R2 Prototype Acceptance (what R1+R2 actually prove)

- Capture one physical profile and produce a measured schematic + confidence result (not a photographic/geometric reconstruction — see D-036, D-046).
- Resume an interrupted capture session without creating duplicate submissions (checksum-based asset idempotency, D-041; session `client_ref` idempotency).
- Validate a proposed submission's shape via the side-effect-free material-package dry-run and receive stable, row-level errors (D-046, this stage).
- Display review status and the eventual review outcome through Capture's own review workflow.
- Never expose another tenant's submissions, device identifiers, or raw private capture data.

Color/finish capture, contributor incentives, and a true `pending_review` intake queue (if ever needed) remain out of scope for R1/R2 and are not implemented.
