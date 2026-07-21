# IronWrap Three-Mode Workspace Reconstruction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver faithful responsive Option A Sales, Option B Expert, and Option C Showroom workspaces while preserving the working configurator and making Trims and Services mutually exclusive domains.

**Architecture:** Keep `App.jsx` as the owner of canonical project/design state and existing business handlers. Add a small workspace-mode controller and three focused shell compositions that consume explicit view-model props. Move legacy trim compatibility into one normalization boundary so UI panels and pricing consume canonical trims once, while Services contains only extras.

**Tech Stack:** React 19, Vite, Three.js through the existing `Viewer3D`, CSS custom properties and responsive media queries, Node test runner, server-rendered React tests, existing Vercel API routes and design snapshot contracts.

## Global Constraints

- The supplied IronWrap concept image is the visual authority: Option A for Sales, Option B for Expert, Option C for Showroom.
- All three modes require deliberate desktop, tablet, and mobile layouts; a stacked desktop fallback is not acceptable.
- Existing credentials, environment variables, authentication policy, database ownership, tenant boundaries, project records, and saved-design formats remain unchanged.
- Existing XML/ESX parsing, model generation, facet overrides, pricing rules, canonical Imperial persistence, unit conversion, project operations, Share Design, PDF/text export, and approval contracts remain regression-protected.
- Expert entry requires the server-resolved entitlement and tenant `Show Expert Mode` preference; presentation state never grants capability.
- Authenticated Showroom is entered through `Present to Customer`; `Exit Presentation` restores the exact prior workspace and in-memory state.
- Public/shared Showroom never exposes Sales, Expert, or administrative entry points.
- Soffit, fascia, gutters, downspouts, garage-door trim/capping, flashing, and custom trims appear only in Trims & Accents and are priced once.
- Services contains only extras and future Library optional-service records.
- PR #17 remains unmerged and Production remains unchanged until explicit authenticated visual and functional approval.

---

## File Structure

### New mode and presentation units

- `src/lib/workspaceMode.js` — pure verified mode transitions and presentation return-state contract.
- `src/components/workspaces/SalesModeShell.jsx` — Option A composition only.
- `src/components/workspaces/ExpertWorkspaceShell.jsx` — Option B composition only.
- `src/components/workspaces/ShowroomModeShell.jsx` — Option C composition only.
- `src/components/workspaces/WorkspaceTopBar.jsx` — shared compact application/project/account header.
- `src/components/workspaces/ViewerStage.jsx` — existing viewer plus compact viewer tools/camera/positioning slots.
- `src/components/workspaces/MobileWorkspaceHeader.jsx` — compact mode-aware mobile header.
- `src/styles/workspace-modes.css` — semantic geometry and responsive layout for the three shells.

### Trim/service boundary

- `src/lib/trimServiceBoundary.js` — canonical split, legacy normalization, and de-duplication.
- `src/components/TrimsPanel.jsx` — sole visual owner of standard/custom trims, including gutters/downspouts.
- `src/components/ExtrasServicesPanel.jsx` — extras-only service UI using existing optional-service records.

### Existing integration points

- `src/App.jsx` — composes mode view models and existing handlers without duplicating domain state.
- `src/components/ServicesPanel.jsx` — reduced to compatibility wrapper or removed after callers migrate.
- `src/components/StudioTopBar.jsx`, `GuidedStepRail.jsx`, `ContextInspector.jsx`, `ViewerWorkspace.jsx`, `EstimateDock.jsx` — reuse useful behavior through new shells; delete only when no callers remain.
- `src/lib/designState.js`, `src/lib/newProjectDesignState.js`, `src/lib/pricingEngine.js` — consume the canonical trim/service boundary while retaining snapshot compatibility.
- `src/index.css`, `src/styles/studio-shell.css` — remove or scope legacy rules that conflict with the new shells.

### Tests

