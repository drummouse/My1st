# Scanner: Library Asset-Graph Publication Mapping

Date: 2026-07-24
Branch: `claude/scanner-library-mapping` (→ `claude/development`, draft)
Authorization: user picked this over offline-durability parity work, after a
recommendation ("Do the Library mapping").

## Scope delivered

Closes the gap D-074 (Color & Finish) and D-075 (Texture) both explicitly
flagged as deferred: those sessions published as generic `product` records
instead of the reusable `color`/`texture` Library assets the spec's §18
asset-graph model actually wants.

- **Schema**: `library_records.record_type` CHECK widened to add `'texture'`
  (additive, drop-and-re-add for already-deployed tables — same pattern as
  `capture_type`/`asset_purpose`). Mirrored in `libraryPolicy.js`'s
  `RECORD_TYPES` so the generic Library admin API accepts it too, not just
  the capture-publish path.
- **`capturePublish.js`**: `buildLibraryPublication` now branches on
  `session.captureType`:
  - `color_finish` → `recordType: 'color'`, `code`/`library_color_details`
    (`colorCode`, `hex`) populated from the sampled color's
    `manufacturerCode`/`hex`, the full sample object preserved in
    `metadata.captureColor`.
  - `texture` → `recordType: 'texture'`, no dedicated details table (matches
    `category`/`manufacturer`/`supplier`/`collection`/`catalog`, which also
    have none) — `textureDirection`/`materialZoneState`/`studioValidation`
    live in `metadata.captureTexture`.
  - Every other capture type (`guided_product`, `quick`, `profile_geometry`,
    etc.) keeps the exact original `product` mapping, unchanged.
- **`captureService.js`**: `insertLibraryPublication` now inserts into the
  matching details table by `record_type` (color reuses the exact insert
  shape `libraryService.js`'s `queueTypedDetails` already uses for
  manually-created color records — one implementation, not two).
  `findLibraryRecordByReference` reads whichever details table actually has
  a row for that record.
- **A real latent bug found and fixed**: `buildLibraryPublication`'s guard
  clause required `session.category` unconditionally — which would have
  thrown `CAPTURE_PUBLISH_INVALID` for *every* evidence-driven scan type,
  including `profile_geometry` (not just the two new ones), the moment
  anyone tried to publish one, since none of them ever set a category by
  design. The guard is now type-aware via an `EVIDENCE_DRIVEN_TYPES` list
  (`profile_geometry`, `color_finish`, `texture`) that skips the category
  requirement, matching each type's own completeness gate exactly.
- `listPublishedLibraryProducts` (the Studio product list) is untouched —
  still filters `record_type = 'product'` only, correctly excluding
  colors/textures from the Studio product picker (they're reusable
  components, not directly Studio-selectable products).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 336/336 pass (334 + 2 new for the duplicate-code fix) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |
| `npm run smoke` against the deployed preview | 32/32 pass |

## A real bug found and fixed by live verification

The first live-publish attempt for a `color_finish` session hit a genuine,
previously-unreachable failure: `library_record_code_scope_unique` rejected
the insert with a raw `NeonDbError`, surfacing to the client as an opaque
`"Capture operation failed"` 500. Root cause: a manufacturer color code
(e.g. `"RAL 7024"`) is far more likely to collide across two independent
scans than a product SKU ever was — the uniqueness constraint itself is
correct and pre-existing, but nothing translated a violation of it into an
actionable error for the caller. Fixed in `captureService.js`'s
`publishSession`: catches that specific constraint violation (`code
'23505'`, `constraint 'library_record_code_scope_unique'`) and throws a
typed `CaptureValidationError('CAPTURE_PUBLISH_DUPLICATE_CODE', ...)` naming
the colliding code, which the existing route handler already maps to a
clean `400`. Any other database error still propagates unchanged (verified
with a dedicated test).

## Live functional verification (2026-07-24)

Run against the deployed preview
(`ironwrap-estimator-git-claude-scanne-0d1932-drummouses-projects.vercel.app`,
READY) — this is a backend/data-mapping change, so verification drove the
real flow (UI session creation with a genuine Blob-uploaded photo → API
calls for review/approve/publish → direct inspection of the actual
`library_records` row via the superadmin `library.record` action, not a
mock), using the real `info@iroofalberta.ca` superadmin tenant:

| Check | Result |
| --- | --- |
| Create + submit a `color_finish` session (real photo, sampled color, finish, manufacturer name/code) | Submitted |
| Review → approve → publish via the API | All three succeed (200) |
| Inspect the resulting `library_records` row directly | `recordType: 'color'`, `code` = the manufacturer code, `metadata.captureColor` fully populated (hex/rgb/lab/finish/manufacturerName/confidenceGrade) |
| Create + submit a `texture` session (real photo, calibration, material zone, texture direction) | Submitted |
| Review → approve → publish via the API | All three succeed (200) |
| Inspect the resulting `library_records` row directly | `recordType: 'texture'`, `code: null`, `metadata.captureTexture` fully populated (`textureDirection: 'along_run'`, confirmed material zone) |
| Both records excluded from `GET /api/library/products` (the Studio product list) | Confirmed — 0 matches, as designed |
| Publish a second `color_finish` session reusing the first's manufacturer code | Fails cleanly with `400 CAPTURE_PUBLISH_DUPLICATE_CODE` and the exact colliding code named in the message — not a raw 500 |

All checks passed. Test data (3 published Library records, their capture
sessions and Blob assets) was left on this PR's isolated Neon preview
branch — harmless, tenant-scoped, and never touching production; consistent
with this session's established data-isolation practice.

## Honest gaps

- **No `library_texture_details` table** — every texture-specific field
  lives in `metadata.captureTexture` for now, consistent with several other
  record types that also have no dedicated details table. A details table
  can be added later, additively, the moment real structured texture
  columns (e.g. physical scale, direction, derivative asset URLs) are
  needed beyond what metadata already holds.
- **Studio pin DTOs (`toStudioProduct`) remain product-shaped** —
  `category`/`manufacturer`/`dimensions`/`coverage` will simply read `null`
  for color/texture records, which is fine since they never appear in the
  Studio product list to begin with (filtered out by `record_type =
  'product'`). If a future slice needs Studio to reference a color/texture
  record directly (e.g. as a material assigned to a product, not a product
  itself), that's a separate DTO/relationship-modeling decision, out of
  scope here.
- No `library_color_details` row inspection — the live verification confirmed
  `library_records.metadata.captureColor` (which carries the same hex/code
  values) rather than querying `library_color_details` directly, since the
  available superadmin `library.record` action reads only `library_records`.
  The real `insertLibraryPublication`'s SQL branching (as opposed to
  `buildLibraryPublication`'s pure output shape, which IS unit-tested) isn't
  directly unit-tested — this repo's convention is to leave real Neon-store
  SQL untested at the unit level and rely on live verification instead,
  same as every other store method in this file. The successful live
  publish (200, correct `recordType`/`code`/`metadata` on read-back) is the
  evidence that path works, not a unit test.
