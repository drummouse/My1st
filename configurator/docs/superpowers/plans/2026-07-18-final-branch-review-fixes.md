# Final Branch Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the final whole-branch review findings without changing established Studio persistence, pricing, entitlement, or customer-sharing behavior.

**Architecture:** Keep project state ownership in `App.jsx`, but make operation coordination and layer replacement explicit instead of deriving destructive resets from render state. Preserve canonical Imperial storage while routing all user-facing quantities through the existing unit helpers. Keep tenant entitlement authorization server-side and conditionally shape the Settings payload in the client.

**Tech Stack:** React 18, Vite 5, Node.js built-in test runner, Vercel Functions, Neon Postgres, CSS custom properties.

## Global Constraints

- Preserve existing credentials, sessions, tenant privacy, project records, and version-2 saved-design compatibility.
- SuperAdmin entitlement remains hardwired; unentitled tenants must not submit the Expert preference.
- Canonical stored dimensions remain Imperial and convert only at UI boundaries.
- Use one shared busy contract for project New/Open/Save/Share/Delete operations.
- Do not publish, deploy, or modify the existing verification milestone worktree change.

---

### Task 1: Settings payload and schema parity

**Files:**
- Modify: `src/components/SettingsPanel.jsx`
- Modify: `db/schema.sql`
- Test: `tests/studioShell.test.mjs`
- Test: `tests/units.test.mjs`

**Interfaces:**
- Produces: a Settings request body that contains `showExpertMode` only when `expertModeEntitled === true`.
- Produces: a manual schema containing the same `unit_system` enum column as `ensureSchema()`.

- [ ] Add source-contract tests asserting the conditional request-body spread and manual unit column.
- [ ] Run the focused tests and confirm they fail for the missing conditions.
- [ ] Build the request payload with `...(form.expertModeEntitled ? { showExpertMode: form.showExpertMode } : {})` and add the idempotent unit DDL to `db/schema.sql`.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Safe saved-design application and shared project-operation locking

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/ProjectsPanel.jsx`
- Modify: `src/lib/studioDesignState.js`
- Test: `tests/startupPersistence.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: `createProjectOperationCoordinator()` with begin/end/current token semantics so stale async operations cannot commit state.
- Consumes: `onOperationBusyChange(boolean)` from `ProjectsPanel` to coordinate local Open/Delete work with top-bar operations.

- [ ] Add failing tests for rejecting a null initial restore, preserving restored facet overrides, and exposing one common operation lock.
- [ ] Run focused tests and confirm failures describe the unsafe restore/reset and split busy state.
- [ ] Remove the unconditional `parsedLayers` override reset; clear overrides only in explicit layer mutation handlers.
- [ ] Guard initial restore identity changes on a truthy restored design.
- [ ] Lift ProjectsPanel Open/Delete busy state through `onOperationBusyChange`, and prevent New/Save/Share while any project operation is active.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Complete metric presentation

**Files:**
- Modify: `src/lib/units.js`
- Modify: `src/components/ServicesPanel.jsx`
- Modify: `src/components/AssemblyAdjustment.jsx`
- Modify: `src/App.jsx`
- Test: `tests/units.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: `displayLength`, `displayArea`, `lengthFromDisplay`, and `areaFromDisplay` boundary helpers.
- Consumes: `unitSystem` in fixed services and model positioning while retaining feet/square-feet canonical state.

- [ ] Add failing conversion and source wiring tests for fixed service quantities and positioning offsets.
- [ ] Run focused tests and confirm failure against hard-coded `LF`, `sqft`, and `ft` presentation.
- [ ] Use conversion helpers in Service rows and Assembly controls; pass `effectiveUnitSystem` from App.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Accessible project disclosure and final verification

**Files:**
- Modify: `src/components/StudioTopBar.jsx`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: a disclosure button with `aria-haspopup="menu"`, a `role="menu"` container, and `role="menuitem"` actions.

- [ ] Change the existing negative accessibility assertion into positive failing assertions.
- [ ] Run the focused shell test and confirm it fails.
- [ ] Add the menu semantics without changing native button behavior.
- [ ] Run focused tests, the full suite, artifact/snapshot build, and `git diff --check`.
- [ ] Review the final diff, preserve unrelated worktree changes, and commit only this fix pass.
