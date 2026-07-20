# Scanner R2 — Adaptive Profile Capture Technical Proof — Verification

**Branch:** `claude/ironwrap-capture-r2-adaptive-profile` (cut from `claude/development` @ `038394b24ac15731825d45eca689861de1b27325`, replacing the earlier flexible-tags-named placeholder branch, which carried zero commits — decision D-037).

**PR:** [#23](https://github.com/drummouse/My1st/pull/23) — draft, against `claude/development`. Not merged.

**Commits (one per slice, in order):**

| Slice | Commit | Summary |
| --- | --- | --- |
| R2.1 | `ca4e3fa` | Durable local draft + sync-state foundation (`captureLocalStore.js`) |
| R2.2 | `a25fd02` | Evidence durability + asset-level duplicate protection |
| R2.3 | `6844b73` | Deterministic findings integrated into the evidence model |
| R2.4 | `f6a8091` | Claude semantic adaptive guidance (advisory, kill-switched) |
| R2.5 | `2f6530f` | Material-ready schematic proof |
| R2.6 | (this commit) | Material-package subset + side-effect-free Library dry-run |

## Scope authorization

Explicitly scoped to R2 — Adaptive Profile Capture Technical Proof — per
the owner's R2.0 execution authorization. Explicitly **excluded** and not
implemented: flexible tag vocabulary, `item_type`, full geometry-/
dimension-behavior models, Field Pro, Color/Texture capture, full Product
Passport, desktop reviewer redesign, global publication changes, broad
Studio UI changes, or any other R3+ visual/interaction work. The R1
Capture/Library foundation (state machine, tenant row-scoping, capability
enforcement, session idempotency, Blob upload flow, source-asset model,
submission snapshots, review flow, publication flow, Library product/
version IDs, Studio pinning contract, `/api/library/products` DTO,
`buildProfilePreviewSvg()`, the shared client/server evidence policy, and
all existing tests/smoke checks) is preserved unchanged — every R2 addition
is additive.

## What R2 proves

1. **Durable offline evidence** (R2.1–R2.2): accepted photos and draft
   state are written to IndexedDB (native, no dependency) before any
   network attempt; local evidence is pruned only after a server-confirmed
   finalize (`confirmSynced`); an interrupted upload queue rehydrates on
   reload; a finalize retry with the same checksum resolves to the
   existing asset instead of duplicating it; an accepted photo can be
   replaced without ever deleting the original (`superseded_by` lineage).
2. **Deterministic quality signal** (R2.2–R2.3): dependency-free
   sharpness/exposure/glare/crop-sanity estimates and a perceptual-hash
   near-duplicate indication, computed client-side once at accept time,
   surfaced additively in the evidence output without altering the R1
   evidence contract (`phase`/`complete`/`shotRequests`/`confidence`
   provably unchanged by a dedicated test).
3. **Claude semantic adaptive guidance** (R2.4): advisory-only, structured,
   schema-validated, policy-checked (rejects any measurement/geometry/
   permission-shaped field at any nesting depth), versioned, and recorded
   as an immutable per-attempt row separate from deterministic findings,
   user confirmations, and reviewer decisions. Kill-switched off by
   default (`CAPTURE_CLAUDE_GUIDANCE_ENABLED`); no live call happens in
   this session (no `ANTHROPIC_API_KEY` provisioned). Full privacy/
   data-flow decision recorded before writing the integration:
   `docs/CAPTURE_R2_CLAUDE_PRIVACY_DECISION.md`.
4. **Material readiness** (R2.5): the one required `main_visible_face`
   material zone, a texture-direction confirmation, and an honestly
   labelled flat-wall technical compatibility preview — a non-production
   Three.js schematic proportioned from real confirmed measurements, never
   claiming reconstructed geometry or fabrication-grade output, never
   wired into the Studio DTO's `geometryUrl`.
5. **R2 material-package manifest + side-effect-free dry-run** (R2.6): a
   versioned manifest subset with strictly separated namespaces (identity,
   evidence, calibration/measurement, deterministic analysis, Claude
   analysis, reviewer-reserved [empty], material readiness), and a GET-only
   dry-run endpoint proven — by a test whose mock store throws on every
   mutating method — to never write anything. The existing approve→publish
   flow (`capturePublish.js`) is completely untouched.

## Database changes (all additive, applied via `ensureSchema()` + mirrored in `db/schema.sql`)

- `capture_assets.superseded_by uuid references capture_assets(id)` (nullable).
- New table `capture_claude_analyses` (append-only; `findings` only populated for `status='advisory'`; no image bytes stored).
- `capture_sessions.material_zone_state jsonb`, `capture_sessions.texture_direction text` (CHECK-constrained, nullable), `capture_sessions.studio_validation jsonb` (all nullable).

No destructive changes. No changes to `capture_sessions.category`, `capture_type`, or any existing CHECK constraint's allowed-values list. No production migration run — this only ever touches the branch's isolated Neon preview via runtime `ensureSchema()`.

## API additions (all inside the existing consolidated `/api/capture` function — still 11 of 12 Vercel slots)

`asset.replace`, `claude.guidance`, `materialZone`, `textureDirection`, `studioValidation`, `materialPackage.dryRun` — all capability `capture.create`, all row-scoped, all with a smoke-guard and a route-contract test verifying capability map + `vercel.json` rewrite ordering + schema presence.

## Environment changes

- `CAPTURE_CLAUDE_GUIDANCE_ENABLED` — new, defaults `false` in every environment (nothing in this branch sets it to `true`). Evaluated server-side only.
- `ANTHROPIC_API_KEY` — new, required alongside the flag above for the live Claude path; **not provisioned anywhere in this session**. No secret values committed.

Both documented in full in `docs/CAPTURE_R2_CLAUDE_PRIVACY_DECISION.md` and decision D-043.

## Dependencies

**Zero new npm dependencies.** Native `indexedDB`, native canvas pixel access, direct server-side `fetch` for the Anthropic API (no SDK), the existing `three` dependency for the flat-wall preview. Every place a dependency might have been reached for (image resize for Claude's input, a shot-request table, a deterministic-findings table) was deliberately avoided — see decisions D-040, D-043, D-044.

## Tests

221/221 passing (151 R1 baseline + 70 new across R2.1–R2.6):

- `tests/captureLocalStore.test.mjs` (10) — storage contract, rehydration, confirmation-before-prune, duplicate prevention, sync-state derivation.
- `tests/captureImageQuality.test.mjs` (8) — deterministic sharpness/exposure/frame-variance/hash math.
- `tests/captureAssets.test.mjs` (+9 R2.2 tests) — checksum idempotency, supersession lineage, requested-pose persistence, route contract.
- `tests/captureScanner.test.mjs` (+9 R2.2/R2.3/R2.5 tests) — superseded-asset exclusion from evidence/completeness, quality-finding surfacing without touching confidence, material-zone/texture-direction/studio-validation orchestration.
- `tests/captureClaudePolicy.test.mjs` (11) — request builder, response schema validation, forbidden-field rejection at any nesting depth, shot-request completeness.
- `tests/captureClaudeClient.test.mjs` (10) — kill-switch gating, timeout/error/invalid handling, image cap, never-throws guarantee.
- `tests/captureClaudeGuidance.test.mjs` (6) — service orchestration, tenant isolation, route contract.
- `tests/captureMaterialPackage.test.mjs` (6) — manifest namespace separation, stable dry-run errors.
- `tests/captureMaterialPackageDryRun.test.mjs` (5) — **enforced** (not just asserted) side-effect-freedom, tenant isolation, route contract.
- `tests/libraryDocumentation.test.mjs` — updated to pin the corrected (no longer stale) `CAPTURE_LIBRARY_HANDOFF.md` wording.

`npm run build`: succeeds at every slice checkpoint.

## Live smoke evidence

| Slice | Preview | Result |
| --- | --- | --- |
| R2.1 | `ironwrap-estimator` (commit `ca4e3fa`) | 20/20 |
| R2.2 | `ironwrap-estimator` (commit `a25fd02`) | 21/21 |
| R2.3 | `ironwrap-estimator` (commit `6844b73`) | (build succeeded; not independently re-run — no API-surface change since R2.2's 21/21) |
| R2.4 | `ironwrap-estimator` (commit `f6a8091`) | 22/22 |
| R2.5 | `ironwrap-estimator` (commit `2f6530f`) | 25/25 |
| R2.6 | `ironwrap-estimator` (this commit) | to be recorded once the preview is READY — see PR #23 for the live result |

All smoke runs are unauthenticated-401-guard checks (matching the existing 100%-guard-style smoke suite) plus app-shell/database-health checks — consistent with the pre-R2 smoke baseline.

## Browser acceptance (binding correction #12)

`docs/CAPTURE_R2_BROWSER_VERIFICATION.md` defines the required manual
checklist (draft survives refresh/close-reopen, upload queue resumes,
confirmation-before-prune, duplicate-upload protection, "Saved on device"
honesty). **Not yet executed** — this requires a human (or a browser-
automation session this text-only session doesn't have) driving an
authenticated preview through an actual capture flow. Recorded here as a
known limitation, not silently skipped.

## Known limitations (honest, not hidden)

- Capturing Claude's suggested shot reuses the ordinary camera flow
  manually — no dedicated one-tap "capture this Claude shot" affordance
  yet (would require widening the asset `purpose` enum or a slug-based
  scheme for arbitrary Claude-authored view names; deferred as a
  reasonable R2.4 scope boundary, documented in that slice's commit).
- The Google Drive copy of `14 - Capture Scanner Library Handoff.md`
  could not be edited in place (no available tool writes to an existing
  Drive file's content) — the repository's own copy,
  `configurator/docs/CAPTURE_LIBRARY_HANDOFF.md`, is the corrected "active
  replacement," per the binding correction's own fallback wording.
- Manual browser acceptance testing (binding correction #12) is not yet
  executed — see above.
- R2.3's smoke run was not independently re-executed (no new API surface
  in that slice beyond R2.2's) — flagged rather than silently assumed
  identical.

## Deferred to R3+ (confirmed unauthorized, not attempted)

Flexible tag vocabulary and `item_type`; full geometry-/dimension-behavior
model; Field Pro; Templates; Color Capture; Texture Capture; Material
Capture; Product/Object Capture; full Product Passport; desktop reviewer
workspace redesign; final Capture Home/navigation/camera styling; complete
production PBR pipeline; advanced geometry reconstruction; full
fabrication-grade workflow; global Library publication changes; broad
Studio interface changes.

## Genuine blockers

None. Every slice landed within the authorized scope, zero new
dependencies, zero new function slots, zero production changes.
