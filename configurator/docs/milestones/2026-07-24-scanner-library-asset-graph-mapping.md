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
| `npm test` | 334/334 pass (331 baseline + 3 new in `captureLibrary.test.mjs`, plus 1 extended assertion in `librarySchema.test.mjs`) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |

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
- **Live functional verification pending** — this is a backend/data-mapping
  change (create → submit → review → approve → publish → inspect the
  actual `library_records`/`library_color_details` rows), not a UI change,
  so verification will be a direct authenticated API + database check
  against the deployed preview rather than a Playwright browser run.