- `tests/workspaceMode.test.mjs`
- `tests/trimServiceBoundary.test.mjs`
- `tests/salesModeShell.test.mjs`
- `tests/expertWorkspaceShell.test.mjs`
- `tests/showroomModeShell.test.mjs`
- `tests/workspaceResponsive.test.mjs`
- existing persistence, pricing, export, units, shell, security, and accessibility suites.

---

### Task 1: Verified Workspace Mode State Machine

**Files:**
- Create: `configurator/src/lib/workspaceMode.js`
- Create: `configurator/tests/workspaceMode.test.mjs`
- Modify: `configurator/src/lib/studioMode.js`

**Interfaces:**
- Consumes: `{ authenticated, publicShowroom, expertEntitled, showExpertMode }` verified context.
- Produces: `resolveWorkspaceMode(context)`, `enterExpert(state)`, `enterPresentation(state)`, and `exitPresentation(state, verifiedContext)` returning immutable workspace-state objects. `verifiedContext` contains current server-resolved `authenticated`, `expertEntitled`, and `showExpertMode` values; browser state is never authorization evidence.

- [ ] **Step 1: Write failing transition and authorization tests**

```js
test('authenticated users start in sales and public routes start in showroom', () => {
  assert.equal(resolveWorkspaceMode({ authenticated: true }), 'sales');
  assert.equal(resolveWorkspaceMode({ publicShowroom: true }), 'showroom');
});

test('expert entry is closed unless both gates pass', () => {
  assert.throws(() => enterExpert({ mode: 'sales', expertEntitled: true, showExpertMode: false }), /unavailable/i);
  assert.equal(enterExpert({ mode: 'sales', expertEntitled: true, showExpertMode: true }).mode, 'expert');
});

test('presentation exit restores the exact prior authenticated mode', () => {
  const shown = enterPresentation({ mode: 'expert', authenticated: true });
  assert.equal(exitPresentation(shown, {
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
  }).mode, 'expert');
});

test('presentation exit falls back to Sales when current Expert gates no longer pass', () => {
  const shown = enterPresentation({ mode: 'expert', authenticated: true });
  assert.equal(exitPresentation(shown, {
    authenticated: true,
    expertEntitled: false,
    showExpertMode: true,
  }).mode, 'sales');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd configurator && node --test tests/workspaceMode.test.mjs`

Expected: FAIL because `workspaceMode.js` does not exist.

- [ ] **Step 3: Implement immutable, closed-by-default transitions**

```js
export function enterPresentation(state) {
  if (!state.authenticated) return { ...state, mode: 'showroom', returnMode: null, presentationSource: 'public' };
  return { ...state, mode: 'showroom', returnMode: state.mode, presentationSource: 'authenticated' };
}

export function exitPresentation(state, verifiedContext) {
  if (!verifiedContext?.authenticated || state.mode !== 'showroom' || state.presentationSource !== 'authenticated') {
    throw new Error('Presentation cannot return to an authenticated workspace');
  }
  const expertAllowed = verifiedContext.expertEntitled === true && verifiedContext.showExpertMode === true;
  const returnMode = state.returnMode === 'expert' && expertAllowed ? 'expert' : 'sales';
  return { ...state, mode: returnMode, returnMode: null, presentationSource: null };
}
```

Implement `resolveWorkspaceMode` and `enterExpert` with explicit enum validation, verified authentication, and both Expert gates. Treat `returnMode` only as a presentation preference: current verified context decides whether an Expert return is allowed. Add tests showing forged/public state cannot restore an authenticated workspace and revoked Expert access returns to Sales.

- [ ] **Step 4: Run focused and existing Expert tests**

Run: `cd configurator && node --test tests/workspaceMode.test.mjs tests/studioMode.test.mjs tests/tenantFeatures.test.mjs`

Expected: PASS with no entitlement regression.

- [ ] **Step 5: Commit**

```bash
git add configurator/src/lib/workspaceMode.js configurator/src/lib/studioMode.js configurator/tests/workspaceMode.test.mjs
git commit -m "feat: define verified workspace mode transitions"
```

