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

### V1 — Active Delivery Plan (current)

1. Open XML files (existing capability).
2. Apply materials/profiles/colors from Library to the 3D model — either
   pick an existing Library item, **or**, if it's missing, capture it via
   a quick photoshoot (not the full multi-field Passport — a fast path).
3. Share the design/estimate with the client; client can approve or make
   minor changes.

Commercial-grade UI is part of the acceptance bar, not a separate item —
the existing flow is functional but not release-quality.

**Confirmed gap, audited against code, not assumption:** step 2's "apply
from Library" half does not exist. `ProductSelector.jsx` reads a static
prop list; nothing in Studio calls `/api/library/products`. This is the
single largest blocker to closing V1 and is where Claude/Codex work must
converge (see Domain ownership below).

### V2

- PDF report generation — ongoing/expanding effort on top of existing
  jsPDF/QR/snapshot tooling, not a from-scratch build. Needs a defined
  report-template structure.
- Multi-tenant — **confirmed done**: tenant row-scoping enforced in SQL,
  roles, tenant settings/branding, superadmin cross-tenant support.
- Communications (email/SMS) — **confirmed done**: live-verified Twilio
  and SendGrid delivery, scheduled draining, transient-failure handling.
- Showroom mode — exists on the Codex/`chatgpt/*` side
  (`chatgpt/ui-foundation-design`, `chatgpt/configurator-gpt-lab`),
  unmerged into `claude/development`. Not yet verified against
  `main`/`claude/development`.
- API hub (QuickBooks, JobNimbus, etc.) — not started.

### V2.1

Environment/surroundings rendering around the 3D model (currently
renders in empty space).

### V2.2

Free-floating camera — reposition/orbit beyond the current single-pivot
rotation.

### V3

- AI 3D model polisher for configurator-generated geometry realism.
- 3D engine support for importing additional file formats.
- Studio Expert Mode — flagged as a major project on its own, not a V3
  sub-item in practice.

### V3.1

Material takeoff and quantity calculation engine.

### V3.2

Panel/material allocation proposition engine.

### V4

Remaining advanced Scanner/Capture features (Field Pro mode, full
Product Passport, CV-assisted evidence capture, GLB/DXF/PBR asset
generation — the items explicitly deferred out of V1).

Library Knowledge Base.

### V5

Library Community Hub.

### V6

Google Earth and customer-photo integration — present materials/profiles
on a photorealistic 3D model of the customer's actual house from
real-world imagery.

### V7

Cinematic-quality client experience combining the rendering engine,
Library, Google Earth/drone imagery, and real-time product application
on the customer's own house.

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
