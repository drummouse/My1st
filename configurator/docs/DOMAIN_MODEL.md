# IronWrap Domain Model — Canonical Vocabulary

Status: Agreed with the product owner (2026-07-24). This is the single
source of truth for what the core nouns mean and how they relate. Do not
re-litigate these terms in conversation or code — if the model needs to
change, change it here first, with a dated note.

Its purpose is to stop the terminology drift that keeps recurring
("material vs product", "is finish separate", "what is texture", "is
material a thing you store or a thing you assemble") by fixing one
vocabulary that the UI, the Library record types, the Capture flow, and
every future spec point back to.

## The model

The two things you actually **maintain and pick from** are **Profiles** and
**Colors**. "Material" is not a third catalog you curate — it is the
**umbrella / folder term** for a bundle (a profile + a color + sku +
manufacturer …), and/or the runtime *result* of picking a profile and a
color on a surface.

```
SERVICE   (has: price + unit)
   ├─ standalone                 e.g. driving, delivery, production
   └─ service + material         e.g. supply & install, manufacture,
                                      install a customer-supplied product

PROFILE   (the priced, geometric primitive — what you maintain)
   name (e.g. SnapLock 12"), price, unit, applies-to (roof / wall)
      └─ SIZE                    a variant of the profile (Plank-6", Plank-8")

COLOR     (the surface primitive — what you maintain)
   ├─ hue                        the base color (e.g. RAL 9005)
   └─ finish                     the surface treatment (Wrinkle, IceCrystal,
                                 gloss, matte …). "Wrinkle 9005" and
                                 "IceCrystal 9005" are DIFFERENT colors.
                                 └─ render map: internal image the 3D engine
                                    uses to draw the finish photoreal. Never
                                    chosen by anyone.

MATERIAL  (umbrella / folder term — NOT a maintained record)
   a grouping/bundle of a profile + color (+ sku, manufacturer …), and the
   word for the assembled result applied to a surface.

reserved for later: SKU, MANUFACTURER, SUPPLIER (structured fields — Expert
Mode; the Library schema already has manufacturer/supplier record types).
```

## How it composes (the two logics the owner defined)

- **Visual:** apply a **Profile** onto a surface, then apply a **Color** over
  that profile. That's the 3D appearance.
- **Estimate:** a line item is **Service + Profile + Color**, all in one —
  e.g. `Installation + SnapLock 12" + 9005 Wrinkle`. Service can stand alone
  (labor only) or carry the profile+color (supply & install).

For **V1 (the General Estimator)** this is the whole model. **Expert Mode**
(later) adds the deeper adjustable options — structured size variants, sku,
manufacturer, per-color price modifiers, takeoff math, etc.

## What a customer chooses

On any surface, the customer picks exactly two visual things:

1. **Profile (+ size)** — the geometric form and its dimensional variant.
2. **Color** — which quietly carries its **finish** (and the internal render
   map) along with it.

## Terminology decisions (binding)

| Decision | Rationale |
| --- | --- |
| **"Material" is an umbrella / folder, not a maintained record** | You curate **Profiles** and **Colors**. "Material" groups them (a folder / bundle) and names the assembled result. Do not build a separate SKU-by-SKU "materials" list — that's a combinatorial explosion of profile×color. |
| **"Profile" is the priced primitive** | A profile (SnapLock 12") carries the price, unit, and applies-to (roof/wall). A profile usually already implies its material type (Standing Seam ⇒ metal). |
| **"Finish" is a property of Color, not a peer** | "Wrinkle 9005" vs "IceCrystal 9005" — same RAL number, different finish = a different selectable color. Finish never stands alone. |
| **"Texture" is retired as a vocabulary word** | It was overloaded (physical surface = finish, vs the render image). Say **finish** for the surface the customer perceives, and **render map** for the internal display image. Do not reintroduce "texture" as a user-facing or model term. |
| **"Size" is a variant of a Profile** | A dropdown *under* a profile (Plank-6", Plank-8"), not part of top-level identity. |
| **Color availability is scoped per profile** | A profile offers a specific set of colors; "choose a color" is scoped to what that profile offers, not a global list. |

## Where the code is behind this model (build gaps, not corrections)

As of 2026-07-24 the production code:

- Has a **"Materials" tab with columns "Materials" and "Colors"** — but the
  left column's record is `{ name, kind: roof/wall, pricePerSqft, profiles:
  "<comma-string>", folderId }`. It muddles profile into a sub-string of
  "material". **Per this model it should be "Profiles | Colors"**, each row a
  single priced profile, with folders serving as the "material" grouping.
  (This is V1 Slice 1 — see the V1 milestone plan.)
- Represents a profile's **size** as part of a free-text label — there is no
  structured Profile → Size relationship yet.
- Treats **Color** as a flat list; **finish** rides in record metadata, not
  as a structured selectable sub-property.
- Enforces **per-profile color scoping** only partially (via `colorIds`).
- Still carries a standalone `texture` **Library record type** (from the
  Scanner work) — a "reusable texture asset" idea more advanced than this
  model. For V1, texture is a color's render map; the standalone-texture
  capability is deferred (Scanner V4). Do not build toward it by accident.

## Relationship to Library record types

The Library's `RECORD_TYPES` are `product, profile, color, texture,
category, manufacturer, supplier, collection, catalog`. Mapping: `profile` =
Profile (priced primitive), `color` = Color (finish + render map inside),
`product` historically = the muddled "material" record (being split into
profile + folder), `manufacturer`/`supplier` = reserved, standalone
`texture` = deferred. `category`/`collection`/`catalog` are organizational
groupings (folder-like), out of scope for the core selection model.
