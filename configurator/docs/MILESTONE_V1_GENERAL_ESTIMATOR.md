# Milestone V1 — General Estimator

Status: Scoping (owner-driven, 2026-07-24)
Success test (owner's words): *"me for now as patient zero, with the ability
to test the product by others with hints and guidance from my end."*
Depends on: `DOMAIN_MODEL.md` (canonical vocabulary — read it first).

## What V1 is

A contractor can, on one converged production app:

1. **Open XML** → a real-scale 3D model of the structure.
2. **Apply a Profile** onto a surface, and a **Color** over that profile
   (visual), building an **estimate** as `Service + Profile + Color` line
   items.
3. **Populate** the Profile/Color libraries — via admin entry now; capture
   (photoshoot) is the differentiator and a fast-follow.
4. **Share** the design/estimate with a client, who can **approve** or make
   minor changes.

Expert Mode (structured sizes, sku, manufacturer, per-color pricing,
material takeoff/allocation math) is explicitly **out of V1**.

## Already proven working (live, in production)

Verified by the owner using the app as patient zero (2026-07-24):

- Open XML → 3D model. ✅
- Add a color (admin) → it becomes applyable. ✅
- Apply color on the model (renders). ✅
- Showroom presentation. ✅
- PDF export. ✅

So the *configure → present → export* spine is real. The remaining V1 work
is about making the model/vocabulary correct and closing the population and
share/approve edges.

## Known gaps (V1 scope)

| # | Gap | Notes |
| --- | --- | --- |
| G1 | The "Materials" tab muddles profile into a "material" record | Should be **Profiles \| Colors** — see Slice 1. |
| G2 | Profiles can't be added as first-class priced primitives | Tied to G1; today profiles live as a comma-string on a "material". |
| G3 | Captured **colors** don't surface into Studio | `listTenantLibraryOptions` filters to `record_type='product'`; Capture publishes `color`. Blocks the photoshoot→apply loop. |
| G4 | Per-profile color scoping is only partial | `colorIds` exists but isn't enforced end-to-end. |
| G5 | Interactive client share/approve beyond PDF | PDF export works; the interactive approve/edit flow needs a live pass. |

## Slices (ordered)

### Slice 1 — Materials tab → **Profiles | Colors** (FIRST)

Make the catalog UI match the domain model. Scope kept shallow (V1, not a
data-model overhaul):

- Relabel the left column and its form from "Material" to **"Profile"**;
  each row is **one** priced profile (`name`, applies-to roof/wall, price,
  unit).
- Drop/repurpose the confusing multi-value `profiles` **string** field (the
  row name *is* the profile).
- Keep **folders** as the "material" grouping (already built).
- Keep **Colors** column as-is.
- Rewire the configurator's profile dropdown to read profile rows directly
  (it currently reads the material's `profiles` string).

**Acceptance:**
- The tab reads **Profiles | Colors**.
- Owner adds a profile (e.g. `SnapLock 12"`, roof, $/sq ft) and a color;
  both appear and persist.
- In the configurator, that profile is selectable on a roof surface and the
  color applies over it; the estimate line reflects `Service + Profile +
  Color`.
- Save → reopen → share preserves the selection.
- Full test suite + build green; live smoke + a Playwright pass on the
  deployed preview before any promotion.

Deferred to Expert Mode: structured Profile → Size, sku, manufacturer,
per-color price modifiers.

### Slice 2 — Surface captured colors into Studio (closes G3)

Extend `listTenantLibraryOptions` to include `color` records and map them
into the color picker, so a photographed color becomes selectable.

### Slice 3 — Photoshoot → apply loop end-to-end (G3 + Capture)

Color & Finish / Quick capture → published `color` → immediately usable in
Slice 2's picker. Decide self-publish vs review-queue for a single-tenant
contributor.

### Slice 4 — Interactive share/approve pass (G5)

Live-verify the client share → approve/minor-edit flow (distinct from PDF).

Textures/profile-geometry reconstruction and other advanced Scanner outputs
stay parked past V1 (Scanner V4).

## Promotion rule

Every slice: build on a fresh branch from `main`, verify (tests + build +
deployed-preview smoke + Playwright), open a held PR to `main`, and promote
only on the owner's explicit go. `main` is production.