### Task 2: Canonical Trims and Extras Boundary

**Files:**
- Create: `configurator/src/lib/trimServiceBoundary.js`
- Create: `configurator/tests/trimServiceBoundary.test.mjs`
- Modify: `configurator/src/lib/designState.js`
- Modify: `configurator/src/lib/newProjectDesignState.js`
- Modify: `configurator/src/lib/pricingEngine.js`
- Modify: `configurator/tests/trimAccents.test.mjs`
- Modify: `configurator/tests/optionalServices.test.mjs`

**Interfaces:**
- Consumes: legacy `services`, `measurements`, `accessoryColors`, `lockedServices`, canonical `trimAccents`, and `customServiceLines`.
- Produces: `normalizeTrimServiceBoundary(input)` returning `{ trimAccents, extraServices, compatibility }`; `isTrimServiceKey(key)`; and `projectExtrasOnly(services)`.

- [ ] **Step 1: Write failing legacy, new-project, and pricing de-duplication tests**

```js
test('legacy trim service flags normalize to trims and are excluded from extras', () => {
  const result = normalizeTrimServiceBoundary({
    services: { soffit: true, gutters: true, chimneyCaps: true },
    measurements: { soffitSqft: 100, gutterLf: 40 },
  });
  assert.deepEqual(result.extraServices, { chimneyCaps: true });
  assert.equal(result.trimAccents.find((row) => row.kind === 'soffit').quantity, 100);
  assert.equal(result.trimAccents.find((row) => row.kind === 'gutters').quantity, 40);
});

test('new project state never creates trim keys in services', () => {
  const state = createNewProjectDesignState(defaults);
  for (const key of ['soffit', 'fascia', 'gutters', 'downspouts']) assert.equal(key in state.services, false);
});
```

Add a pricing fixture proving a legacy soffit/gutter project produces the same total before normalization and is not counted twice when both legacy and canonical fields exist.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd configurator && node --test tests/trimServiceBoundary.test.mjs tests/trimAccents.test.mjs tests/optionalServices.test.mjs tests/pricingEngine.test.mjs`

Expected: FAIL on missing boundary and duplicated trim service keys.

- [ ] **Step 3: Implement one authoritative split**

```js
const TRIM_SERVICE_KEYS = new Set([
  'soffit', 'fascia', 'gutters', 'downspouts', 'garageDoorCapping', 'capFlashing',
]);

export const isTrimServiceKey = (key) => TRIM_SERVICE_KEYS.has(key);

export function projectExtrasOnly(services = {}) {
  return Object.fromEntries(Object.entries(services).filter(([key]) => !isTrimServiceKey(key)));
}
```

Build canonical trims through existing `normalizeTrimAccents`, add gutters/downspouts to its standard record contract, and preserve required legacy compatibility projection only at save/export boundaries.

- [ ] **Step 4: Route design capture/new-project/pricing through the boundary**

Ensure canonical trim records win over legacy duplicates, pricing reads each trim once, and extras pricing continues through existing optional-service lines.

- [ ] **Step 5: Run focused persistence/pricing tests**

Run: `cd configurator && node --test tests/trimServiceBoundary.test.mjs tests/trimAccents.test.mjs tests/optionalServices.test.mjs tests/designState.test.mjs tests/newProjectDesignState.test.mjs tests/pricingEngine.test.mjs`

Expected: PASS; representative legacy totals remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/lib/trimServiceBoundary.js configurator/src/lib/designState.js configurator/src/lib/newProjectDesignState.js configurator/src/lib/pricingEngine.js configurator/tests
git commit -m "fix: separate canonical trims from extra services"
```

### Task 3: Dedicated Trims and Extras Panels

**Files:**
- Create: `configurator/src/components/TrimsPanel.jsx`
- Create: `configurator/src/components/ExtrasServicesPanel.jsx`
- Create: `configurator/tests/trimsAndExtrasPanels.test.mjs`
- Modify: `configurator/src/components/ServicesPanel.jsx`
- Modify: `configurator/src/components/TrimAccentRow.jsx`

