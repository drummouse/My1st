# Capture Stage 5 — Library Publication and Studio Contract Verification

Date: 2026-07-20
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (PR #21 → `claude/development`)
Commit verified: `4b94b9d`

## Scope delivered

An approved capture publishes to a company-private Library Core product
with a stable ID and immutable version; failed publication retries safely;
publishing twice is a no-op. Studio (and today's minimal consumer, the
"Published Library" list) reads the tenant-scoped DTO at
`GET /api/library/products`. The pin contract — DTO snapshot +
`{productId, version, pinnedAt}` stored in the project's own `design`
JSONB with explicit, never-silent upgrades — is implemented as pure
functions and documented in `docs/CAPTURE_STUDIO_CONTRACT.md`. Zero new
dependencies; zero new function slots (11 of 12).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 140/140 pass (10 new Stage 5 tests) |
| `npm run build` | Succeeds |
| `npm run smoke` against the live PR preview (deployment `GSi9rwBVdAxP9YGYDKzKPfSQtNa2`, READY) | 19/19 pass, including the new unauthenticated guards on `/api/library/products` and publish |

## Exit-gate status

1. **Existing Studio project data is unchanged** — publication is
   create-only into `library_records`; no Studio code path is modified; no
   existing table or row is altered.
2. **Product visibility is enforced server-side** — the products query is
   tenant-scoped in SQL (global-or-own-tenant for owners, platform-wide
   only for superadmin), behind the new additive `library.read` capability.
3. **Version pinning test passes** — `resolvePinnedReference` semantics
   (pinnedMatches / upgradeAvailable / never mutates the stored pin) are
   unit-tested; snapshot-at-selection is the documented consumer rule (D-031).
4. **Publication can safely retry** — two audited steps with a `publishing`
   claim state; retry reuses the record found by
   `external_reference = capture:<sessionId>` (tested: no duplicate insert),
   and a published session returns its stored result idempotently.

## Honest gaps

- The real Studio configurator selector is deliberately not wired (D-032):
  it belongs with the Stage 9 texture pipeline that gives it renderable
  material assets, and avoids the `App.jsx` collision with the parallel
  Studio UI rebuild. `textureUrl`/`geometryUrl` are reserved in the DTO now.
- No version-history table (D-031): immutability is via consumer snapshot +
  explicit upgrade, matching the platform's freeze-at-save precedent;
  `library_record_versions` is the recorded upgrade path.
- End-to-end browser walkthrough (approve → publish → see it in the
  Published Library list) pending as the human review step.
