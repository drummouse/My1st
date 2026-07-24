# Scanner Slice R1 — Guided Profile Geometry Scan Verification

Date: 2026-07-20
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (PR #21 → `claude/development`)
Commit verified: `f9a34c6`
Authorization: the revised spec's first vertical slice only (§20 of
`2026-07-20-scanner-ux-revision-impact.md`); no further revised-roadmap work.

## Scope delivered

A contributor starts a Profile Geometry scan, completes calibration (units +
one user-confirmed known measurement + mandatory ruler-adjacency
confirmation), captures the four guided initial views with full-contract
prompts, receives one deterministic adaptive follow-up request (back view),
records confirmed measurements with provenance, sees an honestly-labelled
measured SVG cross-section schematic with an evidence-confidence score, and
submits through the existing validated snapshot flow as tenant-private
pending review. Zero new dependencies; zero new function slots.

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 151/151 pass (11 new R1 tests) |
| `npm run build` | Succeeds (client bundles the shared evidence module) |
| `npm run smoke` against the live PR preview (deployment `4E76Dq9MqWwj7Evg69a27vtLKb3m`, READY) | 20/20 pass, including the new unauthenticated evidence guard |
| Additive DDL (`capture_measurements`, widened CHECKs) | Applied by `ensureSchema()` to the isolated Neon preview branch (`database health` reachable post-deploy); production untouched |

## Revised-spec §20 acceptance status

1–3. Start scan, calibration setup, guided initial views — implemented and unit-tested. ✔
4–5. Source images with shot labels + evidence via the existing upload pipeline (originals + thumbnails preserved). ✔
6–7. Missing-view identification and the exact-prompt additional-shot card ('back': position, angle, distance, orientation, feature, ruler, reason) — deterministic, tested. ✔
8–9. Draft auto-save/resume without loss or duplicate — existing idempotency; sync pill uses the §15 vocabulary. ✔
10. Measured profile preview + confidence — SVG schematic from confirmed
    width/height with deterministic evidence score (no reconstruction
    claims, D-036). ✔
11. Submission validates as tenant-private pending review — existing
    submit/snapshot; profile completeness requires calibration + coverage +
    measurement and deliberately no hard category. ✔
12. Tenant isolation and the full smoke suite pass. ✔

## Honest gaps

- Adaptive analysis is a deterministic checklist, not computer vision —
  blur/glare/marker detection are declared evidence flags for later CV
  sources (D-034). The prompt contract will not change when they arrive.
- The preview is a dimensioned schematic, not reconstructed geometry;
  parametric/SVG/DXF/GLB outputs belong to later authorized slices.
- Phone-browser walkthrough of the full scan loop pending as the human
  review step, as with prior stages.