**Interfaces:**
- `TrimsPanel({ records, onChange, unitSystem, readOnly })` owns all trim rows and gutter/downspout options.
- `ExtrasServicesPanel({ services, customServiceLines, catalog, locks, onChange })` renders extras only and rejects trim keys.

- [ ] **Step 1: Write failing rendered-content tests**

```js
test('Trims owns soffit fascia gutters and downspouts', () => {
  const html = renderToStaticMarkup(<TrimsPanel records={fixtureTrims} unitSystem="imperial" />);
  for (const label of ['Soffit', 'Fascia', 'Gutters', 'Downspouts']) assert.match(html, new RegExp(label));
});

test('Services renders extras without trim labels', () => {
  const html = renderToStaticMarkup(<ExtrasServicesPanel services={fixtureExtras} catalog={catalog} />);
  assert.match(html, /Chimney Caps/);
  assert.doesNotMatch(html, /Soffit|Fascia|Gutters|Downspouts/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/trimsAndExtrasPanels.test.mjs`

Expected: FAIL because the new panels do not exist.

- [ ] **Step 3: Extract the two panels without duplicating state**

Move trim rendering and option selectors into `TrimsPanel`. Move custom/recommended/locked optional lines into `ExtrasServicesPanel`. Keep `ServicesPanel` temporarily as a thin compatibility composition only while App callers migrate.

- [ ] **Step 4: Add an input guard to extras**

```js
const extras = Object.fromEntries(
  Object.entries(services || {}).filter(([key]) => !isTrimServiceKey(key)),
);
```

The guard prevents accidental duplicate presentation even for a legacy caller.

- [ ] **Step 5: Run panel, trim, units, and optional-service tests**

Run: `cd configurator && node --test tests/trimsAndExtrasPanels.test.mjs tests/trimAccents.test.mjs tests/units.test.mjs tests/optionalServices.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/components/TrimsPanel.jsx configurator/src/components/ExtrasServicesPanel.jsx configurator/src/components/ServicesPanel.jsx configurator/src/components/TrimAccentRow.jsx configurator/tests/trimsAndExtrasPanels.test.mjs
git commit -m "feat: split trims from extra services panels"
```

### Task 4: Shared Workspace Frame and Viewer Stage

**Files:**
- Create: `configurator/src/components/workspaces/WorkspaceTopBar.jsx`
- Create: `configurator/src/components/workspaces/ViewerStage.jsx`
- Create: `configurator/src/components/workspaces/MobileWorkspaceHeader.jsx`
- Create: `configurator/src/styles/workspace-modes.css`
- Create: `configurator/tests/workspaceFrame.test.mjs`
- Modify: `configurator/src/main.jsx`

**Interfaces:**
- `WorkspaceTopBar({ mode, logoUrl, project, actions, navigation, account, onPresent, onExitPresentation })`.
- `ViewerStage({ viewer, toolbar, cameraControls, positioning, notice, mode })`.
- `MobileWorkspaceHeader({ mode, step, onMenu, onExitPresentation })`.

- [ ] **Step 1: Write failing semantic structure tests**

