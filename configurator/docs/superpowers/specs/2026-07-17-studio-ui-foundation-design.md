# IronWrap Studio UI Foundation Design

**Date:** 2026-07-17  
**Status:** Approved for implementation planning  
**Visual reference:** `02 - UI-UX & Branding/UI Concepts/ui-concept-04-red-direction.png` in the canonical project Google Drive folder

## Purpose

Implement the selected red-direction interface across IronWrap Studio without replacing or weakening the working configurator. The first release establishes the shared design system and delivers the complete Sales Mode experience. Expert Mode, Customer Showroom Mode, Library, and Platform administration will adopt the same foundation in subsequent increments.

IronWrap Capture/Scanner is a separate application. This sprint does not build Scanner UI or scanning behavior. Studio only reserves a future integration point for reviewed Library submissions.

## Approved Product Direction

IronWrap Studio provides context-aware experiences:

- Authenticated owners and contractors enter **Sales Mode**.
- Customer and shared-design links enter **Showroom Mode**.
- Authorized owners and SuperAdmins may switch from Sales Mode to **Expert Mode**.
- SuperAdmin capabilities open a dedicated **Platform workspace** using the same design system.

Mode selection is driven by verified user context and route state. It is not a public three-mode selector. Customer routes cannot expose Expert or Platform controls.

## Experience Principles

- The actual house and its 3D model remain the visual focus.
- Sales Mode feels guided, fast, and customer-friendly.
- Expert Mode supports dense, all-day professional work.
- Showroom Mode feels like a premium home configurator, not estimating software.
- Graphite and warm-neutral surfaces provide structure.
- Red is reserved for primary actions, active selections, progress, and critical metrics; it is not used as a large continuous background.
- Existing behavior is reorganized, not rewritten.

## Implementation Approach

Use a semantic token system plus a new application shell. Existing XML parsing, 3D rendering, pricing, project persistence, sharing, approval, HTML export, and PDF generation remain behind stable component and function boundaries.

A CSS-only reskin is insufficient because it would retain the current navigation and workflow structure. A full frontend rewrite is rejected because it would create unnecessary risk around proven domain behavior.

## First Release Scope

### Included

- Default IronWrap red-direction skin.
- Semantic color, typography, geometry, spacing, elevation, and motion tokens.
- Reusable buttons, fields, cards, navigation, badges, panels, dialogs, and feedback states.
- Context-aware application shell.
- Complete desktop, tablet, and mobile Sales Mode layout.
- Guided Project, Roof, Siding, Trims & Accents, Services, and Review steps.
- Existing 3D viewer integrated as the dominant workspace surface.
- Right-side contextual inspector and persistent estimate summary.
- Authorized Expert Mode entry point, preserving the current expert workspace until its dedicated visual increment.
- Platform navigation entry points governed by existing capabilities.
- A hidden, capability-protected placeholder for future **Import Interface Design** functionality.
- Accessibility and regression verification.

### Excluded

- Scanner/Capture application UI or capture processing.
- Arbitrary interface-skin ZIP upload and activation.
- Full Expert Mode visual redesign.
- Full Showroom Mode visual redesign.
- Full Platform and Library visual redesign.
- Changes to XML/ESX readers, geometry, pricing rules, data schemas, report calculations, or authorization policy.
- Email or SMS provider integration.

## Sales Mode Information Architecture

### Desktop

The shell contains four stable regions:

1. **Top bar:** tenant logo, project selector, save/status feedback, authorized Expert Mode switch, and user menu.
2. **Guided step rail:** Project, Roof, Siding, Trims & Accents, Services, and Review.
3. **3D workspace:** the largest region, containing the current viewer and essential view controls.
4. **Contextual inspector:** controls for the active step, with an estimate summary and primary next action.

Administrative destinations such as Projects, Library, tenant settings, and Platform operations live in application navigation. They do not compete with design controls inside the guided rail.

### Tablet and Mobile

