# Milestone V1 — General Estimator

Status: Scoped (owner-driven, 2026-07-24)
Success test (owner's words): *"me for now as patient zero, with the ability
to test the product by others with hints and guidance from my end."*
Read first: `DOMAIN_MODEL.md` (canonical vocabulary + the capture model).

## What V1 is

On the one converged production app:

**Open XML → apply profiles + colors to the 3D model → share the
design/estimate with the client for approval / minor edits.**

The bar is *commercial-grade* — the 3D must look like real material, not
flat "SimCity" blocks. UI/UX refinement is a continuous track through
V1–V2 (see the roadmap), not a separate milestone.

## Already proven working (live, in production, by the owner)

Open XML → 3D · add a color (admin) → applyable · apply color on the model
(renders) · Showroom presentation · PDF export. The *configure → present →
export* spine is real.

## The two facts that shape V1

1. **The realism fix is a render-map, not geometry.** `buildScene.js`
   already does `material.map = loadTexture(color.texture)` — the viewer
   *already* applies real material textures. Built-in colors carry a
   photographed swatch and look real; a color the owner adds is just a hex
   value with no texture → `material.map = null` → flat SimCity shading.
   So "make it look real" = **let user-added/captured colors carry a
   render-map (a surface swatch).** The apply-side is done; the gap is
   getting a texture onto a user color.

2. **Profile shape in V1 is parametric, not reconstructed.** A profile
   must put *real shape* on the model (SnapLock ≠ corrugated), but arbitrary
   photo-to-geometry reconstruction is hard (that's V2.1). The V1 path is a
   **parametric profile** — pick a type (standing seam, corrugated, ribbed,
   plank/board&batten, shingle, flat) + coverage size → the app generates
   3D relief at correct scale. Covers ~90% of real products; reliable; no
   CV. Photo-reconstruction of exotic profiles is deferred to V2.1.

## The capture model (see DOMAIN_MODEL.md)

Material = **Profile + Color**. The five capture tabs collapse to what the
model needs:

| Old tab | Becomes | Milestone |
| --- | --- | --- |
| Quick capture | **Quick / parametric Profile scan** (few photos → similar shape) | **V1** |
| Color & Finish | **Color** (+ render-map) | **V1** |
| Texture | **Print & Pattern** (woodgrain/stone) | V2.1 |
| Profile & Geometry | **Detailed profile reconstruction** (+ docs/drawings) | V2.1 |
| Guided Product | — dropped (was profile capture, mislabeled) | — |

## Slices (ordered)

### Slice 1 — Catalog vocabulary: "Materials" tab → **Profiles \| Colors**
Shallow relabel: left column/form "Material" → **"Profile"** (each row one
priced profile: name, roof/wall, price); drop the confusing multi-value
`profiles` string; keep folders as the "material" grouping; Colors column
unchanged. Also collapse the Capture tabs per the table above. Low-risk,
proves the build→verify→promote pipeline on something small.
*(Slice 1b, right after: make Profile the first-class primitive
end-to-end — configurator picks a profile directly. Touches the
estimate/design-state; real refactor.)*

### Slice 2 — Colors that look real (the render-map / not-SimCity fix)
Let a user-added/captured color carry a **surface swatch → render-map**, so
`material.map` is set and the surface renders like real material. This is
the core V1 realism value. Includes surfacing captured `color` records into
Studio's picker (today `listTenantLibraryOptions` filters to `product`
only).

### Slice 3 — Parametric profile shapes
A small library of parametric profile templates (standing seam, corrugated,
ribbed, plank, shingle, flat) → pick type + coverage → generate 3D relief
at real-world scale on the imported facets. Wire it to the **Quick /
parametric Profile scan**. Photo-reconstruction stays V2.1.

### Slice 4 — Interactive share / approve
Live-verify client share → approve / minor-edit (distinct from PDF export).

### Continuous — UI/UX + usability
Commercial-grade polish across all slices; not a discrete slice.

## Acceptance (V1 done)

Owner (or a guided outside tester) can: open an XML → pick a parametric
profile that shows real shape on the 3D → apply a color that renders like
real material (not a flat block) → produce a correct estimate line
(`Service + Profile + Color`) → export a PDF → share a link the client
approves. Full test suite + build green; live smoke + Playwright on the
deployed preview before promotion.

## Deferred out of V1 (recorded so it isn't rebuilt early)

Detailed profile reconstruction + CAD docs, Print & Pattern, raised
geometric relief beyond parametric, structured Profile→Size/sku/manufacturer
(lives in the Capture/Materials evolution), photo-to-geometry CV.

## Promotion rule

Every slice: fresh branch from `main` → build → verify (tests + build +
deployed-preview smoke + Playwright) → held PR to `main` → promote only on
the owner's explicit go. `main` is production.
