# Scanner Flexible Tags — Schema + Tag CRUD Verification

Date: 2026-07-20
Branch: `claude/scanner-flexible-tags-3fc5yd` (PR #25 → `claude/development`)
Commit verified: `87093b0`
Authorization: the flexible-tags slice, scoped narrowly to schema + tag CRUD
only (per session task); deferred from Slice R1 by decision D-035. No UI
changes.

## Scope delivered

- `capture_assets.purpose` drops its closed-list CHECK entirely — the
  column is now an app-validated open vocabulary (`capturePolicy.js`'s
  `normalizeAssetInput`: trimmed, lowercased, ≤60 chars, safe charset)
  instead of a fixed set of shot labels.
- `capture_sessions` gains nullable, additive `tags jsonb not null default
  '[]'::jsonb` and `item_type text` (small CHECK-constrained enum) columns,
  writable through the existing `updateDraft` / `PATCH
  /api/capture/sessions/:id` draft-patch path.
- New tenant-scoped `capture_tags` vocabulary table (`owner_id`, `tag`,
  unique per owner+tag) with list/create/delete CRUD: service methods in
  `captureService.js` (row-scoped via the same not-found-not-forbidden
  idiom as sessions/assets/measurements; idempotent creation by
  `(owner_id, tag)`), validation in `capturePolicy.js`, two new
  capability-mapped actions (`tags`, `tag`) inside the existing
  consolidated `/api/capture` function, `vercel.json` rewrites, and
  `captureClient.js` helpers (`listTags`/`createTag`/`removeTag`).
- Schema changes mirrored in both `api/_lib/db.js` (`ensureSchema()`) and
  `db/schema.sql`; parity tests updated accordingly.
- **Zero new dependencies. Zero new function slots — still 11 of 12.**

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 163/163 pass (12 new/updated tests) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |
| `npm run smoke` against the live PR preview (`ironwrap-estimator-git-claude-scanne-ad48c0-drummouses-projects.vercel.app`, READY) | 22/22 pass, including the two new `/api/capture/tags` auth-guard checks (read + write) |
| Vercel deployment checks on the PR (`ironwrap-estimator`, `ironwrap-configurator-gpt-lab`) | Both `success` |
| Additive DDL (`capture_tags`, widened `capture_sessions`/`capture_assets`) | Applied by `ensureSchema()` to the isolated per-branch Neon preview automatically; production untouched |

## Honest gaps

- No platform seed tag set — `capture_tags` is tenant-scoped only in this
  slice (D-056); a shared/global vocabulary is undesigned scope, deferred.
- A session's `tags` array is validated for shape/length/count only; it is
  not checked against the tenant's `capture_tags` vocabulary at write time
  (D-055) — free-text drift is possible until that's revisited.
- No UI: there is no tag editor/picker anywhere in the app yet. This slice
  is data model + API surface only, as authorized.
- `CAPTURE_CATEGORIES`/`EXPOSURE_CATEGORIES` and `validateCompleteness()`'s
  category-conditional logic are untouched, as explicitly out of scope.
