# IronWrap Three-Mode Workspace Reconstruction Design

**Date:** 2026-07-18

**Status:** Approved for implementation planning

**Authoritative visual reference:** the supplied `IRONWRAP — Estimator UI/UX Concepts` image: Option A Sales Mode, Option B Expert Workspace, Option C Showroom Mode, and their mobile direction

## Purpose

Replace the current presentation with faithful, responsive implementations of all three approved workspace modes. The current release is not acceptable as the target design because it retains the legacy configurator hierarchy and applies mostly graphite/red styling to it. This reconstruction changes the visible shell and composition while preserving the working business and 3D behavior underneath.

## Product Decision

- Authenticated tenant users enter Option A **Sales Mode** by default.
- Entitled authenticated users may enter Option B **Expert Workspace** through the existing tenant entitlement and preference gates.
- Authenticated users enter Option C **Showroom Mode** through a clear **Present to Customer** action from Sales or Expert.
- Public customer and shared-design links open directly in Showroom Mode.
- A clear **Exit Presentation** action returns an authenticated presenter to the exact prior workspace and project state.
- The three options are authoritative for their respective layout, density, hierarchy, visual rhythm, and responsive behavior.
- There is no unrestricted public A/B/C selector. Mode entry follows verified context and workflow.

## Selected Approach

Reconstruct the Sales, Expert, and Showroom shells around existing domain components and handlers.

A CSS-only reskin is rejected because it preserves the incorrect navigation, oversized controls, stacked legacy sections, and document-flow mobile layout. A complete frontend/domain rewrite is also rejected because authentication, projects, design-state restoration, XML import, 3D rendering, pricing, sharing, and exports are working and regression-protected.

The reconstruction introduces three presentation compositions with narrow adapters around the existing state and actions. Domain calculations and persistence contracts remain canonical.

## Option A — Sales Mode Desktop Composition

The authenticated configurator uses four visually stable regions.

### 1. Application Top Bar

- Compact IronWrap logo and wordmark at the left.
- Administrative destinations such as Dashboard, Projects, Estimates, Materials, Customers, and Settings appear as compact application navigation, subject to existing capabilities.
- Current project selector/status appears near the right.
- New Project is a red primary action.
- Account/logout is contained in a compact user menu.
- Project New, Open, Save/Download, and Share remain available through the project dropdown without duplicating large buttons in the workspace.
- Expert Mode appears only under the approved entitlement and tenant-preference gates.

The top bar must not contain the current oversized Menu, Project, and Log out buttons or a second row of large administrative tabs.

### 2. Guided Sales Rail

A dark, narrow left rail presents:

1. Project — Project Details;
2. Roof — Materials & Colors;
3. Siding — Materials & Colors;
4. Trims & Accents — Colors & Styles;
5. Services — Add-ons & Extras; and
6. Review — Estimate & Proposal.

The active step uses IronWrap red. Completed state, step number, title, and short descriptor remain distinguishable without relying on color alone. The rail owns navigation only; changing steps must not reset or rewrite design state.

### 3. Dominant Viewer Workspace

- The existing 3D model remains the largest surface.
- The viewer is framed edge-to-edge inside the center workspace rather than placed below workflow cards.
- A compact overlay toolbar holds essential orbit/pan/zoom or equivalent viewer controls.
- 2D/3D presentation controls remain compact.
- Front, Back, Left, Right, and Top controls remain available without covering the model or inspector.
- Model Positioning is compact/collapsible and never overlaps another viewer control.
- Import/recovery notices are overlays or compact inline notices; they do not create a large document-flow block over the workspace.

### 4. Contextual Inspector

- A warm-white right panel displays only controls relevant to the active step.
- Roof and Siding show manufacturer/product, profile, color swatches, application scope, and a clear red apply action using existing handlers.
- Project shows import and project/customer details.
- Trims & Accents preserves standard and custom rows, company units, quantity, product/profile/color, and locks.
- Services preserves standard, locked, recommended, and custom services.
- Review presents estimate, save/update, Share Design, text/PDF exports, and supported approval behavior.
- A compact estimate and progression area stays reachable without creating a large separate horizontal band above the model.

## Mobile Composition

Option A mobile follows the paired Sales Mode phone reference rather than stacking the entire desktop/legacy interface.

