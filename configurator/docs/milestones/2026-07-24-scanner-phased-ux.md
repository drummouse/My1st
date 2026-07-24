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

## Honest gaps

- Live browser verification of the new phased flows (both scan types, both
  directions of navigation, submit still working end to end) is the
  immediate next step before this can be reported complete — this is a
  pure UI/UX change, so it needs the same rigor as any frontend change per
  the project's standing rule.
- The two scan types still don't share a single wizard abstraction (see
  D-077's alternatives-considered) — each owns its own `PHASES` array and
  phase-gating logic, matching `CaptureProfileScan.jsx`'s existing
  precedent rather than introducing a new shared pattern.
