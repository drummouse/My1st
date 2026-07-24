# Scanner UX Revision — Impact Assessment and Updated Implementation Plan

Status: Specification update (no implementation started)
Date: 2026-07-20
Source of truth: Google Drive `04 - Scanner & Material Library / Claude_prompt_UX_Design`
(read 2026-07-20; supersedes the Part-1 capture-type/screen assumptions of the
original master prompt). Technical source of truth remains the repository.
Baseline: Capture Stages 0–5 (`claude/development` @ `f5a7a0c` + PR #21 `4b94b9d`).

---

## 1. How the corrected UX changes the previous architecture

### Survives intact (built from repository truth, not assumptions)

| System | Why it survives |
| --- | --- |
| State machine (`draft → submitted → in_review → changes_requested/approved → publishing → published`, archive, audited transitions) | The revised doc keeps draft safety, review, revisions, and submission status; the machine is content-agnostic. |
| Tenancy, capabilities, row scoping, audit stream | §14 handoff demands exactly this (tenant-private, server-enforced, attribution, lineage). |
| Upload pipeline: session-validated Blob tokens, checksum/dimensions finalize, originals immutable, derived assets referencing sources, serial retry queue | §8/§15 require original preservation, resumable/retry upload, capture-state-vs-upload-state separation — all already built and tested. `capture_assets.capture_metadata` (jsonb) already has room for shot position/angle/calibration evidence. |
| Idempotent drafts (`client_ref`), submit snapshot, resubmission loop | §15 "avoid duplicate submissions", §16 revisions. |
| Review workspace (queue, images-beside-metadata, comments, decisions with reasons) | Becomes the decision half of the Product Passport (§16); the desktop side-by-side requirement is already the Stage 4 layout. |
| Publication mechanics: stable ID, immutable version, `external_reference` idempotency, retryable publishing state, pin contract (`resolvePinnedReference`) | §14 handoff and Studio pinning are unchanged requirements. Library Core already models `profile`/`color`/`texture`(as product)/`manufacturer` record types AND `library_relationships` (`compatible_with` pairs product/profile/color) — the "separate reusable assets" model has a native home without new Library tables. |
| Camera core (getUserMedia rear preference, accept/retake, gallery fallback, permission recovery) | §10/§18/§19 keep all of it; overlays and guidance stack on top. |
| Smoke/test conventions, decision log, per-branch Neon isolation | Process requirements §23 restate what is already practiced. |

### Invalidated assumptions (my Stage 0 assumptions the revision overturns)

1. **Hard categories** — `CAPTURE_CATEGORIES` enum in code + DB CHECK + the
   category-conditional validator (roofing/siding exposure) violates §5
   "flexible tags, not structural categories". Also `EXPOSURE_CATEGORIES`.
2. **Fixed capture types** — `guided_product`/`quick` etc. must become scan
   types: Profile Geometry, Color/Finish, Texture (+ Quick), each with its own
   workflow (§4/§11).
3. **Fixed three-photo model** — `main`/`surface`/`label` purpose slots and the
   photo-based completeness rules conflict with §9 adaptive multi-photo
   capture (evidence-driven completion, not photo count).
4. **One session → one product record** — Stage 5 publishes a single `product`
   with color embedded in metadata; §4 demands separate reusable
   Profile/Color/Texture assets assembled later (Profile + Material + Finish +
   Color + optional Texture), never permanently bound.
5. **Wizard UI shape** — the single-form CapturePanel editor is not the
   phase-based, camera-first Guided Capture / Field Pro / Passport IA (§2/§11).
6. **Measurements as one JSON blob** — D-010's `capture_fields['dimensions']`
   is too thin for per-axis dimension behavior, calibration evidence, and
   measurement provenance (§7/§8).

### Salvage verdict per shipped stage

- Stage 1 (sessions/state machine): **keep** — widen vocabularies.
- Stage 2 (camera/upload/assets): **keep** — replace fixed purposes with shot
  metadata; camera UI gains overlay/guidance layers.
- Stage 3 (metadata/completeness/submit): **keep mechanics, replace rules** —
  the shared-validator pattern (D-021) stays; its rule-set becomes the
  per-scan-type evidence model.
- Stage 4 (review): **keep** — grows into Product Passport.
- Stage 5 (publication/pinning): **keep mechanics, extend mapping** — from one
  product record to an asset graph (profile/color/texture records +
  relationships). Pin contract unchanged.

Nothing shipped needs to be discarded; the rework is vocabulary widening, a
new evidence model, a multi-asset publication mapper, and a new mobile UI
layer over the existing services.

---

## 2. Final mobile information architecture

- **App shell**: Capture area with bottom navigation — `Home`, central
  **Scan** action, `Drafts`, `Passport/Review` (+ `Sync` status pill always
  visible). Graphite camera surfaces, warm-white forms, IronWrap red primary
  actions, Studio tokens reused where suitable (no desktop density).
- **Home**: resume drafts, sync state, start scan (type chooser: Profile
  Geometry / Color & Finish / Texture / Quick), recent submissions.
- **Guided Capture** (default): phase header (Setup → Geometry → Measurements
  → Appearance → Reconstruction → Validation), one task + one primary action
  per screen, camera-first.
- **Field Pro** (flagged): same session model and validation, non-linear
  phase grid, batch shots, keyboard-fast fields. Gated by a company
  `expert_mode` capability flag; SuperAdmin always. Never bypasses
  validation/review/evidence (same server endpoints — no separate API).
- **Product Passport**: identity + tags, source image set with shot map,
  calibration evidence, geometry, measurements + dimension behavior,
  appearance assets and links, confidence/quality report, Studio validation,
  submission status, revisions, lineage. Mobile: stacked accordion sections;
  desktop: Stage 4's side-by-side layout extended.

## 3–5. Scan flows

**Guided Profile Scan** (§11 sequence adopted verbatim): choose Profile
Geometry → place on calibration board → position ruler → confirm units + one
known dimension → guided initial views (left end, right end, front, back,
top, bottom, two isometrics — subset by geometry complexity) → coverage
analysis → exact additional-shot requests (position, angle, distance,
orientation, required feature, ruler visibility, why) → confirm/correct
measurements → generated geometry review → repeat/continuous preview →
Studio-compatible validation preview → submit.

**Color & Finish Scan** (separate session type): calibrated source images
(color reference card when available) → region sampling → RGB/HEX + LAB when
computable, display-preview values → manufacturer name/code entry → gloss/
sheen/metallic selection → finish relationship → confidence + honest-accuracy
disclaimer → submit. Produces a reusable `color` Library record (+ finish
metadata), never bound to a profile.

**Texture Scan** (separate session type): flat-surface guided capture →
physical scale via ruler/markers → pattern direction → perspective-corrected
crop → albedo now; normal/roughness/metallic/AO/height as later derivatives
(§12 lists them as outputs; MVP ships albedo + scale + direction, the rest
staged) → repeat preview → submit. Produces a reusable texture asset record.

## 6. Field Pro flow

Grid of phases with per-phase completion badges; batch camera mode
(continuous shutter into the shot map); inline evidence checklist instead of
step gating; identical submit gate. Enabled by tenant `expert_mode` flag
(settings column, additive) + capability check server-side.

## 7. Product Passport layouts

Mobile: sections as collapsible cards in the order of §16; every asset opens
full-screen with zoom. Desktop: three-pane — images/shot map | geometry &
measurements | decisions/comments/validation — building directly on
`CaptureReview.jsx`.

## 8. Adaptive-shot decision model

Evidence ledger per session (not photo count): each shot records purpose/
view label, camera pose class (enumerated positions), calibration flags
(ruler visible, markers detected [later CV]), quality flags (blur/glare
heuristics), and user confirmations. A pure `captureEvidence.js` module
computes: required-view coverage for the geometry behavior class, overlap
sufficiency (declared adjacent views), scale evidence present, quality gate,
and emits either `complete` or an ordered list of **shot requests** (position
+ angle + distance + orientation + feature + ruler + reason — the §9 prompt
contract). MVP: deterministic checklist heuristics per geometry class,
user-confirmable; CV-assisted coverage/blur/marker detection layers in later
without changing the contract. Same module runs client and server (D-021
pattern) so completion is enforced, not advisory.

## 9. Calibration and measurement model

`calibration` evidence object (stored per session): board version, units,
marker detections (deferred CV → manual confirmations now), ruler-adjacency
confirmation per relevant shot, one user-confirmed known measurement
(mandatory), scale confidence, perspective-correction record, measurement
source (`manual | marker | ruler | inferred`), confirmations. Measurements
become first-class rows (supersedes D-010): each with type, axis/feature,
value, unit, method, confidence, source shot, confirmed-by. Reject/warn set
per §8 wired into the evidence model.

## 10. Flexible classification, geometry behavior, dimension behavior

- **Item type** (small enum): `profile | commercial_product | custom_object |
  assembly | decorative | unknown`.
- **Tags** (free, tenant-editable, no deploy): `capture_tags` vocabulary table
  (tenant-scoped + platform seed set) + tags array on the session/published
  record; permissioned tag creation. Roofing/siding/gutter/… become tags and
  **application relationships**, not structure.
- **Applications**: where it installs (roof surface, wall surface, eave path,
  opening, freestanding…) — drives Studio validation scene choice.
- **Geometry behavior** (enum per §6): `fixed_object | repeating_module |
  continuous_surface | extruded_profile | path_following | parametric |
  assembly | freeform`.
- **Dimension behavior**: per local axis (width/height/length/depth as
  applicable): `fixed | preset | adjustable | repeating | continuous |
  derived_surface | derived_path | cut_to_size | custom | n/a` with min/max/
  increment/presets/default/overlap/exposure/effective coverage/nominal/
  measured. Coil width vs formed width vs effective coverage vs exposed vs
  repeat vs feature widths are distinct stored fields. Width changes that
  alter ribs/locks/bends require a new configuration or scan (no blind
  stretching — enforced as a validation rule, §7).
- **Families**: product family and profile family as flexible references
  (Library `collection`/relationship records), not enums.

## 11. Component inventory

As listed in §17, mapped to build status: **exists** (mobile shell/nav via
Capture tab → to be re-skinned; sync status pill ← queue states; camera
shutter/confirmation/gallery fallback; upload progress; error/permission
states; review status; comments) / **extend** (camera overlay + guidance +
calibration/ruler status + quality message; phase header/progress; coverage
map ← evidence ledger; measurement confirmation) / **new** (additional-shot
request card; geometry-behavior selector; per-axis dimension editor; profile
configuration editor; 3D reconstruction preview; repeat/continuous preview;
Studio validation preview; Passport sections; confidence indicator;
quality-report summary; offline warning states). Each gets purpose/mobile/
desktop/states/accessibility/data/token-reuse notes at its build time.

## 12. Design tokens

Reuse Studio tokens: IronWrap red primaries (`--brand-accent`), existing
type stack, existing focus/contrast rules. Add a Capture-scoped dark
"graphite" surface token set for camera screens (new CSS variables, no second
design system), warm-white form surfaces = existing panel surfaces. Touch
target minimums per §10 (48px controls, 64–72px shutter, 8px spacing) encoded
as CSS variables.

## 13. Offline and synchronization states

Adopt §15 vocabulary verbatim in the sync pill and queue UI: `Saved on
device / Waiting for connection / Uploading X of Y / Synced / Upload failed —
tap to retry / Unsynced changes` (+ last successful sync timestamp). Current
queue states map onto these labels; the gap (already planned as old-Stage 6,
now core): IndexedDB persistence of queued blobs + drafts so "Saved on
device" is never claimed for memory-only data, logout/delete warnings with
unsynced work, resume across restarts. Capture completeness state and sync
state are displayed separately (already separate in the model).

## 14. Error states

All §19 states get explicit UI definitions (what happened / is data safe /
next action). Existing: camera permission/unavailable, upload interrupted,
network, draft recovery, duplicate submission, invalid measurement. New with
their features: calibration/ruler missing, scale uncertain, blur/glare,
insufficient overlap, missing view, hidden geometry, reconstruction failed,
low confidence, Studio validation failed.

## 15. Studio validation flow

Validation phase renders the reconstructed/parametric asset in a
Three.js preview (reusing the repo's existing Three.js competence) against
test scenes: flat wall, gable wall, roof facet, eave path. Checks per §13 +
§25: real-world scale, cross-section, repeat width, effective coverage,
orientation, continuous/surface/path behavior, texture scale, color/finish
appearance, offset from XML surfaces, repetition. Result stored in the
quality report; "Studio Ready" is a validation outcome recorded on the asset,
not a claim.

## 16. Material-package output contract

Adopted from the Work Folder's `09 - Material Package Specification.md` v0.1
(read 2026-07-20) plus §12 of the UX prompt. Package layout:
`manifest.json`; `geometry/product.glb`, `geometry/profile.svg`,
`geometry/profile.dxf`; `textures/{albedo,normal,roughness,metallic,ao,height}.webp`;
`previews/{thumbnail,isometric}.webp`; optional
`documents/technical-sheet.pdf` + `documents/source-information.json`
(attachable later, never a Scanner workflow requirement, never triggers
Knowledge Base research); `validation/quality-report.json`; checksums.
Manifest minimum fields per the spec: schemaVersion, productId,
manufacturer, productLine, name, SKU, category/geometry type, physical
dimensions + units, repeat width / exposed coverage / thickness, compatible
color IDs and accessory/profile relationships, pricing unit and coverage
unit, source links, confidence grade, review status, asset checksums.
Confidence grades per `06 - Material Scanner.md`: **visual-grade →
estimating-grade → fabrication-grade** (fabrication only after verified
CAD/manual review). MVP produces: parametric profile JSON (source of truth)
+ SVG cross-section + previews + quality report at visual/estimating grade;
GLB and DXF staged next; engineering PDF later. Stored as Blob objects,
referenced from Library records (`geometry_url`, `texture_url`, manifest in
metadata); import lifecycle (upload → schema validation → asset validation →
preview → human approval → publish → version/deprecate) maps onto the
existing capture review + publication flow.

## 17. UV vs procedural mapping decision rules (§24/§28)

- **Procedural real-world mapping** (default for roll-formed/continuous):
  standing seam, seamless siding, gutters, trim, long extrusions — texture
  coordinates generated from physical dimensions/path distance at render
  time; never stretch one image across a run.
- **UV-ready GLB/glTF**: fixed products, complex objects, assemblies,
  irregular geometry, preview assets.
- Rule: if geometry behavior ∈ {continuous_surface, extruded_profile,
  path_following, repeating_module with derived run} → procedural; else UV.
  Both carry: real-world texture scale, primary direction (along-run /
  across-width / custom / n-a), rotation rules, repeat width + run direction.

**Material-zone model**: named zones per profile — `main` (required),
`backside` (optional), `cut_edge` (optional), plus additional named zones for
assemblies. Stored with the geometry as zone → mapping metadata; most
roll-formed profiles are `main` (+ optional two).

**Material-ready acceptance (MVP, §26)**: one scanned profile × ≥3 solid
colors with zero geometry change; one texture applied without stretching;
direction stable under length change; physical scale constant across facets/
paths and generated lengths; zone selection works; procedural mapping proven
on one continuous profile; UV mapping proven on one fixed asset.

**AI polishing boundary (§27)**: out of Scanner scope entirely; recorded so
no Scanner deliverable depends on it. Verified Studio render remains the
geometric source of truth.

---

## 18. Data-model impact (all additive or widen-in-place; no destructive change)

- `capture_sessions`: **widen** `capture_type` CHECK to scan types
  (`profile_geometry`, `color_finish`, `texture`, `quick`; keep legacy values
  valid — repo precedent: `users_role_check` drop-and-re-add). `category`
  becomes advisory display text; **new** `tags` jsonb + `item_type` +
  `geometry_behavior` columns (nullable, additive).
- `capture_assets`: **widen/drop** the `purpose` CHECK (shot labels are open
  vocabulary per view position); shot pose/calibration/quality evidence lives
  in existing `capture_metadata` jsonb — no new columns.
- **New** `capture_measurements` (supersedes D-010 at the point it's needed):
  session, type/feature, axis, value, unit, method, confidence, source asset,
  confirmed_by/at.
- **New** `capture_tags` vocabulary (tenant-scoped, permissioned add).
- Dimension-behavior + calibration objects: structured `capture_fields`
  values with schema versions (validated by the shared policy module).
- Library side: **no new tables** — `profile`/`color` record types,
  `library_profile_details.geometry_metadata`, `library_color_details`,
  `library_relationships (compatible_with)` already exist. Publication maps
  one session → its asset record(s) + relationships; `external_reference`
  gains an asset-qualified form (`capture:<sessionId>:<assetKind>`).
- Existing four capture tables, audit stream, upload flow: unchanged.

## 19. API impact

All inside the existing consolidated `/api/capture` function (still 11/12
function slots): session/scan endpoints unchanged; additions are actions —
evidence/shot-request evaluation (shared module, thin endpoint), measurement
CRUD, tag vocabulary CRUD, validation-report save. Publication endpoint
unchanged, mapper extended. **Flag registered**: server-side reconstruction
or PBR derivative generation, when it arrives, is the first real claim on
slot 12 or an external worker — per the standing cap-warning commitment.

## 20. Exact first vertical slice (revised, per §20)

**Slice R1 — Guided Profile Geometry scan foundation.** Acceptance:
1. Capture Home → start Profile Geometry scan (new scan type).
2. Calibration setup phase: units, one user-confirmed known measurement,
   ruler-adjacency confirmation — stored as calibration evidence.
3. Guided initial views: left end, right end, front, one isometric — each
   stored with shot label + pose + evidence flags via the existing upload
   pipeline (originals + thumbnails preserved).
4. Evidence module identifies ≥1 missing view and renders an
   additional-shot request card (position/distance/reason contract).
5. Requested shot captured; evidence flips to complete.
6. Draft auto-saves and resumes without loss or duplicate (existing
   idempotency); sync pill shows §15 vocabulary.
7. Basic measured profile preview: user-confirmed measurements render an SVG
   cross-section stub + confidence summary (deterministic, no CV).
8. Submit passes validation as tenant-private pending review (existing
   submit/snapshot/review flow).
9. Tenant-isolation tests and the full smoke suite stay green.

Files expected to change: `capturePolicy.js` (scan types, evidence/
calibration schemas, widened vocabularies), **new** `captureEvidence.js`,
`db.js`+`schema.sql` (widen CHECKs, `capture_measurements`, `capture_tags`),
`captureService.js` (measurements, evidence eval), `api/capture/index.js`
(actions), `CapturePanel`/new `CaptureScan` components + camera overlay,
`captureClient.js`, smoke additions, new tests (evidence model exhaustively,
calibration validation, measurement CRUD, widened-schema parity), decision
log + this spec. **No new dependencies for Slice R1.**

## 21. Tests required (beyond existing 140)

Evidence-model matrix (per geometry class: required views, overlap, scale
gate, shot-request emission), calibration validation, measurement provenance,
tag permissioning, widened CHECK parity, publication → multi-asset mapping +
relationships, §26 material-ready acceptance tests (as they land), offline
queue persistence tests (IndexedDB stage), Studio validation checks.

## 22. Blocking questions

None for Slice R1. Two non-blocking defaults recorded for override:
1. **Review locus**: capture-side review (Stage 4) is retained as the
   tenant review queue; published records carry `approved` post-review,
   matching `CAPTURE_LIBRARY_HANDOFF.md`'s reviewer actions. If you want
   review moved into the Library console instead, it's a routing change, not
   a schema change.
2. **Expert Mode storage**: company-level flag as an additive `settings`
   column read into capabilities at session time; SuperAdmin always on.
