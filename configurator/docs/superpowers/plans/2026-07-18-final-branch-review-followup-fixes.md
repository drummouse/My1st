# Final Branch Review Follow-up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three remaining review findings with consistent metric presentation, complete project-menu keyboard entry, and explicit rejection of unsupported shared URL designs.

**Architecture:** Preserve Imperial quantities and prices as the canonical estimator and persistence contract. Convert quantities, unit prices, and labels only through pure helpers in `src/lib/units.js`, then consume those helpers at each named UI and export boundary. Isolate menu focus movement and applied-design validation behind pure, behavior-testable helpers while leaving App as the state owner.

**Tech Stack:** React 18, Vite 5, Node.js built-in test runner, jsPDF.

## Global Constraints

- Do not change canonical saved-design or pricing-engine values.
- Do not publish, deploy, or stage unrelated worktree changes.
- Add failing behavior tests before production edits.
- Preserve legacy Imperial output when no unit system is supplied.

---

### Task 1: Shared metric presentation boundaries

**Files:**
- Modify: `src/lib/units.js`
- Modify: `src/components/ProductSelector.jsx`
- Modify: `src/components/FacetInspector.jsx`
- Modify: `src/components/PriceSummary.jsx`
- Modify: `src/components/ServicesPanel.jsx`
- Modify: `src/lib/exportEstimate.js`
- Modify: `src/lib/exportPdf.js`
- Modify: `src/App.jsx`
- Test: `tests/units.test.mjs`
- Test: `tests/exportEstimate.test.mjs`

**Interfaces:**
- Produces: `displayMeasurement(value, canonicalUnit, system)` returning `{ value, unit }`.
- Produces: `unitPriceToDisplay(value, canonicalUnit, system)` returning a display-only numeric price.
- Consumes: `effectiveUnitSystem` at every named component and export call site.

- [ ] Add pure conversion tests for linear/area quantities and per-unit prices, plus a metric text-export regression.
- [ ] Run the focused tests and confirm failures identify the missing presentation helpers and export unit input.
- [ ] Implement the helpers and wire ProductSelector, FacetInspector, PriceSummary, ServicesPanel, text export, and PDF export without mutating estimator data.
- [ ] Re-run the focused tests and confirm both metric and default-Imperial output pass.

### Task 2: Project-menu keyboard entry

**Files:**
- Create: `src/lib/projectMenuNavigation.js`
- Modify: `src/components/StudioTopBar.jsx`
- Test: `tests/projectMenuNavigation.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: `focusProjectMenuBoundary(menuRoot, edge)` for first/last enabled-item focus.
- Produces: `moveProjectMenuFocus(menuRoot, key, activeElement)` for Arrow/Home/End navigation.

- [ ] Add behavior tests with fake focusable items proving first/last entry and wraparound movement.
- [ ] Run the tests and confirm they fail because the helper module does not exist.
- [ ] Handle ArrowDown/ArrowUp on the disclosure trigger, focus first/last after render, and delegate in-menu movement to the helper.
- [ ] Re-run navigation and shell tests.

### Task 3: Reject unsupported `?d=` startup payloads

**Files:**
- Modify: `src/lib/studioDesignState.js`
- Modify: `src/App.jsx`
- Test: `tests/studioDesignState.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: `requireAppliedDesign(design, message)` returning the design or throwing when application returned null.

- [ ] Add a behavior test proving null is rejected and applied designs pass through unchanged.
- [ ] Run the focused test and confirm it fails before the helper exists.
- [ ] Use the guard in the `?d=` promise chain so unsupported decoded payloads enter the existing safe-notice catch path.
- [ ] Re-run focused tests, the complete suite, artifact/snapshot builds, and diff validation.
- [ ] Review the actual diff, commit only the follow-up files, and perform a fresh post-commit review.
