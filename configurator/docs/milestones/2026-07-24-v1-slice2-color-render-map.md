# V1 Slice 2 — Tenant colors carry a surface swatch → 3D render-map (not-SimCity fix)

Milestone: **V1 — General Estimator**, Slice 2 (see
`docs/MILESTONE_V1_GENERAL_ESTIMATOR.md`).
Decisions: **D-081**, **D-082** (`docs/CAPTURE_DECISION_LOG.md`).
Authorization: owner — "kick it" / "go" after Slice 1.

## Why

The 3D viewer already renders built-in colors realistically — `setMeshColor`
does `material.map = loadTexture(colorEntry.texture)` for the built-in
Wrinkle/Icecrystal/Woodgrain colors, which ship photographed swatches. A
color the owner *adds* arrived at the scene with a hex but **no `texture`**,
so `material.map = null` and the surface shaded flat — the "SimCity" look the
owner called out. This slice closes that gap: an added color can carry an
uploaded surface photo that becomes its render-map.

## What changed (additive-free — no schema, no new API, no new function)

- `api/upload.js` — new **`swatch`** upload kind (PNG/JPEG/WebP, 10 MB) inside
  the existing shared upload function. The repo is at the 12-function Vercel
  Hobby cap, so no new serverless route was added.
- `src/components/MaterialsPanel.jsx` — the **Add a color** form gains an
  optional **Surface photo** picker. It uploads straight to Blob via the same
  `@vercel/blob/client` direct-upload flow the company logo uses
  (`kind: 'swatch'`), previews the swatch, and stores the returned public URL
  on the color form. `handleAddColor`'s existing `...colorForm` spread already
  sends it to the colors API as `thumbnailUrl`, which the API already persists
  to `colors.thumbnail_url` — **no colors-API or schema change**.
- `src/App.jsx` — `toColorEntry` maps `thumbnail_url` to **both** `thumbnail`
  and `texture`, so `colorById()` → `facetColors` → `setMeshColor` sets
  `material.map`. The scene texture branch already existed; this feeds it.

## Verification

Preview: `ironwrap-estimator` PR #35 (see the deployed alias in the PR).

- `npm test` — **657/657 pass** (4 new source-contract tests in
  `tests/colorRenderMap.test.mjs` lock the swatch kind, the `toColorEntry`
  texture mapping, the `setMeshColor` map branch, and the form's upload wiring).
- `npm run build` — clean.
- Deployed-preview smoke (`npm run smoke`) — _appended after preview build._
- Live check (upload a swatch on the preview, apply the color, confirm the 3D
  surface renders the photo rather than a flat block) — _owner/patient-zero
  eyeball; needs superadmin login._

## Deferred (Slice 2b)

Surfacing captured `color` records (from the Capture scanner) into the Studio
picker — gated behind `listTenantLibraryOptions` filtering to `product` only.
That touches the library→color-picker mapping (a separate axis from the
product options) and is its own slice. The admin Add-a-color path shipped here
delivers the realism value for the owner's actual workflow.
