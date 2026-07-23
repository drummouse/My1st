# Scanner Texture Scan — First Vertical Slice

Date: 2026-07-23
Branch: `claude/scanner-texture-scan` (stacked on `claude/scanner-color-finish-scan`
→ `claude/development`; both draft PRs still open — see note below)
Authorization: "do next step" after Color & Finish scan (D-073) shipped — the
other remaining scan-type gap identified in the revised spec.

## Note on branch stacking

This branch is based on `claude/scanner-color-finish-scan` (PR #31, still
draft/unmerged) rather than directly on `claude/development`, because both
slices touch the same shared files (`capturePolicy.js`'s
`validateCompleteness`, `CapturePanel.jsx`'s type chooser/routing) in nearby
locations. Building this slice directly against `claude/development` would
either duplicate PR #31's diff or produce merge conflicts with no shared
history. The PR for this slice is opened against `claude/scanner-color-finish-scan`
and should be merged after (or together with) PR #31, then re-targeted at
`claude/development` if GitHub doesn't do so automatically once #31 lands.

## Scope delivered

Mirrors Slice R1's (Profile Geometry) and D-073's (Color & Finish)
precedent — a new scan type, its own dedicated flow, evidence-driven
flexible classification, submit into the existing review pipeline,
publication mapping explicitly deferred. Unlike Color & Finish, this slice
needed **no new pure module** — R2.5 (built for Profile Geometry's flat-wall
"technical compatibility" proof) already contained almost the entire
evidence model this scan type needs:

- **Reused verbatim, unchanged**: `saveCalibration` (physical scale: units +
  one ruler-confirmed known measurement), `saveMaterialZone` (confirm
  `main_visible_face`), `saveTextureDirection`
  (`along_run/across_coverage/custom/not_applicable`),
  `evaluateStudioValidation` + `normalizeMaterialZoneState`/
  `normalizeTextureDirection`/`evaluateFlatWallValidation`, and the
  `CaptureFlatWallPreview.jsx` Three.js schematic preview component — all
  already session-generic in `captureService.js`, none of it gated by
  `captureType`.
- **`capturePolicy.js`**: new `texture` branch in `validateCompleteness` —
  title, a main source photo, calibration, a confirmed material zone, and a
  chosen texture direction are errors; missing description is a warning.
  These same three R2.5 checks were previously only an *optional* extra
  proof for Profile Geometry sessions — for Texture they're the scan's core,
  required evidence. No category, no dimensions, no exposure.
- **`CaptureTextureScan.jsx`** (new): a single-view flow — name, take/retake
  one flat-surface source photo (reuses `CaptureCamera` + the existing
  upload queue), the calibration form, width/height measurement inputs,
  material-zone confirm button, texture-direction select, a "Run Technical
  Compatibility Check" button that reveals the `CaptureFlatWallPreview` once
  ready, and Submit — gated by the new completeness branch.
- Wired into `CapturePanel.jsx`: a new "Texture scan" entry in the
  scan-type chooser, routed the same way `profile_geometry`/`color_finish`
  route to their own components.
- `texture` was already a valid `CAPTURE_TYPES` value (present since Slice
  R1's very first vocabulary widening). **Zero schema changes, zero new API
  routes, zero new dependencies, zero new function slots** (still 11 of 12).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 325/325 pass (319 baseline on this branch + 6 new in `captureTextureScan.test.mjs`) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |

## Honest gaps

- **Ships albedo + scale + direction only**, matching the spec's own MVP
  framing for this scan type. No perspective-corrected cropping (the source
  photo is used as-is; the contributor is expected to shoot flat and
  square-on) and no normal/roughness/metallic/AO/height derivatives — both
  explicitly staged for a later slice, same honesty boundary R1 and D-073
  kept ("deterministic, not CV" — no perspective-correction CV exists
  anywhere in Capture yet).
- **Publication mapping is deferred**, exactly as R1 and D-073 deferred
  their own asset-graph mapping. `buildLibraryPublication` still maps every
  capture type — including `texture` — to a generic Library `product`
  record. The session still submits, reviews, and publishes correctly end
  to end; it doesn't yet produce a specialized reusable Library texture
  asset record.
- **Live browser verification pending** — to follow once this branch (or
  the combined stack) deploys, using the same Playwright-against-live-preview
  approach (with the `--ssl-version-max=tls1.2` proxy workaround) used for
  the Tag UI and Color & Finish slices.
- No smoke-test additions were needed — this slice adds no new API routes.