Assert one compact banner, named project/user menus, a main viewer region, no legacy `.app-nav` output, and public Showroom omission of internal actions.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/workspaceFrame.test.mjs`

Expected: FAIL on missing components.

- [ ] **Step 3: Implement focused shared components**

Use semantic `<header>`, `<nav>`, `<main>`, and named controls. Reuse the existing project-operation lock and menu-navigation helper through callbacks rather than reimplementing them.

- [ ] **Step 4: Establish layout tokens and guarded selectors**

```css
.workspace-root {
  --workspace-topbar-h: 3.25rem;
  --workspace-rail-w: 15rem;
  --workspace-inspector-w: 21rem;
  min-height: 100dvh;
  background: var(--studio-surface-graphite);
}
```

Scope all new rules under `.workspace-root`; do not globally restyle legacy administrative pages.

- [ ] **Step 5: Run frame and accessibility tests**

Run: `cd configurator && node --test tests/workspaceFrame.test.mjs tests/accessibility.test.mjs tests/studioShell.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/components/workspaces configurator/src/styles/workspace-modes.css configurator/src/main.jsx configurator/tests/workspaceFrame.test.mjs
git commit -m "feat: add shared three-mode workspace frame"
```

### Task 5: Option A Sales Mode Shell

**Files:**
- Create: `configurator/src/components/workspaces/SalesModeShell.jsx`
- Create: `configurator/tests/salesModeShell.test.mjs`
- Modify: `configurator/src/components/GuidedStepRail.jsx`
- Modify: `configurator/src/components/EstimateDock.jsx`
- Modify: `configurator/src/styles/workspace-modes.css`

**Interfaces:**
- `SalesModeShell({ topBar, steps, activeStep, onStepChange, viewerStage, inspector, estimate, onPrevious, onNext })`.

- [ ] **Step 1: Write failing Option A composition tests**

Assert desktop region order, six named steps and descriptors, active/completed semantics, contextual inspector, compact estimate action, and absence of `Menu`, large `Log out`, second-row admin tabs, and horizontal legacy estimate band.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/salesModeShell.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement the Option A grid**

```css
.sales-workspace {
  display: grid;
  grid-template:
    "top top top" var(--workspace-topbar-h)
    "rail viewer inspector" minmax(0, 1fr)
    / var(--workspace-rail-w) minmax(0, 1fr) var(--workspace-inspector-w);
  height: 100dvh;
}
```

Render only the active step panel in the inspector; do not keep all legacy panels in document flow.

- [ ] **Step 4: Add Previous/Next progression without state reset**

Use the existing `STUDIO_STEPS` order and clamp progression. Disable Previous only on Project and Next only according to explicit step readiness, not visual loading unrelated to the action.

- [ ] **Step 5: Run Sales, persistence, and project-operation tests**

Run: `cd configurator && node --test tests/salesModeShell.test.mjs tests/studioSteps.test.mjs tests/projectPersistence.test.mjs tests/projectOperations.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/components/workspaces/SalesModeShell.jsx configurator/src/components/GuidedStepRail.jsx configurator/src/components/EstimateDock.jsx configurator/src/styles/workspace-modes.css configurator/tests/salesModeShell.test.mjs
git commit -m "feat: build Option A Sales workspace"
```

### Task 6: Option B Expert Workspace

**Files:**
- Create: `configurator/src/components/workspaces/ExpertWorkspaceShell.jsx`
- Create: `configurator/src/components/workspaces/ExpertToolRail.jsx`
- Create: `configurator/tests/expertWorkspaceShell.test.mjs`
- Modify: `configurator/src/styles/workspace-modes.css`

**Interfaces:**
- `ExpertWorkspaceShell({ topBar, tools, activeTool, onToolChange, viewerStage, surfaceInspector, estimate, onUpdateEstimate, onReturnToSales, onPresent })`.
- Tool definitions include `{ key, label, implemented, disabledReason }`.

- [ ] **Step 1: Write failing authorization, composition, and unavailable-tool tests**

Assert the shell is never rendered when either Expert gate is false, implemented tools are interactive, future tools use `aria-disabled` plus explanatory text, and Sales/Presentation transitions are explicit.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/expertWorkspaceShell.test.mjs tests/workspaceMode.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement the dense Option B layout**

Use left tool rail, dominant viewer, selected-surface right inspector, and quick estimate. Wire only existing selection/move/rotate/measurement/override behavior; label unavailable concept tools honestly.

- [ ] **Step 4: Preserve Expert state across mode changes**

Keep active tool and selected facet/surface in App-owned UI state. Do not capture or reapply a design snapshot when changing modes.

- [ ] **Step 5: Run Expert, facet, entitlement, and pricing tests**

Run: `cd configurator && node --test tests/expertWorkspaceShell.test.mjs tests/workspaceMode.test.mjs tests/facetOverrides.test.mjs tests/tenantFeatures.test.mjs tests/pricingEngine.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/components/workspaces/ExpertWorkspaceShell.jsx configurator/src/components/workspaces/ExpertToolRail.jsx configurator/src/styles/workspace-modes.css configurator/tests/expertWorkspaceShell.test.mjs
git commit -m "feat: build gated Option B Expert workspace"
```

### Task 7: Option C Showroom Workspace

**Files:**
- Create: `configurator/src/components/workspaces/ShowroomModeShell.jsx`
- Create: `configurator/src/components/workspaces/ShowroomCategoryRail.jsx`
- Create: `configurator/tests/showroomModeShell.test.mjs`
- Modify: `configurator/src/styles/workspace-modes.css`

**Interfaces:**
- `ShowroomModeShell({ sessionType, viewerStage, categories, selectedCategory, onCategoryChange, materials, estimate, customerActions, onExitPresentation })`.
- `sessionType` is exactly `'authenticated-presentation'` or `'public'`.

- [ ] **Step 1: Write failing customer-safety and restoration tests**

Assert public output has no Exit Presentation, project administration, Expert, internal unit price, lock, diagnostics, Settings, or Platform controls. Assert authenticated presentation has one discreet Exit action and calls the state-machine restoration callback.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/showroomModeShell.test.mjs tests/workspaceMode.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement the cinematic Option C composition**

Create the compact category rail, dominant viewer, material swatches, before/after/fullscreen affordances when supported, and a customer-safe estimate/quote card.

- [ ] **Step 4: Enforce an allowlisted Showroom view model**

Build Showroom props explicitly in App. Do not pass whole settings, user, pricing configuration, project API actions, or capabilities objects into the public shell.

- [ ] **Step 5: Run Showroom, share, approval, and export tests**

Run: `cd configurator && node --test tests/showroomModeShell.test.mjs tests/publicAccess.test.mjs tests/shareDesign.test.mjs tests/projectApproval.test.mjs tests/exportEstimate.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/components/workspaces/ShowroomModeShell.jsx configurator/src/components/workspaces/ShowroomCategoryRail.jsx configurator/src/styles/workspace-modes.css configurator/tests/showroomModeShell.test.mjs
git commit -m "feat: build Option C Showroom workspace"
```

### Task 8: Responsive Layouts for All Three Modes

**Files:**
- Create: `configurator/tests/workspaceResponsive.test.mjs`
- Modify: `configurator/src/components/workspaces/SalesModeShell.jsx`
- Modify: `configurator/src/components/workspaces/ExpertWorkspaceShell.jsx`
- Modify: `configurator/src/components/workspaces/ShowroomModeShell.jsx`
- Modify: `configurator/src/components/workspaces/MobileWorkspaceHeader.jsx`
- Modify: `configurator/src/styles/workspace-modes.css`

**Interfaces:**
- CSS breakpoints: desktop `>= 1180px`, tablet `768px–1179px`, mobile `< 768px`.
- All mobile shells expose one main viewer, one focused control surface, and one reachable primary action area.

- [ ] **Step 1: Write failing responsive-contract tests**

Assert media queries exist for both breakpoint boundaries, desktop three-region grids are removed below 1180px, mobile has no horizontal overflow, touch controls use at least 44px, and each shell renders its mobile header/control surface.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/workspaceResponsive.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement Sales mobile/tablet**

Use compact step header, dominant viewer, focused inspector sheet/card, and sticky estimate/Next action. Administrative navigation becomes a drawer.

- [ ] **Step 4: Implement Expert mobile/tablet**

Collapse tools into a drawer/toolbar and selected-surface controls into a sheet without removing implemented capabilities.

- [ ] **Step 5: Implement Showroom mobile/tablet**

Use a compact category selector, viewer, swipe/scroll material cards, and sticky customer action. Show authenticated Exit separately from public output.

- [ ] **Step 6: Run responsive and accessibility suites**

Run: `cd configurator && node --test tests/workspaceResponsive.test.mjs tests/workspaceFrame.test.mjs tests/accessibility.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add configurator/src/components/workspaces configurator/src/styles/workspace-modes.css configurator/tests/workspaceResponsive.test.mjs
git commit -m "feat: complete responsive three-mode workspaces"
```

### Task 9: Integrate Three Modes in App Without Domain Duplication

**Files:**
- Modify: `configurator/src/App.jsx`
- Modify: `configurator/src/components/SalesStepContent.jsx`
- Modify: `configurator/tests/studioShell.test.mjs`
- Create: `configurator/tests/appWorkspaceIntegration.test.mjs`

**Interfaces:**
- App owns `workspaceState`, `activeStudioStep`, `activeExpertTool`, current project/design state, and existing handlers.
- Shells receive view models and callbacks only; no shell calls project APIs directly.

- [ ] **Step 1: Write failing integration tests**

Assert authenticated default composition is Sales, gated Expert transition changes shell without invoking `applyDesignSnapshot`, Present/Exit restores prior mode and active step/tool, public routes render only Showroom, and Trims/Services receive exclusive data.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/appWorkspaceIntegration.test.mjs tests/studioShell.test.mjs`