- Compact branded header with a menu button.
- Current step number, title, and descriptor at the top of the active workflow.
- Viewer remains the dominant upper content surface.
- Active material/control content appears as one focused card or expandable inspector, not every configurator panel at once.
- Estimate and **Next Step** remain persistently reachable at the bottom without permanently hiding the model.
- Project and administrative destinations live in an off-canvas/menu surface.
- Viewer direction and positioning controls use compact touch-safe affordances and may collapse into a viewer-controls menu when space requires it.
- Normal interactive targets are at least 44 by 44 CSS pixels.
- Safe-area insets and the browser viewport are respected; no horizontal page overflow is permitted.

Tablet uses the same hierarchy, with a collapsible rail and inspector according to available width.

## Option B — Expert Workspace

Expert Workspace is a purpose-built dense professional layout, not Sales Mode with extra buttons.

### Desktop

- Compact branded application top bar with project context, New Project, and account controls.
- Dark left tool rail for selection, move, rotate, measurement, surface split, plane cut, undo/redo, detailed editing, takeoff, advanced pricing, modifiers, proposals, and team/project tools as those capabilities become implemented.
- The existing 3D viewer dominates the center and supports direct surface/facet interaction.
- A compact viewer toolbar exposes relevant professional model actions.
- A dense right inspector shows selected surface identity, measurements, material/color, overrides, and quick estimate information.
- The estimate/update action remains visible without covering the model.
- Unimplemented Expert tools are visibly marked unavailable or future-facing; they must not pretend to perform actions.

### Mobile and Tablet

- Mobile Expert Mode preserves access to the same implemented capabilities without attempting to display three desktop columns simultaneously.
- The tool rail becomes a compact tool drawer or mode-aware toolbar.
- The selected-surface inspector becomes a focused sheet/card.
- Viewer, selected surface, estimate, and update action remain reachable in a clear sequence.
- Tablet may retain a collapsible tool rail plus inspector when space permits.

Expert entry remains impossible unless both the server-resolved entitlement and tenant **Show Expert Mode** preference pass. SuperAdmins retain hardwired entitlement but still use the presentation preference. Direct route or client-state manipulation cannot grant Expert capability.

## Option C — Showroom Mode

Showroom Mode is a presentation workspace for customer-facing use. It emphasizes the building, material choices, comparison, and estimate or quote action while hiding internal operating complexity.

### Entry and Exit

- Authenticated Sales or Expert users enter through **Present to Customer**.
- Entry records the prior authenticated mode, active workflow context, project identity, design state, and unsaved in-memory state.
- **Exit Presentation** returns to that prior mode and state without reloading or normalizing the project again.
- Public/shared routes enter Showroom directly and do not receive an authenticated exit path into Sales or Expert.

### Desktop

- Large cinematic viewer is the dominant surface.
- A compact left material/category rail exposes customer-safe Roof, Siding, Accents, Doors, Gutters, and other approved visual categories.
- A right estimate/quote card shows only customer-appropriate information and actions.
- Material swatches, before/after comparison, full screen, and supported share/contact actions follow the Option C concept.
- Administrative navigation, internal pricing configuration, project management, locks, diagnostics, and Expert tools are hidden.

### Mobile and Tablet

- The viewer remains dominant.
- Category navigation becomes a compact drawer or horizontal selector.
- Material choices use touch-friendly cards/swatches.
- Estimate and customer-safe primary action remain persistently reachable.
- Authenticated presentation sessions expose a discreet **Exit Presentation** control; public sessions do not expose internal destinations.

## Mode State Contract

- Switching Sales → Expert, Expert → Sales, Sales/Expert → Showroom, and exiting Showroom changes presentation only.
- It must not reset the current project, imported model, design state, selections, facet overrides, estimate, units, or unsaved changes.
- The active Sales step and Expert selection/tool context are retained while another mode is active.
- Showroom may maintain temporary view-only presentation state such as selected comparison or camera view, but may not mutate protected pricing or administration state.
- Mode visibility never grants authorization; protected actions remain enforced by APIs.

## Trims and Services Ownership

### Trims & Accents Only

The following belong exclusively to **Trims & Accents** and must not also appear as Services:

