# IronWrap Platform — Master Roadmap

Status: Draft, pending Codex review
Date: 2026-07-24
Owner: joint (Claude session + Codex session), approved by the product owner

## Why this document exists

Planning drifted to the subsystem level: Capture/Scanner received a
detailed 29-section delivery spec
(`configurator/docs/superpowers/specs/2026-07-20-scanner-ux-revision-impact.md`)
and five PRs of UX iteration, while the platform-level question — what
does a contractor actually need to go from XML import to an approved
client estimate — had no single owning document. That spec is correct
and stays authoritative *for Capture*; it was never a platform roadmap
and should not be read as one. This document is the platform level. It
sits above all subsystem roadmaps and above the active delivery plan.

Three tiers, not to be conflated:

1. **This document** — the full domain map and milestone sequence (V1–V7).
   Describes scope and order. Does not itself authorize implementation
   work.
2. **Active Delivery Plan** — whichever milestone is currently authorized
   (today: V1, defined below). Per `CLAUDE.md`'s engineering rule, only
   the explicitly authorized slice gets implemented — nothing from a
   later milestone starts early, no matter how visible it is in this
   document.
3. **Subsystem roadmaps** — detailed specs scoped to one domain (e.g. the
   Capture UX revision spec). Valid within their domain only.

## System model

Four domains, not one. This corrects an implicit assumption (visible in
recent PR history) that Capture was the platform's center of gravity.

| Domain | Responsibility | Current maturity (verified against code, 2026-07-24) |
| --- | --- | --- |
| **Studio** | Main workspace: XML/measurement import → 3D configurator → estimator/pricing → project lifecycle, sharing, and client approval. | Most mature domain. XML import, 3D viewer, materials/colors/services/pricing, project save/share/approve, PDF/HTML/text export all real and working. Material/color/profile selection (`ProductSelector.jsx`) is still bound to a static hardcoded catalog — **not** connected to Library. |
| **Capture** | Optional mobile scanner. Feeds new profiles/colors/textures into Library when the existing catalog is missing something. Not required for normal use. | Draft→review→publish pipeline is real, tested, tenant-isolated. Color & Finish scan is fully usable end to end. Profile Geometry and Texture scans produce stubbed/partial assets (SVG stub, albedo only — no GLB/DXF, no PBR derivatives yet). |
| **Library** | Source of truth for products, profiles, colors, textures, manufacturers, suppliers, catalogs. Shared across tenants where approved. | Schema and publish-side mechanics exist and are tested (`CAPTURE_STUDIO_CONTRACT.md`). Nothing on the consuming side reads it yet — Studio doesn't apply Library products to a project anywhere in the code. |
| **Documents** | Estimates, proposals, PDF/HTML exports, customer approvals. | Baseline export tooling exists (jsPDF, QR codes, Three.js snapshot capture) inside Studio. No dedicated report-template system yet — user has flagged this as an area needing definition and structure, not a from-scratch build. |

Administration, auth, tenancy, branding, and communications (email/SMS)
are shared platform services underneath all four domains, not a fifth
domain and not Capture-specific. Both confirmed built and tested
(tenant row-scoping enforced in SQL; Twilio/SMS and SendGrid email
live-verified against real provider delivery).

## Milestone sequence

Defined by the product owner. V1 has been gap-audited against the
running code; V2–V7 are the owner's intended sequence and have not yet
been individually audited — that happens when each becomes the active
delivery plan.

### V1 — General Estimator (Active Delivery Plan)

Open XML → apply profiles + colors to the 3D model → share the
design/estimate with the client for approval / minor edits.

Full scope and slices live in `MILESTONE_V1_GENERAL_ESTIMATOR.md`; the
model behind it in `DOMAIN_MODEL.md`. In brief, V1 includes:

1. **Open XML** → real-scale 3D model (existing capability).
2. **Colors that look real** — a user-added/captured color carries a
   photographed **render-map**, so surfaces render like real material
   instead of flat SimCity blocks (the render-*apply* side already works;
   the gap is letting user colors carry a texture).