Expected: FAIL against the current legacy `StudioShell` composition.

- [ ] **Step 3: Replace the legacy return composition**

Build shared viewer and step-content nodes once, then select exactly one shell:

```jsx
if (workspaceState.mode === 'showroom') return <ShowroomModeShell {...showroomViewModel} />;
if (workspaceState.mode === 'expert') return <ExpertWorkspaceShell {...expertViewModel} />;
return <SalesModeShell {...salesViewModel} />;
```

Do not remount or normalize domain state during mode transitions.

- [ ] **Step 4: Remove visible legacy shell duplication**

Stop rendering `.app-header`, `.app-nav`, the horizontal `EstimateDock`, and document-flow `ViewerWorkspace` inside the three new modes. Retain administrative components behind compact application navigation.

- [ ] **Step 5: Run the broad state and behavior suites**

Run: `cd configurator && node --test tests/appWorkspaceIntegration.test.mjs tests/studioShell.test.mjs tests/projectPersistence.test.mjs tests/projectOperations.test.mjs tests/designState.test.mjs tests/trimServiceBoundary.test.mjs tests/units.test.mjs tests/exportEstimate.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add configurator/src/App.jsx configurator/src/components/SalesStepContent.jsx configurator/tests/appWorkspaceIntegration.test.mjs configurator/tests/studioShell.test.mjs
git commit -m "feat: integrate three responsive Studio modes"
```

