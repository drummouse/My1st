# Studio Workspace Correction Design

**Goal:** Correct the GPT-sandbox Studio experience so it behaves as a compact, viewer-first IronWrap workspace while using Library-backed products/services and preserving a safe public Showroom.

**Scope:** This correction applies to `chatgpt/configurator-gpt-lab`. PR #17 remains unchanged until the corrected workspace passes acceptance.

## Decisions

- Authenticated **Present to Customer** is an editable sales workspace: product, profile, color, and allowed product/service selections may be changed without leaving presentation.
- A public shared Showroom link remains view-only. It receives only safe catalog data and cannot add, remove, or persist products/services.
- The 3D viewer is for configurator and presentation work. Administrative sections are full-screen work areas and do not retain a visible viewer behind them.
- Library-backed selection is the source of truth for selectable products and services. Existing saved project records remain readable and editable through compatibility adapters.
- The approved `ui-concept-04-red-direction.png` is the desktop visual benchmark: compact graphite header/rails, warm work surfaces, restrained red actions, and a dominant 3D stage.

## 1. Immediate Settings Persistence Repair

### Current failure

The GPT runtime log records `PUT /api/settings` failing because a newly inserted tenant settings row supplies `null` for `full_wrap_discount_pct`, `soffit_fascia_discount_pct`, and related required discount defaults. The client reports this as a database-reachability error even though the database is reachable.

### Correct behavior

- The Settings handler always resolves a complete server-owned defaults object before its first scoped upsert.
- Every non-null settings column receives its schema default or a validated request value.
- The API returns an actionable validation/error response; it must not describe a constraint error as a database outage.
- Saving `Show Expert Mode` succeeds when the account has the entitlement, making Expert Mode testable.

## 2. Navigation, Full-Screen Work Areas, and Viewer Lifecycle

### Header menus

- Account and Project menus are anchored overlays below their triggers. Opening one must not change header height, move the layout, or displace the viewer.
- The desktop header is approximately 40% wider than the current constrained treatment, with its wordmark and navigation text scaled proportionally while retaining responsive breakpoints.

### Administrative sections

When Settings, Discounts, Custom Services, Materials, or Platform is selected:

- Render one full-screen administrative workspace below the compact application header.
- Unmount or visually close the 3D stage for that section; do not leave it behind or beside the administrative panel.
- Preserve unsaved configuration state only when it is safe to do so, and make the Back/Close action explicit.
- Returning to Configurator restores the normal Sales/Expert/Presentation workspace and its viewer state.

### Detail panels and mobile containment

- Closing details makes the viewer occupy the released region; no empty gap remains.
- The viewer does not persist beside unrelated panels or administrative screens.
- Mobile sheets, drawers, and positioning controls have an explicit close control, bounded height under the header, and independent scrolling.

## 3. Catalog-Driven Trims, Defaults, and Services

### Trims & Accents

- Each trim row exposes a single **Product** selector. The prior separate Profile control is removed from the UI.
- The selected Product label carries the practical product/profile identity, for example `5 in K-Style Eavestrough` or `3 in Round Downspout`.
- Garage Door Capping is optional and is not included in a new project unless the tenant adds it through defaults or the project trim picker.
- Existing saved `profile` fields remain in compatibility data; their displayed identity is folded into Product until records are resaved through the new selector.

### New-project defaults

- Remove hardcoded Snow Retention, Cap Flashing, and Garage Door Capping switches from the fixed default list.
- Add **Add Product**, a searchable Library picker that can add any permitted product/profile to the company default set.
- Default entries retain library ID, display label, pricing unit, default quantity, color policy, lock state, and enabled state.

### Services

- Replace the Snow Retention-only entry point with **Add Service**.
- Add Service opens a searchable Library picker and permits multiple service/product entries.
- A project service record records its selected Library source, display label, quantity/unit, price snapshot, enabled state, lock state, and custom override metadata.
- Services excludes soffit, fascia, gutters, and downspouts. Those remain Trims-only.

## 4. Authenticated Presentation Controls

- Presentation category controls support Roof, Siding, Accents, Doors, and Gutters when the current catalog/model can support them.
- In authenticated Presentation, the active category provides compatible product/profile selection, color selection, and add/remove controls.
- Changes update the in-memory design and estimate immediately. Normal Save remains an authenticated project operation; public presentation never receives write controls.
- Unsupported geometry or catalog combinations are clearly disabled with an explanation instead of silently hiding state.

## 5. 3D Viewer and Model Positioning

### Desktop

- Replace oversized elevation strips with compact camera controls: Front, Back, Left, Right, and Top.
- Ensure camera controls remain above the viewer and are never covered by the positioning panel.
- Reduce Model Positioning footprint by roughly 20% and keep it in a dedicated non-overlapping viewer corner.
- Use thicker sliders, larger numeric value boxes, and clearly visible increment/decrement controls on the right of each numeric value. Provide large `−` and `+` actions adjacent to the control.

### Mobile

- Positioning opens as a bounded, dismissible bottom sheet below the header.
- The sheet may scroll internally but cannot cover the close control or extend beyond the viewport.
- Closing it restores the full viewer region immediately.

## 6. Visual Acceptance

- Desktop Sales, Expert, and Presentation preserve the concept’s hierarchy: graphite structure, warm-white inspectors, red limited to selection/primary actions/critical estimate emphasis, and a visually dominant 3D stage.
- Avoid document-like stacked blocks in desktop mode. Inspector, rails, material controls, and estimate remain compact and purpose-built.
- Mobile remains a contained workspace with one dominant viewer and one active control sheet rather than a long mixed page.

## Verification

- Regression tests cover default-settings upsert values and the returned error contract.
- Component and visual-contract tests cover anchored header menus, full-screen administrative sections, viewer restoration, mobile positioning close behavior, and non-overlapping directional controls.
- Data tests cover Library picker selection, trim/service boundary enforcement, defaults round-trip, and public Showroom write-control exclusion.
- Run the complete test suite and production/PWA/artifact/snapshot build.
- In the GPT Preview, manually verify Settings save, Expert toggle, project save/load, all three modes, catalog add/remove flows, public Share read-only behavior, desktop 3D overlap, and mobile sheets.