- The step rail becomes a compact progress header.
- The contextual inspector becomes a draggable or expandable bottom sheet.
- The 3D viewer remains the primary surface.
- Estimate and **Next Step** actions remain reachable without permanently covering the model.
- Interactive targets are at least 44 by 44 pixels.

## Guided Step Responsibilities

### Project

- Load generic XML using the existing import behavior.
- Show project/customer information already available to the current user.
- Confirm the active project and model readiness.

### Roof

- Select allowed roof product, profile, and color.
- Apply selections globally or through existing facet overrides.
- Keep model updates immediate.

### Siding

- Select allowed wall product, profile, and color.
- Apply selections globally or through existing facet/elevation behavior.

### Trims & Accents

- Configure existing accessory colors and supported related selections.
- Preserve current design-state serialization.

### Services

- Present locked, included, optional, recommended, and custom services using the existing pricing engine.
- Separate customer-friendly choices from administrative pricing configuration.

### Review

- Show the estimate summary.
- Save or update the project.
- Generate Share Design HTML through the existing flow.
- Generate IronWrap PDF reports through the existing flow.
- Preserve the existing approval workflow and snapshot semantics.

## Mode Resolution and Authorization

The shell resolves its presentation from authenticated user context, capabilities, and public-route state:

- Public customer project or exported Share Design: Showroom Mode.
- Authenticated tenant user: Sales Mode.
- Authorized `platform`/expert capability: Sales Mode with Expert entry point.
- Platform route: capability-gated Platform workspace.

Mode presentation never grants capability. Every privileged API action continues to be authorized server-side. Hiding a control is presentation, not security.

## Design Token Contract

Components consume semantic tokens rather than tenant-specific colors or raw values. Token families include:

- **Color:** action, selection, progress, surfaces, text, borders, focus, and status.
- **Typography:** families, scale, weights, line height, tracking, and case.
- **Geometry:** control heights, padding, border width, radius, icons, cards, fields, and navigation.
- **Spacing and elevation:** density, gaps, shadows, overlays, and z-index tiers.
- **Motion:** duration, easing, hover/selection transitions, and reduced-motion fallbacks.

The default IronWrap skin uses graphite, warm white, concrete gray, realistic material imagery, and restrained red.

Controlled component variants include square, soft, rounded, pill, and angled buttons; flat, outlined, and elevated treatments; compact and comfortable navigation; and soft or structured cards. Platform code owns the safe limits.

## Future Interface-Skin Import Boundary

The first release exposes no active arbitrary upload path. It reserves a hidden **Import Interface Design** entry point for authorized SuperAdmin/development users and defines the future package boundary.

A future package contains:

- `skin.json`
- `theme.css`
- `README.md`
- `preview.png`
- optional approved local assets

Packages contain no JavaScript, remote imports, tracking resources, or unrestricted selectors. They cannot hide, cover, or move protected controls outside platform-safe regions. Packages are versioned, validated, previewed in isolation, activated explicitly, and reversible. Failure or incompatibility falls back to the neutral IronWrap default skin.

Full parsing, validation, persistence, activation, and rollback belong to a separate security-focused milestone.

## Component Boundaries

The UI foundation should introduce small units with stable public interfaces:

- `StudioShell`: resolves layout regions and mode presentation.
- `StudioTopBar`: project, status, mode, and account controls.
- `GuidedStepRail`: navigation and completion state only.
- `ViewerWorkspace`: wraps the existing Viewer3D and current viewer controls.
- `ContextInspector`: hosts one step panel at a time.
- `EstimateDock`: presents existing calculated totals and primary progression.
- Step panels: adapt existing controls without owning domain calculations.
- Theme provider/loader: resolves validated semantic tokens with deterministic fallbacks.
- UI primitives: buttons, inputs, cards, badges, tabs, dialogs, sheets, and feedback.

Domain state remains owned by the existing application during this first increment. Extracting domain state into a new global store is out of scope unless a narrowly targeted extraction is required to prevent duplicated behavior.

## State and Data Flow

