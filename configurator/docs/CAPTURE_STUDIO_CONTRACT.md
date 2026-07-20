# Library → Studio Contract (Capture Stage 5)

How IronWrap Studio consumes products that Capture publishes into Library
Core. Authority: `api/_lib/capturePublish.js` (`toStudioProduct`,
`buildPinReference`, `resolvePinnedReference`) and the
`GET /api/library/products` endpoint (capability `library.read`,
tenant-scoped server-side).

## The DTO

Every published product is served as:

| Field | Meaning |
| --- | --- |
| `productId` | Stable Library record id (uuid). Never changes for the life of the product. |
| `version` | Integer Library version. Increments only through audited Library updates (optimistic concurrency); Capture publishes create version 1 and never mutate existing records. |
| `name`, `description`, `sku`, `category`, `manufacturer`, `supplier` | Identity/display metadata. |
| `unit`, `dimensions`, `coverage` | Dimensional metadata (`dimensions.unit` ∈ mm/cm/in/ft; `coverage.exposure` for roofing/siding). |
| `color` | Approximate color sample `{mode, name, hex}` — honestly qualified, never laboratory-accurate. |
| `thumbnailUrl`, `textureUrl`, `geometryUrl` | Asset references. `textureUrl`/`geometryUrl` are null until the texture (Stage 9) and profile-geometry (Stage 10) pipelines produce Studio-compatible material/geometry assets — the fields exist now so the contract does not change later. |
| `lifecycleStatus` | `active` or `archived` (discontinued). |
| `scope`, `tenantId`, `sourceType` | Visibility scope (tenant-private for Capture publications) and provenance. |

## The pin rule

When a Studio project selects a Library product it must store, inside its
own `design` JSONB:

1. `buildPinReference(product)` → `{ productId, version, pinnedAt }`, and
2. the full DTO snapshot as selected.

The snapshot is authoritative for that project from then on — identical to
how `pricingSettings` freezes quoted tax/discount rates and
`customServiceLines` freezes quoted prices at save time. On load, the
consumer calls `resolvePinnedReference(pin, current)`:

- `pinnedMatches: true` — render from the snapshot as always; nothing changed.
- `upgradeAvailable: true` — keep rendering the snapshot, offer the newer
  version as an explicit user choice. **Never** swap content silently.
- `found: false` — the product was removed/archived; the snapshot still
  renders and the project remains intact.

This satisfies "Studio projects must store the version they use" without a
version-history table: immutability is achieved by consumer-side snapshot
plus explicit upgrade, matching the platform's established freeze-at-save
pattern (decision D-031). A `library_record_versions` history table is the
recorded upgrade path if snapshot-based pinning ever becomes insufficient.

## Guarantees

- Capture never updates an existing Library record — publication is
  create-only with idempotent reuse (`external_reference = capture:<sessionId>`).
- Visibility is enforced in SQL server-side: owners see their tenant's and
  global approved products; nothing crosses tenants.
- Existing Studio project data is untouched by everything above: no current
  Studio code path reads these endpoints yet; the minimal consumer is the
  "Published Library" list in the Capture panel.