- soffit;
- fascia;
- gutters;
- downspouts;
- garage doors and garage-door trims/capping;
- cap flashing and other trims;
- custom trim additions.

Each supported trim record retains product, profile, color, canonical quantity, company-unit presentation, lock state, and custom additions. Gutter and downspout profile/option choices remain within Trims & Accents.

### Services Only

**Services** represents extras and additional work, including but not limited to:

- additional or specialty snow rails/bars;
- chimney caps;
- strapping or stripping;
- travel;
- custom details and fabricated elements;
- other optional service records supplied later through Library.

Services must not contain duplicate soffit, fascia, gutter, downspout, or other trim toggles/quantities.

### Compatibility and Pricing

- Existing projects with legacy trim fields inside `services`, `measurements`, `accessoryColors`, or `lockedServices` must reopen without loss.
- A single normalization boundary maps those legacy values to canonical Trims & Accents records.
- Estimate calculations consume each trim once. Removing duplicate Services presentation must not remove its price or double-count it.
- Saving a normalized project preserves legacy compatibility fields where required by existing readers while making canonical Trims & Accents authoritative.
- New projects never create duplicated trim-as-service state.
- Future Library service records remain separate from material/trim catalog records and use the standardized optional-service contract.

## Visual System

- Graphite/near-black frames navigation and the workspace.
- Warm white is used for inspector forms and readable information surfaces.
- IronWrap red is reserved for the active workflow step, selected state, primary action, progress, and critical estimate emphasis.
- Typography is compact, strong, and professional; headings must not expand into the oversized mobile text visible in the rejected release.
- Controls use restrained radii, borders, and shadows consistent with the concept.
- Realistic material swatches and the actual 3D model carry visual emphasis.
- Legacy blue, teal, purple, and orange styling is remapped within Sales Mode.
- Disabled controls remain legible and visibly distinct.

## Component Architecture

- `WorkspaceModeResolver`: resolves verified Sales, Expert, authenticated-presentation, or public-Showroom context without granting capability.
- `SalesModeShell`: composes the desktop/tablet/mobile Option A regions.
- `ExpertWorkspaceShell`: composes the implemented Option B tools, viewer, inspector, and responsive surfaces.
- `ShowroomModeShell`: composes Option C customer-safe presentation and distinguishes authenticated presentation from public routes.
- `SalesTopBar`: compact brand, application navigation, project actions, Expert entry, and user menu.
- `SalesStepRail`: ordered guided navigation and completion semantics.
- `SalesViewerWorkspace`: wraps the existing `Viewer3D`, toolbar, camera controls, positioning, and notices.
- `SalesInspector`: responsive active-step panel; right inspector on desktop and focused sheet/card on mobile.
- `SalesEstimateAction`: current estimate, previous/next progression, and step context.
- Step adapters: connect existing Project, Roof, Siding, Trims, Services, and Review components/handlers to the new presentation.

The existing application remains the owner of domain state during this increment. New shell components receive explicit props and callbacks; they do not duplicate pricing, persistence, authorization, or design normalization. Trim/service normalization lives in one domain adapter, not inside visual panels.

## State and Data Flow

1. Verified authentication, entitlement, preference, route context, and presentation session select Sales, Expert, or Showroom.
2. The selected mode renders its Option A, B, or C shell over the same live domain state.
3. Sales workflow step, Expert tool/selection, and Showroom presentation state remain separate UI concerns.
4. Inspector controls call existing handlers or explicit trim/service adapters.
5. Existing design state updates the 3D viewer and pricing engine.
6. Project operations use the existing shared operation lock and restoration guards.
7. Save, Share Design, text/PDF export, and approval retain their existing API and snapshot contracts.
8. Switching mode, responsive layout, or Sales step preserves unsaved state.

## Preserved Behavior

The reconstruction must not change:

- credentials, sessions, environment variables, or authentication policy;
- database ownership or tenant boundaries;
- project save/open/refresh/version semantics;
- design-state and legacy-project compatibility;
- XML/ESX parsing and model generation;
- model rotation, surface selection, facet overrides, and positioning values;
- pricing calculations or canonical Imperial storage;
- company-unit conversion behavior;
- Expert entitlement and preference enforcement;
- authenticated presentation entry/exit and public Showroom isolation;
- single-count trim pricing and legacy trim-project compatibility;
- Share Design HTML, text export, PDF export, or customer approval contracts;
- hidden internal brand capability.

