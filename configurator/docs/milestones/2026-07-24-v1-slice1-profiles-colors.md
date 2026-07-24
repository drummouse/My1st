# V1 Slice 1 — "Materials" tab → "Profiles & Colors" + Capture tab collapse

Milestone: **V1 — General Estimator**, Slice 1 (see
`docs/MILESTONE_V1_GENERAL_ESTIMATOR.md`).
Decisions: **D-079**, **D-080** (`docs/CAPTURE_DECISION_LOG.md`).
Authorization: owner — "kick it" / "go" to build Slice 1.

## Why

The canonical model is **Material = Profile + Color** (`DOMAIN_MODEL.md`),
where "Material" is only an umbrella/folder term. The admin catalog still
labeled the priced primitive "Material" and the Capture workspace still
offered five overlapping scan types that over-promised for V1. Slice 1 is
the deliberately small, low-risk vocabulary alignment that proves the
build → verify → promote pipeline end to end.

## What changed (shallow relabel + collapse — no data model change)

**Catalog vocabulary — "Materials" → "Profiles & Colors"**
- `App.jsx` — admin nav tab label `Materials` → `Profiles & Colors`
  (internal `key: 'materials'` unchanged; routing/section logic untouched).
- `GuidedStepRail.jsx` + `SalesModeShell.jsx` — the roof/siding guided
  step descriptor `Materials & Colors` → `Profiles & Colors`.
- `MaterialsPanel.jsx` — left library relabeled "Material" → "Profile":
  panel header, folder tree ("All Profiles"), section header, field label,
  the "Add a profile" form, the "Add Profile" button, and the status
  flashes. The right-hand **Colors** library is unchanged.
- `MaterialsPanel.jsx` — the **"Profiles (comma-separated, optional)"
  input was removed** from the add-profile form; `profiles` dropped from
  `blankMaterialForm` and the create POST body. The `materials.profiles`
  **DB column, API read/write, and the configurator's profile picker are
  left intact** (additive-only rule) — only the admin input for setting it
  is retired, since Slice 1b will make the configurator pick a Profile
  directly.

**Capture tabs — five create options collapsed to the two V1 types**
- `CapturePanel.jsx` — new-capture buttons now render only
  `Quick Profile scan` (`quick`, relabeled from "Quick capture") and
  `Color & Finish scan` (`color_finish`), via a new `V1_CAPTURE_TYPE_IDS`
  list. `profile_geometry`, `texture`, and `guided_product` remain defined
  in `CAPTURE_TYPES` so existing sessions still open and label correctly,
  but are no longer offered for new captures. A sublabel notes advanced
  scans arrive in a later version.

## Verification

- `npm test` — **653/653 pass** (local).
- `npm run build` — clean.
- Deployed-preview smoke (`npm run smoke` against the PR preview) — _pending
  preview build; results appended after the Vercel preview is live._
- Live Playwright pass on the preview — _pending; results appended._

## Deferred (recorded so it isn't rebuilt early)

- Slice 1b: make Profile the first-class primitive end-to-end (configurator
  picks a profile directly; touches estimate/design-state).
- Detailed profile reconstruction + Print & Pattern scans → V2.1.
- Guided product capture → dropped.
