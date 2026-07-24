# Scanner: Phased, Camera-First UX for Color & Finish and Texture Scans

Date: 2026-07-24
Branch: `claude/scanner-phased-ux` (→ `claude/development`, draft)
Authorization: direct user feedback on the deployed app — "should be clear
steps - point camera at ___ - take a photo... now there are lots of info i
need to fill in a fields that are out of usable screen."

## Problem

`CaptureColorScan.jsx` and `CaptureTextureScan.jsx` (built earlier this
session) were flat single-screen forms — every field visible at once,
requiring scrolling to reach the submit button. This was a real deviation
from this app's own established pattern: the Profile Geometry scan (Slice
R1) already implements a phased, one-screen-one-action flow, matching the
revised spec's §11 requirement ("one task + one primary action per
screen"). The two new scan types simply hadn't been built to match it.

## Scope delivered

Both components restructured into phases, mirroring `CaptureProfileScan.jsx`'s
exact `PHASES` breadcrumb convention (`● Current · Next · Next`) and its
"one action per screen" shape. No backend, API, or field-name changes —
this is purely a client-side restructuring of two existing components.

**`CaptureColorScan.jsx`** — 4 phases:
1. **Photo** — "Point your camera at the color or finish sample." Take
   Photo; auto-advances once the upload finishes.
2. **Sample color** — the photo alone, with "tap the photo where you want
   to sample the color."
3. **Finish** — finish selector + optional manufacturer name/code.
4. **Review & submit** — swatch/hex/finish summary, name the sample, the
   visual-grade disclaimer, completeness, Save Draft / Submit.

**`CaptureTextureScan.jsx`** — 6 phases:
1. **Photo** — "Point your camera at a flat, square-on surface." Auto-
   advances once uploaded.
2. **Scale** — calibration (units, feature, value, ruler confirmation).
3. **Size** — overall width & height.
4. **Orientation** — confirm the visible face + choose the pattern
   direction (jargon reworded: no "material zone" in the copy).
5. **Preview** — "See how this will look once installed" (was "Run
   Technical Compatibility Check").
6. **Review & submit** — name the texture, completeness, Save Draft /
   Submit.

Each phase has a single primary action and a Back button; the photo step
auto-advances once its upload finishes, so "take a photo" reads as one
complete action rather than a form field to fill in.

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 336/336 pass — unchanged, since no field names/API calls changed, only JSX structure and phase gating |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |

## Bug found and fixed during live verification

The first live-verification pass caught a real defect: on both components'
Review phase, `validateCompleteness(detail)` read the last-*persisted*
session/fields. For Color & Finish, the sample/finish/manufacturer/title
only exist in local React state until Save Draft or Submit is clicked
(there's no incremental save step for color sampling, unlike Texture's
calibration/zone/direction, which do save immediately). Texture had the
same issue for its `title` field alone. Result: the Review screen showed
"missing" errors for data the contributor had already entered, and Submit
stayed permanently disabled since it gates on `completeness.errors.length`.

Fixed by folding current local state (title, and for Color the derived
sample) over `detail` before calling `validateCompleteness`, so the
review screen and Submit's disabled check reflect exactly what's about
to be saved — consistent with D-021's shared-pure-module idiom, which
this check already followed server-side.

## Live verification

Playwright against the deployed preview
(`ironwrap-estimator-git-claude-scanne-9ef3a1-drummouses-projects.vercel.app`),
gallery-fallback photo upload, confirms both flows end to end:

- **Color & Finish**: Photo → auto-advance to Sample color → tap-to-sample
  → Finish (select + Continue) → Review (name it) → submit succeeds
  ("Submitted for review with 2 warning(s)" — manufacturer identity is an
  expected warning, not an error). Back-to-captures works.
- **Texture**: Photo → auto-advance to Scale → calibration save/Continue →
  Size save/Continue → Orientation (confirm face + direction)/Continue →
  Preview (real WebGL flat-wall canvas renders)/Continue → Review (name
  it) → submit succeeds ("Submitted for review with 1 warning(s)"). Back
  navigation from Review correctly returns to Preview. Zero console
  errors on this run.
- `npm run smoke` (32/32) against the same preview: all green.

A transient, pre-existing, out-of-scope issue was hit and worked around
during verification, not fixed as part of this slice: this branch's Neon
preview database had never been created before (see the two "Retry
deployment" commits), so its first burst of concurrent cold-start
requests raced non-transactional schema DDL in `ensureSchema()`
(`db.js`) and threw transient 500s on unrelated endpoints (materials,
settings, custom-services). This is a known category of race (each
serverless instance re-confirms schema on its own first cold start) that
settles once all instances' `ensureSchema()` calls resolve; it is not
part of this PR's diff and is left as a separate, pre-existing hardening
item.

## Honest gaps

- The two scan types still don't share a single wizard abstraction (see
  D-077's alternatives-considered) — each owns its own `PHASES` array and
  phase-gating logic, matching `CaptureProfileScan.jsx`'s existing
  precedent rather than introducing a new shared pattern.