## Administrative Navigation

Settings, Discounts, Custom Services, Materials, Library, Platform, and other authorized destinations are application workspaces. They must not appear as oversized tabs within the guided configurator. Opening one may replace the Sales workspace or use a dedicated application page, but returning to the active project must preserve in-memory design state.

The visible iRoof/IronWrap switch remains removed. Branch/brand capability remains internal for future multi-branch use.

## Error and Recovery Behavior

- Step errors appear inside the relevant inspector near the failed action.
- Shell-level project/import failures use a compact notice without destroying the current design.
- Failed Open, Save, or Share operations retain the current project and provide a retryable message.
- Unsupported shared designs do not silently display fallback content as if successfully loaded.
- Optional catalog failures do not prevent basic project opening or saving.
- Customer-facing errors never expose runtime, environment, database, or authorization internals.

## Accessibility

- All interactive behavior is keyboard-operable.
- Rail steps expose current/completed state semantically.
- Project and user menus use correct menu focus behavior.
- Icon-only viewer controls have visible tooltips and accessible names.
- Focus is visible against graphite and warm-white surfaces.
- Inspector/sheet opening and step changes move or retain focus predictably.
- Meaning is never communicated by red alone.
- Reduced-motion preferences are respected.

## Visual Acceptance Contract

Acceptance is based on screenshot comparison with the supplied concept, not token presence alone.

At minimum, capture and review:

- desktop at approximately 1440 px wide;
- tablet at approximately 1024 px wide;
- mobile at approximately 390 px wide; and
- a narrow mobile viewport at approximately 360 px wide.

The authenticated default must visibly contain the Option A hierarchy: compact top bar, guided left rail on desktop, dominant centered viewer, contextual right inspector, and compact estimate/progression. Entitled Expert must visibly use the Option B professional-tool hierarchy. Presentation and public customer contexts must visibly use the Option C cinematic hierarchy. Each mode must have a deliberate mobile layout rather than a stacked desktop fallback. The legacy large header buttons, large administrative tabs, horizontal estimate band, and document-flow 3D section are explicit rejection conditions.

Exact concept imagery is illustrative; the application must render the real uploaded model and actual catalog data. Pixel-for-pixel copying is not required where live content differs, but hierarchy, proportions, density, and visual language must be recognizably faithful.

## Verification

Automated coverage must include:

- Sales, Expert, and Showroom region composition and absence of rejected legacy shell elements;
- workflow-correct mode entry, Showroom exit restoration, and public-mode isolation;
- guided-step order and state preservation;
- responsive rail/tool/inspector behavior across all three modes;
- accessible navigation and viewer controls;
- project operation availability and shared lock behavior;
- metric/Imperial presentation through inspector and exports;
- Expert gate preservation;
- exclusive Trims ownership for soffit/fascia/gutters/downspouts and absence from Services;
- legacy trim normalization and no double-counted pricing;
- future Library-compatible optional-service contracts;
- complete existing regression suite;
- artifact and Share Design snapshot builds.

Authenticated Preview verification must cover:

- login opens Option A Sales Mode;
- entitled users enter/leave Option B without losing project or unsaved state;
- Present to Customer opens Option C and Exit Presentation restores the prior authenticated workspace;
- public/shared Showroom never exposes Sales, Expert, or administration;
- New/Open/Save/Download/refresh/Share;
- an existing project retains facet/material/color overrides;
- all six steps update the real viewer and estimate;
- company units, exclusive trim controls, and extras-only optional services;
- five camera views and non-overlapping positioning controls;
- Expert visibility combinations;
- Option A, B, and C desktop, tablet, and mobile screenshot comparison;
- keyboard navigation and focus paths.

## Delivery Boundary

This increment is complete only when the Preview is recognizably Option A in Sales, Option B in Expert, and Option C in Showroom; all have deliberate mobile versions; Trims and Services have exclusive correct ownership; and regression-protected behavior remains intact. A graphite/red version of the legacy structure is not completion. PR #17 remains unmerged and Production remains unchanged until authenticated visual and functional acceptance is provided.