### Task 10: Visual Fidelity, Interaction Polish, and Legacy CSS Removal

**Files:**
- Modify: `configurator/src/styles/workspace-modes.css`
- Modify: `configurator/src/styles/studio-shell.css`
- Modify: `configurator/src/index.css`
- Modify: `configurator/tests/redStyle.test.mjs`
- Create: `configurator/tests/workspaceVisualContract.test.mjs`

**Interfaces:**
- Visual acceptance at approximately 1440px, 1024px, 390px, and 360px widths for Options A, B, and C.

- [ ] **Step 1: Write failing rejected-legacy and token-contract tests**

Assert the new shells do not use legacy large header/tab selectors, red is not a large general background, disabled contrast tokens remain neutral, focus styles exist, and reduced-motion rules cover workspace transitions.

- [ ] **Step 2: Run and verify RED**

Run: `cd configurator && node --test tests/workspaceVisualContract.test.mjs tests/redStyle.test.mjs`

Expected: FAIL until conflicting legacy rules are scoped/removed.

- [ ] **Step 3: Match desktop proportions and density**

Tune top bar, rail, viewer, inspector, typography, swatches, estimate card, and viewer overlays against the supplied reference. Use the real model/data; do not substitute concept imagery.

- [ ] **Step 4: Match mobile hierarchy and eliminate overflow**