1. Authentication and route state determine the presentation mode.
2. The default or assigned validated token set loads before the Studio shell is displayed.
3. The active guided step selects an inspector panel; it does not reset project/design state.
4. Step panels invoke existing handlers and update the existing shared design state.
5. The 3D viewer and pricing summary react through the existing data flow.
6. Switching steps or entering Expert Mode preserves unsaved in-memory changes.
7. Save, share, export, and approval continue through existing API and snapshot contracts.

## Error and Recovery Behavior

- Step-specific errors render inside the contextual inspector near the failed action.
- Recoverable errors include a retry or corrective action.
- Project-wide failures use a shell-level notice without destroying in-memory design state.
- A failed or incompatible skin loads the default IronWrap tokens and records a non-sensitive diagnostic.
- Loading states prevent duplicate writes while keeping model navigation responsive where safe.
- Empty Library choices explain whether no options are available or a filter/tenant selection is active.
- Customer-facing errors never expose internal API, database, tenant, or authorization details.

## Accessibility and Responsive Rules

- Full keyboard operation and visible focus indicators.
- Screen-reader labels for icon-only controls and viewer actions.
- WCAG-compatible contrast for text, controls, focus, and meaningful status.
- Touch targets of at least 44 by 44 pixels for normal interactive controls.
- Reduced-motion behavior for non-essential transitions.
- Focus remains predictable when changing steps, opening dialogs, or expanding the mobile inspector.
- Color is never the only indicator of selection, status, or error.

## Compatibility and Protected Behavior

The following are regression-protected and must remain operational:

- Production and Preview authentication.
- Generic XML import with real-world reports.
- Rotatable 3D model generation.
- Dynamic skins, products, profiles, colors, and facet overrides.
- Roof, wall, slope, facet, and opening identification.
- Measurement and estimate calculations.
- Project save, edit, refresh restoration, and version behavior.
- Public sharing, customer approval, and Share Design HTML export.
- IronWrap-generated PDF reports.
- SuperAdmin capability enforcement and tenant privacy boundaries.
- Library global, all-tenant SuperAdmin, selected-tenant, and tenant-user visibility.

No saved project or design-state format changes are required for this sprint.

## Verification

Automated coverage must include:

- Token defaults and required semantic variables.
- Context-aware mode resolution and capability-gated mode controls.
- Guided-step order, active state, and state preservation.
- UI primitives and accessible naming/focus behavior.
- Responsive shell contracts for desktop, tablet, and mobile.
- Customer routes excluding Expert and Platform controls.
- Existing complete regression suite.
- Production build and Share Design artifact build.

Authenticated Preview verification must cover:

- Owner login opens Sales Mode.
- A real XML project loads and renders correctly.
- All six steps preserve and apply choices.
- The model rotates and supports current surface/facet behavior.
- Estimate changes match the existing engine.
- Save and refresh restore the active project.
- Share Design HTML and PDF generation complete.
- A customer/shared link opens Showroom context without administration.
- An authorized user can enter and leave Expert Mode without losing changes.
- SuperAdmin can open Platform and Library operations.
- Desktop, tablet, and mobile layouts remain usable.

## Delivery Sequence

1. Add token contract, default IronWrap skin, and UI primitives.
2. Add context-aware shell and mode resolver behind a development flag.
3. Build the desktop Sales Mode regions around the existing Viewer3D.
4. Adapt the six guided step panels one at a time.
5. Add tablet/mobile progress header and bottom-sheet inspector.
6. Add Expert and Platform entry points without redesigning those workspaces.
7. Add the inactive, capability-protected Interface Design import placeholder.
8. Run full automated, build, and authenticated Preview verification.
9. Release only after explicit approval.

## Success Criteria

The first UI release is complete when an owner can perform the current end-to-end configurator workflow in the red-direction Sales Mode on desktop and mobile, with the 3D house remaining dominant, no protected behavior regressing, and the shared semantic token foundation ready for subsequent Expert, Showroom, Platform, Library, and tenant-skin increments.
