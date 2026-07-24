# Capture Stage 3 — Guided Metadata and Submission Verification

Date: 2026-07-19
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (PR #19 → `claude/development`)
Commit verified: `88fbd67`

## Scope delivered

A contributor completes a structured product capture — name, category,
description, manufacturer/supplier, SKU/barcode, dimensions with units,
coverage/exposure for roofing/siding, an honestly-qualified manual color
sample, and reviewer notes — sees live completeness (errors vs warnings
with a score), and submits or resubmits. Submission freezes an immutable
review snapshot. Zero new dependencies.

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 121/121 pass (11 new Stage 3 tests) |
| `npm run build` | Succeeds (also proves the client bundles the shared validator) |
| `npm run smoke` against the live PR preview (deployment `Gk76HyJVNYk1S47MsfpPCeQJ9QJV`, READY) | 16/16 pass, including the new unauthenticated submit guard |

## Exit-gate status

1. **Required fields vary correctly by category** — coverage/exposure is an
   error only for roofing/siding; identity and dimensions are errors for
   guided captures but warnings for quick captures (which remain visibly
   incomplete). Covered by a per-category test matrix.
2. **Server validation matches client validation** — by construction:
   `validateCompleteness` is one pure function in `capturePolicy.js`,
   imported by both the submit endpoint and `CapturePanel.jsx` (import
   pinned by a contract test). D-021.
3. **Submission creates an immutable review snapshot and audit event** —
   `submitted_snapshot` captures session, fields, assets, completeness,
   actor, and timestamp; the audit event carries the score and the
   resubmission flag; an incomplete submit writes nothing. The generic
   PATCH route can no longer reach `submitted` (D-022).

## Honest gaps

- The changes-requested banner shows status only; the reviewer's actual
  comments render when the review workspace lands (Stage 4).
- The color sample is manual name+hex with a permanent accuracy disclaimer;
  region sampling from a photo is Stage 8 as planned.
- Interactive browser walkthrough (fill form → watch completeness → submit)
  still pending as the human review step, same as prior stages.
