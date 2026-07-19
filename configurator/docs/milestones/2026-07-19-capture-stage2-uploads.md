# Capture Stage 2 — Secure Image Capture and Upload Verification

Date: 2026-07-19
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (PR #19 → `claude/development`)
Commit verified: `0327dec`

## Scope delivered

A contributor can take (guided camera, rear-camera preference) or pick
(gallery fallback) main/surface/label photos for a draft capture; originals
upload directly to Vercel Blob via session-validated signed tokens, are
finalized as `capture_assets` rows (URL + checksum + MIME + size +
dimensions + metadata — never bytes), get an on-device thumbnail stored as
a derived asset, and can be retaken/deleted before submit. Uploads run
through a serial retry queue with explicit sync states and manual retry.
Zero new dependencies.

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 110/110 pass (15 new Stage 2 tests) |
| `npm run build` | Succeeds |
| `npm run smoke` against the live PR preview (deployment `E6fnBiBwnAsv8ZvFiLKsQDdaNQsJ`, READY) | 15/15 pass, including the new unauthenticated asset-finalize guard |

## Exit-gate status

1. **Originals preserved** — derived assets must reference a source and a
   source can never reference another source (policy-enforced + tested);
   retake creates a new original rather than overwriting.
2. **No image bytes/Base64 in Neon** — finalize accepts only `https`
   `*.blob.vercel-storage.com` URLs plus metadata; schema test asserts no
   `bytea`.
3. **Interrupted upload and retry tested** — queue unit tests cover
   auto-retry with backoff, exactly-once completion, failure isolation, and
   manual retry after exhaustion.
4. **Unauthorized access** — upload tokens are only issued for an editable
   session owned by the requester (contract-tested ordering); finalize/
   delete are capability-guarded and tenant-scoped; the unauthenticated
   guard is in the live smoke suite. Read exposure is Blob
   public-but-unguessable URLs, matching the platform's existing
   attachments posture — recorded as decision D-016 and flagged for the
   Stage 12 hardening review, not silently ignored.

## Honest gaps

- Queue state does not survive a full page reload (in-memory by design,
  D-019); IndexedDB persistence is Stage 6 as planned.
- Camera/upload flow needs a human walkthrough on a real phone against the
  preview (login required) — recommended PR review step. HEIC originals on
  browsers that cannot decode them upload fine but show no client-side
  dimensions/thumbnail (dimension read degrades to null).