3. **Parametric profile shapes** — the **Quick / parametric** profile
   scan: pick a profile type (standing seam, corrugated, plank …) + size →
   real 3D relief at correct scale, so SnapLock looks like SnapLock. No
   photo-reconstruction (that's V2.1).
4. **Catalog vocabulary fixed** — the "Materials" tab becomes
   **Profiles | Colors**; the Capture tabs collapse from five to the two
   that matter (Quick/parametric Profile + Color & Finish), with Print &
   Pattern and Detailed reconstruction deferred to V2.1.
5. **Share / approve** — client approves or makes minor edits.

Commercial-grade UI is part of the acceptance bar (see the continuous
UI/UX track below), not a separate item.

### V2

- PDF report generation — structured report templates on the existing
  jsPDF/QR/snapshot tooling.
- Multi-tenant — **confirmed done**.
- Communications (email/SMS) — **confirmed done**.
- Showroom mode — exists (merged to production), needs polish.
- API hub — QuickBooks, JobNimbus, GoHighLevel, etc. through one
  integration layer.

### V2.1 — Scanner upgrade (finish the Scanner to full completion)

- **Print & Pattern** capture — woodgrain / stone / marble, i.e.
  directional repeating prints (renamed from the old "Texture" scan).
- **Detailed profile reconstruction** — the full/advanced tier of profile
  capture: real geometry with all parameters, plus generated drawings,
  specs, and CAD docs (fabrication-grade). V1 ships only the
  Quick/parametric profile tier; this completes it.

### V3 — Visual Enhancement, Stage 1

- AI 3D model polisher (realism).
- 3D engine imports additional file formats.
- Environment / surroundings around the 3D model (it currently floats in
  empty space).

### V4 — Studio Expert Mode (a major project on its own)

- Free-floating camera / reposition — part of the Expert Mode interface;
  the viewer currently orbits a single fixed point.
- The advanced estimating / configuration depth Expert Mode adds over the
  General Estimator.

### V4.1 — Material takeoff & quantity calculation engine

### V4.2 — Panel / material allocation proposition engine

### V5 — Library

- Library Knowledge Base — full Product Passport, CV-assisted capture,
  GLB/DXF/PBR asset generation.
- Library Community Hub.

### V6 — Visual Enhancement, Stage 2

Google Earth + customer-photo integration — a photorealistic 3D model of
the customer's *actual* house from real-world imagery.

### V7 — Visual Enhancement, Stage 3

Cinematic client experience — rendering engine + Library + Google Earth +
drone/photos, with real-time product application in high resolution.

## Cross-cutting tracks (not milestone-shaped)

- **UI/UX + usability refinement** runs continuously through **V1–V2** —
  this is how "commercial-grade UI" actually gets built; it is not a
  separate milestone.
- **Closed Alpha testing** ("ready for others") begins **after V2** — the
  point where people beyond the owner start using it, and where the
  platform-hardening work becomes required: versioned schema migrations
  (replacing runtime bootstrap), a security review of the public
  share/approval endpoints + tenant isolation, and data durability.

## Domain ownership (draft — needs Codex agreement)

Proposed to avoid both sides editing the same surface independently,
which has already happened once (Library Core and SuperAdmin foundations
were each built separately on `claude/*` and `chatgpt/*` branches without
coordination).

| Domain | Proposed lane |
| --- | --- |
| Studio UI/UX (including Showroom, Sales Expert mode, 3D rendering/camera) | Codex |
| Capture/Scanner, Library backend and schema | Claude |
| Library → Studio wiring (the V1-blocking gap) | Joint — this is the specific integration point where both lanes meet; needs explicit sequencing, not simultaneous edits, starting with whichever side is further along once Codex's current Studio merge lands |
| Documents/reporting, shared platform services (auth, tenancy, comms) | Not yet assigned |

## Open questions for Codex

1. Does the domain split above match how you'd divide it, especially the
   Studio UI vs. Library-wiring boundary?
2. Is dropping V1's "capture new via quick photoshoot" and "share/approve
   with client" steps down to just "apply existing Library item, save,
   reopen" an intentional narrower first slice, or should V1 stay as
   defined above?
3. Anything in the V2–V7 sequence you'd reorder or flag as already
   further along than listed (e.g. Showroom mode, API hub groundwork)?

## Governing rule

Only the current milestone's exact, written definition authorizes
implementation work. Visibility into later milestones (V2–V7) is for
context and sequencing, not license to start them early — on either
side.
