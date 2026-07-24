# Scanner Color & Finish Scan — First Vertical Slice

Date: 2026-07-23
Branch: `claude/scanner-color-finish-scan` (→ `claude/development`, draft)
Authorization: user picked this slice over Texture scan (smaller — no
ruler/perspective-correction or physical-scale calibration needed) after a
recommendation; explicit "do it" to start.

## Scope delivered

Mirrors Slice R1's (Profile Geometry) precedent — a new scan type, its own
dedicated flow, evidence-driven flexible classification, submit into the
existing review pipeline, publication mapping explicitly deferred.

- **`api/_lib/captureColor.js`** (new, pure, client+server shared per
  D-021): `rgbToHex`, `rgbToLab` (standard sRGB → XYZ (D65) → CIE L\*a\*b\*
  formulas — deterministic math, not CV), `normalizeColorSample()`
  (validates an RGB byte triple + a `FINISH_TYPES` value, derives
  hex/lab, bounds optional manufacturer name/code, always grades the
  result `visual-grade`).
- **`capturePolicy.js`**: new `color_finish` branch in `validateCompleteness`
  — title, a main source photo, and a sampled color+finish are errors;
  missing manufacturer identity is a warning only. No category, no
  dimensions, no exposure — a color sample isn't a product.
  `color_finish` was already a valid `CAPTURE_TYPES` value from Slice R1's
  vocabulary widening; this slice adds zero schema changes.
- **`CaptureColorScan.jsx`** (new): take/retake one source photo (reuses
  `CaptureCamera` + the existing upload queue), tap-to-sample RGB directly
  off that photo via canvas `getImageData`, live hex/rgb/lab swatch,
  finish `<select>`, manufacturer name/code inputs, a visual-grade
  disclaimer, and Save Draft / Submit wired to the existing draft-patch and
  submit endpoints — no new API routes.
- Wired into `CapturePanel.jsx`: a new "Color & Finish scan" entry in the
  scan-type chooser, routed to `CaptureColorScan` the same way
  `profile_geometry` routes to `CaptureProfileScan`.
- New CSS: `.capture-color-sample-photo`, `.capture-color-sample-result`,
  `.capture-color-swatch`.
- **Zero new dependencies. Zero new function slots** (still 11 of 12).
  **Zero schema changes** (the `color_finish` CHECK value already existed).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 319/319 pass (13 new: 5 in `captureColor.test.mjs`, 8 in `captureColorScan.test.mjs`) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |

## A real bug caught before it shipped

While writing the result display, `sample?.lab.l` (etc.) was an optional-
chaining precedence mistake — `sample?.lab` short-circuits to `undefined`
when no finish is chosen yet, but the trailing `.l` outside the chain would
then throw on `undefined.l` the moment a user sampled a color before
picking a finish. Caught on read-through before any test or manual run;
fixed by only rendering the LAB line once a `finish` has actually been
selected (`sample?.lab?.l` would have also worked, but showing partial LAB
values before a finish is chosen is misleading anyway, so gating on
`sample` truthiness is the better fix).

## Live browser verification (2026-07-23)

Run against the deployed preview (`ironwrap-estimator-git-claude-scanne-3cc2a4-drummouses-projects.vercel.app`,
READY, deployment `EbeB7GHvAhjhckN9BnCPdmpK4wzY`) via Playwright, same
approach as the Tag UI slice (local `npm run dev` has no working backend in
this sandbox, so the live preview is the rigorous equivalent). Headless
Chromium has no camera, so the flow exercised `CaptureCamera`'s gallery
fallback with a real generated JPEG (a solid-fill 200×200 canvas image,
written to disk and fed through the actual `<input type="file">`), not a
mocked upload.

| Step | Result |
| --- | --- |
| `npm run smoke` against the preview | 32/32 pass |
| Create a Color & Finish scan session | "Color & Finish scan" appears in the type chooser; the dedicated flow renders |
| Name the sample | Persisted |
| Take/choose the source photo | Real file uploaded through the existing pipeline; photo renders in the panel |
| Click the photo to sample a color | A real pixel read via canvas `getImageData` off the *actual rendered photo* — not a stub. Read back within JPEG-compression tolerance of the source fill color |
| Hex/LAB derivation | A well-formed `#RRGGBB` hex and finite LAB values displayed, computed from the real sampled RGB |
| Choose a finish, fill manufacturer name/code | All three persisted |
| Save Draft, reload, reopen the session | Title, finish, manufacturer name/code, **and the exact sampled RGB** (byte-for-byte, not just tolerance) all persisted correctly |
| Submit for review | Succeeded ("Submitted for review with 1 warning(s)" — the expected `DESCRIPTION_MISSING` warning, since this scan type has no description field; non-blocking, correct) |
| Console/page errors throughout | None |

All 8 steps passed. No real SMS/email was sent; no schema, historical rows,
`main`, or the Codex/GPT lane were touched.

## Honest gaps

- **No color-calibration-board CV** — every result is `visual-grade`
  confidence (a phone photo, no reference card read). This mirrors R1's
  own deterministic-checklist-only evidence model; real calibration
  detection is future CV work for both scan types alike, not unique to
  this slice.
- **Publication mapping is deferred, exactly as R1 deferred
  reconstruction/GLB/DXF.** `buildLibraryPublication` still maps every
  capture type — including `color_finish` — to a generic Library `product`
  record via the existing `library_product_details` path. The session
  still submits, reviews, and publishes correctly end to end; it just
  doesn't yet produce the specialized reusable Library `color` record
  (`library_color_details`, already in the schema but with no write path)
  that the revised spec's asset-graph model (§18) ultimately wants. That
  mapping change touches Stage 5's publish flow and Studio pin DTOs
  (`toStudioProduct`/`resolvePinnedReference`, currently product-shaped) —
  explicitly out of scope for this slice, same reasoning R1 used to defer
  its own larger mapping work.
- **Live browser verification pending** — to follow once this branch
  deploys, using the same Playwright-against-live-preview approach (with
  the `--ssl-version-max=tls1.2` proxy workaround) used for the Tag UI
  slice, since local `npm run dev` has no working backend in this sandbox.
- No smoke-test additions were needed — this slice adds no new API routes
  (the sample rides the existing `fields` draft-patch path), so there is no
  new auth-guard surface for `npm run smoke` to cover.
