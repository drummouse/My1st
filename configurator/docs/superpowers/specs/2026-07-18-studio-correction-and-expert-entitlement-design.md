# Studio Correction and Expert Entitlement Design

## Goal

Turn the Studio UI foundation into a usable authenticated release by restoring project operations, clarifying Expert Mode access, strengthening the IronWrap red visual direction, and organizing trims, accents, and optional services around the existing configurator data model.

## Release Boundaries

This release includes:

- restoring Save/Download, Share Design, and saved-project opening;
- moving project actions into the Studio project dropdown;
- tenant-level Expert Mode entitlement and visibility controls;
- company-wide Imperial/Metric configuration with a branch-ready fallback model;
- structured Trims & Accents controls;
- structured Optional Services and custom extras;
- removal of the visible iRoof Alberta/IronWrap Exteriors switch;
- compact desktop model-positioning controls;
- redesigned 3D directional view controls; and
- a stronger graphite, warm-white, and IronWrap-red presentation.

This release does not build branch administration, scanning/capture, execute imported interface packages, or add completed advanced Expert Mode tools.

## Expert Mode

### Entitlement

- Each tenant has a hidden boolean entitlement named `EXPERT_MODE_VAR`.
- The tenant entitlement defaults to `false`.
- SuperAdmin access is hardwired to enabled and does not depend on a tenant record.
- Only SuperAdmin may change a tenant's entitlement.
- Normal tenant users cannot write, override, or spoof the entitlement.
- Protected APIs may return the effective entitlement for remote troubleshooting and approved software integrations.
- Tenant-facing APIs return only the effective permission needed by the interface; SuperAdmin administration APIs may return and update the underlying tenant value.

### Tenant Preference

- When the effective entitlement is enabled, tenant Settings displays a `Show Expert Mode` checkbox.
- The checkbox defaults to unchecked and is stored at tenant level.
- When the entitlement is disabled, the checkbox is hidden and its effective value is false.
- The Expert Mode button appears when the user is permitted by role and both the entitlement and tenant preference are enabled.
- SuperAdmins always satisfy the hidden entitlement check and always have access to the `Show Expert Mode` preference; the button still follows that preference so it can be hidden during normal work.
- Existing Expert Mode behavior remains available; future advanced capabilities can be added behind the same access contract.

Authorization is enforced at the resolved-mode and protected-API boundaries. There is no special user-facing error for an unavailable mode because the control is not rendered.

## Project Actions

The project area in the Studio top bar becomes the stable entry point for project operations. Its dropdown contains:

- New Project;
- Open Project;
- Save/Download Project;
- Share Design; and
- project status and identifying information.

Save/Download and Share Design become available when authenticated account defaults have settled. A failure to load optional catalogs must not permanently disable project persistence. Saved-project rows remain openable even while a save-specific prerequisite is settling; opening an existing record must not be gated by the readiness condition for writing a new one.

The interface explains a genuinely temporary disabled state with a bounded status message. It does not leave actions silently inactive.

## Units

- Imperial/Metric is a company-wide setting.
- Projects do not offer a units override.
- The persisted settings structure allows a future branch-specific value.
- Effective units resolve in this order: branch setting when a future assigned branch has one, otherwise company setting.
- No branch-management interface is included in this release.
- Existing stored quantities remain authoritative. The effective unit system controls labels, input presentation, and conversions at the interface boundary.

## Trims & Accents

The Trims & Accents step contains standardized entries for:

- Soffit;
- Fascia;
- Garage Doors;
- Other Trims; and
- tenant-defined additions created through `Add Additional`.

Each entry follows the same interaction pattern as Roofing and Siding where applicable:

- product/material;
- profile;
- color;
- quantity;
- unit derived from effective company units; and
- Lock checkbox.

Linear items use `LF` in Imperial mode and `m` in Metric mode. Area-based items use `sq ft` or `m²` where applicable. The canonical stored value and explicit unit metadata prevent silent reinterpretation when a company setting changes.

Custom additions use the same schema and visual component rather than an unstructured text-only row.

## Optional Services

Optional Services is separate from physical trims and finish selections. It supports tenant-defined services and extras such as:

- travel;
- upgraded or decorative snow bars;
- stripping/removal;
- strapping;
- chimney caps; and
- other custom work.

Each service supports name, description, pricing method, quantity, unit, price, optional/selected state, and Lock where customer editing must be restricted. Existing custom-service data remains compatible and is adapted into the standardized presentation.

## Branding

- Remove the visible iRoof Alberta/IronWrap Exteriors switch from the authenticated Studio UI.
- IronWrap Exteriors is the active presentation for this release.
- Preserve the internal brand-selection capability for future multi-branch, multi-business, and white-label use.
- A future authorized company/branch setting may select branding without restoring an always-visible end-user switch.

## 3D Workspace

### Positioning Controls

On desktop, Model Positioning becomes a compact collapsible control anchored clear of all camera controls. It uses reduced width, tighter spacing, and a bounded scroll/expand treatment when necessary. It must not cover the left directional control at supported desktop sizes.

### Camera Controls

Replace the four oversized `Elevation View` strips with compact, clearly named controls:

- Front;
- Back;
- Left; and
- Right.

Top View uses the same visual language. Controls use a compact dark translucent surface, red active/hover accent, direction icon or short label, accessible name, and a minimum usable target without consuming large portions of the viewport. Their placement remains spatially associated with the corresponding direction while reserving space for Model Positioning.

## Visual Direction

The release must read as the IronWrap Red-Style interface rather than a legacy configurator inside a neutral skeleton:

- graphite framing and navigation;
- warm-white canvas and panels;
- IronWrap red for primary actions, active workflow state, selected controls, progress, and critical metrics;
- restrained borders and elevation;
- consistent Studio buttons, fields, cards, menus, and focus treatment; and
- removal or remapping of visible legacy blue, purple, teal, and orange accents inside Studio.

Red is not used as general decoration or for large background areas.

## Data and API

- Add tenant fields for Expert Mode entitlement and tenant-visible preference using existing migration conventions.
- Add company units using an explicit enum (`imperial` or `metric`).
- Keep the unit resolver branch-ready without requiring a branch table in this release.
- SuperAdmin tenant administration may read/write `EXPERT_MODE_VAR`.
- Tenant Settings may read the effective entitlement and read/write `Show Expert Mode` only when entitled.
- Remote read APIs expose effective values for troubleshooting/integration without exposing unrelated tenant-private data.
- Existing credentials, sessions, project records, and saved design formats remain valid.

## Failure Handling

- Optional catalog failures do not block project opening or permanently block saving.
- Save and Share failures return safe, actionable messages while retaining the current design.
- Unit conversion rejects invalid or unknown unit metadata instead of silently guessing.
- Expert Mode settings endpoints return authorization errors for unauthorized writes.
- The UI never exposes raw runtime, database, or environment details.

## Verification

Automated coverage must verify:

- SuperAdmin hardwired Expert Mode access;
- tenant entitlement and preference combinations;
- unauthorized entitlement writes;
- company-unit resolution and branch-ready fallback;
- project opening independent from save readiness;
- Save/Download and Share Design readiness after account initialization;
- standardized trim and optional-service contracts;
- hidden visible brand switch with internal capability preserved;
- non-overlapping desktop positioning and camera controls; and
- semantic IronWrap red token usage.

Authenticated Preview verification must cover project new/open/save/refresh/share, existing saved projects, Expert Mode visibility combinations, Settings behavior, trims, custom services, desktop 3D controls, and responsive layouts before merge or Production release.
