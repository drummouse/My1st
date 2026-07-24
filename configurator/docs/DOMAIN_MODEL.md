# IronWrap Domain Model — Canonical Vocabulary

Status: Agreed with the product owner (2026-07-24). This is the single
source of truth for what the core nouns mean and how they relate. Do not
re-litigate these terms in conversation or code — if the model needs to
change, change it here first, with a dated note.

Its purpose is to stop the terminology drift that keeps recurring
("material vs product", "is finish separate", "what is texture") by fixing
one vocabulary that the UI, the Library record types, the Capture flow, and
every future spec point back to.

## The model

```
SERVICE   (has: price + unit)
   ├─ standalone                 e.g. driving, delivery, production
   └─ service + MATERIAL         e.g. supply & install siding, manufacture,
                                      install a customer-supplied product

MATERIAL   (has: name + price + unit)
   ├─ PROFILE   (the geometry / cross-section)
   │      └─ SIZE                a variant of the profile (Plank-6", Plank-8")
   └─ COLOR     (the complete surface appearance)
          ├─ hue                 the base color (e.g. RAL 9005)
          └─ finish              the surface treatment (Wrinkle, IceCrystal,
                                 gloss, matte …). "Wrinkle 9005" and
                                 "IceCrystal 9005" are DIFFERENT colors.
                                 └─ render map: an internal image asset the
                                    3D engine uses to draw the finish
                                    photoreal. Never chosen by anyone; it is
                                    a display detail of the finish.

reserved for later: MANUFACTURER, SUPPLIER (real records already exist in
the Library schema; not part of the V1 selection model).
```

## What a customer actually chooses

On any material, the customer picks exactly two visual things:

1. **Profile (+ size)** — the geometric form and its dimensional variant.
2. **Color** — which quietly carries its **finish** (and the internal render
   map) along with it.

Everything else (price, unit, manufacturer, supplier, the render map) is a
property of the record, not a customer choice.

## Terminology decisions (binding)

| Decision | Rationale |
| --- | --- |
| **"Material" = the code's `product`** | Same thing, two words. The roofing domain says "material"; the code/Library/Capture say `product`. When they diverge in UI copy, prefer **material** for customer-facing text. |
| **"Finish" is a property of Color, not a peer** | "Wrinkle 9005" vs "IceCrystal 9005" — same RAL number, different finish = a different selectable color. Finish never stands alone. |
| **"Texture" is retired as a vocabulary word** | It was overloaded: it meant both the physical surface (= finish) and the render image. We now say **finish** for the surface the customer perceives, and **render map** for the internal display image. Do not reintroduce "texture" as a user-facing or model term. |
| **"Size" is a variant of a Profile** | Not part of the material's top-level identity — it is a dropdown *under* a profile (a Plank profile offered in 6" and 8"). |
| **Color availability is scoped per material** | A material offers a specific set of colors; "choose a color" is scoped to what that material offers, not a global list. |

## Where the code is simpler than this model (build gaps, not corrections)

This model is partly aspirational. As of 2026-07-24 the production code:

- Represents **Profile** as a free-text label string on a material
  (`profileLabel`) — there is **no structured Profile → Size relationship**.
  "Plank-6" and "Plank-8" would be two unrelated strings today.
- Treats **Color** as a flat list; **finish** rides in record metadata,
  not as a structured, selectable sub-property.
- Enforces **per-material color scoping** only partially (via `colorIds`).
- Still carries a standalone `texture` **Library record type** (left over
  from the Scanner work) that models a "reusable texture asset attachable to
  many materials." That is a more advanced idea than this model. **For V1,
  texture is a property of color (its render map), and the standalone
  texture-record capability is deferred (advanced / Scanner V4 territory).**
  Do not build toward the standalone-texture model by accident.

Evolving the code toward this structure — especially the Profile → Size
relationship — is part of V1 and later Expert-Mode work, tracked in the
milestone plans, not here.

## Relationship to Library record types

The Library's `RECORD_TYPES` are `product, profile, color, texture,
category, manufacturer, supplier, collection, catalog`. Mapping to this
model: `product` = Material, `profile` = Profile, `color` = Color (finish +
render map live inside it), `manufacturer`/`supplier` = reserved. `texture`
as a standalone record type is deferred (see above). `category`,
`collection`, `catalog` are organizational groupings, out of scope for the
core selection model.