Verify compact headers, focused control cards, sticky actions, safe areas, long project/customer names, and direction/positioning controls at 390px and 360px.

- [ ] **Step 5: Capture all twelve comparison states**

Capture A/B/C at 1440px, 1024px, 390px, and 360px. Reject captures with legacy large buttons/tabs, viewer obstruction, clipped controls, horizontal overflow, or generic stacked layouts.

- [ ] **Step 6: Run visual-contract tests**

Run: `cd configurator && node --test tests/workspaceVisualContract.test.mjs tests/redStyle.test.mjs tests/workspaceResponsive.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add configurator/src/styles configurator/src/index.css configurator/tests/workspaceVisualContract.test.mjs configurator/tests/redStyle.test.mjs
git commit -m "fix: match approved IronWrap workspace concepts"
```

### Task 11: Full Verification and Preview Release Gate

**Files:**
- Modify: `configurator/docs/milestones/2026-07-18-studio-correction-verification.md`
- Create: `configurator/docs/milestones/2026-07-18-three-mode-workspace-verification.md`

**Interfaces:**
- Produces a reviewed PR #17 Preview only; no merge or Production deployment.

- [ ] **Step 1: Run the complete automated suite**

Run: `cd configurator && npm test`

Expected: all tests pass with zero failures/skips/cancellations.

- [ ] **Step 2: Run production and artifact builds**

Run: `cd configurator && npm run build`

Expected: PASS in the supported deployment runtime. If the known local Node 24 Workbox/Terser baseline recurs, record the exact failure and separately run:

`cd configurator && ./node_modules/.bin/vite build --config vite.artifact.config.js && node scripts/build-snapshot-template.mjs`

Expected: artifact and snapshot build PASS; never describe the exact `npm run build` as passing if it failed.

- [ ] **Step 3: Validate the tree**

Run: `git diff --check`

Expected: no whitespace errors and no unrelated user-owned files included.

- [ ] **Step 4: Perform whole-branch code review**

Review security, mode isolation, persistence/data loss, legacy normalization, pricing de-duplication, exports, responsive accessibility, and CSS cascade. Correct all Critical/Important findings and rerun the gate.

- [ ] **Step 5: Publish PR branch and verify Vercel**

Publish the exact reviewed tree to `chatgpt/ui-foundation-design`. Confirm the resulting deployment is `READY`, its commit/tree matches, and `/api/auth/me` returns application JSON rather than a platform runtime error.

- [ ] **Step 6: Run authenticated functional and visual walkthrough**

Verify login; A/B/C mode transitions; public Showroom isolation; New/Open/Save/Download/refresh/Share; legacy project trims and no double pricing; extras-only Services; units; all five camera views; positioning; exports; desktop/tablet/mobile screenshots; keyboard/focus behavior.

- [ ] **Step 7: Record evidence and request explicit approval**

Update milestone rows with direct evidence and the exact Preview URL/SHA. Keep PR #17 unmerged and Production unchanged until the user approves.

- [ ] **Step 8: Commit verification record**

```bash
git add configurator/docs/milestones/2026-07-18-studio-correction-verification.md configurator/docs/milestones/2026-07-18-three-mode-workspace-verification.md
git commit -m "docs: verify three-mode Studio reconstruction"
```

---

## Plan Self-Review

- Spec coverage: all three modes, workflow-correct switching, responsive variants, trim/service exclusivity, legacy compatibility, pricing de-duplication, security, errors, accessibility, visual comparison, and release boundary have explicit tasks.
- Placeholder scan: no unresolved implementation placeholders are used; deliberately unavailable Expert concept tools have a defined honest disabled-state contract.
- Type consistency: workspace transition names, shell prop boundaries, `sessionType`, trim boundary outputs, and responsive breakpoints are consistent across tasks.
