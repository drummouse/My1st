# IronWrap Studio UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the red-direction design system and complete context-aware Sales Mode shell around the existing working IronWrap configurator.

**Architecture:** Add pure mode/step contracts, semantic CSS tokens, focused shell components, and step adapters while retaining the current `App.jsx` state and domain handlers. Develop and verify the shell on its isolated feature branch and Vercel Preview; customer, Expert, and Platform contexts reuse the mode resolver without receiving new capabilities.

**Tech Stack:** React 18, Vite 5, CSS custom properties, Node.js built-in test runner, existing Three.js viewer and Vercel Functions.

## Global Constraints

- Scanner/Capture remains a separate application; this plan adds no scanning behavior.
- Preserve generic XML import, 3D rendering, products/profiles/colors, facet overrides, measurements, pricing, project restoration, sharing, approval, HTML export, PDF reporting, SuperAdmin authorization, and tenant privacy.
- Do not change saved project/design-state formats or API contracts.
- The 3D workspace remains the visually dominant region.
- Red is limited to primary actions, selected states, progress, and critical metrics.
- Normal interactive targets are at least 44 by 44 pixels.
- Customer routes never expose Expert or Platform controls.
- Interface Design import remains an inactive, capability-protected placeholder; no ZIP parsing or activation is added.
- No new runtime dependencies are required.

---

## Planned File Structure

- Create `src/lib/studioMode.js`: pure context-to-mode and authorization helpers.
- Create `src/lib/studioSteps.js`: ordered Sales Mode step contract and progression helpers.
- Create `src/styles/studio-tokens.css`: semantic token defaults and IronWrap red skin.
- Create `src/styles/studio-shell.css`: responsive shell layout only.
- Create `src/components/ui/StudioButton.jsx`: semantic button primitive.
- Create `src/components/ui/StudioPanel.jsx`: semantic panel primitive.
- Create `src/components/StudioTopBar.jsx`: project/status/account and authorized Expert entry.
- Create `src/components/GuidedStepRail.jsx`: desktop rail and mobile progress navigation.
- Create `src/components/ViewerWorkspace.jsx`: stable wrapper around the existing viewer region.
- Create `src/components/ContextInspector.jsx`: desktop inspector/mobile bottom-sheet container.
- Create `src/components/EstimateDock.jsx`: existing estimate summary plus progression controls.
- Create `src/components/SalesStepContent.jsx`: maps active step to existing controls and handlers.
- Create `src/components/StudioShell.jsx`: composes the regions without owning domain state.
- Create `tests/studioMode.test.mjs`, `tests/studioSteps.test.mjs`, `tests/studioTokens.test.mjs`, and `tests/studioShell.test.mjs`.
- Modify `src/App.jsx`: compute mode, retain current state/handlers, and pass explicit props into the shell.
- Modify `src/index.css`: import focused styles and remove only rules replaced by the new shell.
- Modify `docs/milestones/2026-07-17-studio-ui-foundation-verification.md`: record release evidence.

---

### Task 1: Context-Aware Mode Contract

**Files:**
- Create: `src/lib/studioMode.js`
- Test: `tests/studioMode.test.mjs`

**Interfaces:**
- Consumes: `{ isCustomerView: boolean, activeSection: string, role: 'owner' | 'superadmin' | null, capabilities: string[] }`
- Produces: `resolveStudioMode(context): 'showroom' | 'sales' | 'expert' | 'platform'`, `canEnterExpert(role): boolean`, and `canOpenPlatform(capabilities): boolean`

- [ ] **Step 1: Write the failing mode tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canEnterExpert, canOpenPlatform, resolveStudioMode } from '../src/lib/studioMode.js';

test('public customer context always resolves to showroom', () => {
  assert.equal(resolveStudioMode({ isCustomerView: true, activeSection: 'platform', capabilities: ['platform.diagnostics.read'] }), 'showroom');
});

test('authenticated configurator defaults to sales and platform requires capability', () => {
  assert.equal(resolveStudioMode({ isCustomerView: false, activeSection: 'configurator', capabilities: [] }), 'sales');
  assert.equal(resolveStudioMode({ isCustomerView: false, activeSection: 'platform', capabilities: [] }), 'sales');
  assert.equal(resolveStudioMode({ isCustomerView: false, activeSection: 'platform', capabilities: ['platform.diagnostics.read'] }), 'platform');
});

test('expert and platform entry are exact capability checks', () => {
  assert.equal(canEnterExpert(null), false);
  assert.equal(canEnterExpert('owner'), true);
  assert.equal(canEnterExpert('superadmin'), true);
  assert.equal(canOpenPlatform(['platform.diagnostics.read']), true);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/studioMode.test.mjs`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `studioMode.js`.

- [ ] **Step 3: Implement the pure contract**

```js
export const canEnterExpert = (role) => role === 'owner' || role === 'superadmin';
export const canOpenPlatform = (capabilities = []) => capabilities.includes('platform.diagnostics.read');

export function resolveStudioMode({ isCustomerView = false, activeSection = 'configurator', role = null, capabilities = [], expertRequested = false } = {}) {
  if (isCustomerView) return 'showroom';
  if (activeSection === 'platform' && canOpenPlatform(capabilities)) return 'platform';
  if (expertRequested && canEnterExpert(role)) return 'expert';
  return 'sales';
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/studioMode.test.mjs`  
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studioMode.js tests/studioMode.test.mjs
git commit -m "feat: define Studio presentation modes"
```

### Task 2: Guided Sales Step Contract

**Files:**
- Create: `src/lib/studioSteps.js`
- Test: `tests/studioSteps.test.mjs`

**Interfaces:**
- Produces: `STUDIO_STEPS`, `getStudioStep(key)`, `nextStudioStep(key)`, and `previousStudioStep(key)`
- Step keys are exactly `project`, `roof`, `siding`, `accents`, `services`, `review`

- [ ] **Step 1: Write the failing step tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_STEPS, getStudioStep, nextStudioStep, previousStudioStep } from '../src/lib/studioSteps.js';

test('Sales Mode exposes the approved ordered workflow', () => {
  assert.deepEqual(STUDIO_STEPS.map((step) => step.key), ['project', 'roof', 'siding', 'accents', 'services', 'review']);
  assert.equal(getStudioStep('accents').label, 'Trims & Accents');
});

test('step progression clamps at the workflow boundaries', () => {
  assert.equal(previousStudioStep('project').key, 'project');
  assert.equal(nextStudioStep('roof').key, 'siding');
  assert.equal(nextStudioStep('review').key, 'review');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/studioSteps.test.mjs`  
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the immutable workflow**

```js
export const STUDIO_STEPS = Object.freeze([
  { key: 'project', label: 'Project', shortLabel: 'Project' },
  { key: 'roof', label: 'Roof', shortLabel: 'Roof' },
  { key: 'siding', label: 'Siding', shortLabel: 'Siding' },
  { key: 'accents', label: 'Trims & Accents', shortLabel: 'Accents' },
  { key: 'services', label: 'Services', shortLabel: 'Services' },
  { key: 'review', label: 'Review', shortLabel: 'Review' },
]);

export const getStudioStep = (key) => STUDIO_STEPS.find((step) => step.key === key) || STUDIO_STEPS[0];
export const nextStudioStep = (key) => STUDIO_STEPS[Math.min(STUDIO_STEPS.indexOf(getStudioStep(key)) + 1, STUDIO_STEPS.length - 1)];
export const previousStudioStep = (key) => STUDIO_STEPS[Math.max(STUDIO_STEPS.indexOf(getStudioStep(key)) - 1, 0)];
```

- [ ] **Step 4: Run focused mode and step tests**

Run: `node --test tests/studioMode.test.mjs tests/studioSteps.test.mjs`  
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studioSteps.js tests/studioSteps.test.mjs
git commit -m "feat: define guided Sales workflow"
```

### Task 3: Semantic Tokens and UI Primitives

**Files:**
- Create: `src/styles/studio-tokens.css`
- Create: `src/components/ui/StudioButton.jsx`
- Create: `src/components/ui/StudioPanel.jsx`
- Test: `tests/studioTokens.test.mjs`
- Modify: `src/index.css`

**Interfaces:**
- Produces CSS variables prefixed `--studio-` and primitives accepting `variant`, `className`, and native element props.

- [ ] **Step 1: Write the failing token-contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('default skin defines required semantic tokens and safe touch geometry', async () => {
  const css = await readFile(new URL('../src/styles/studio-tokens.css', import.meta.url), 'utf8');
  for (const token of ['--studio-action', '--studio-surface-canvas', '--studio-surface-panel', '--studio-text', '--studio-border', '--studio-focus', '--studio-radius-control', '--studio-shadow-panel']) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /--studio-control-min:\s*44px/);
});

test('UI primitives consume semantic classes without tenant color literals', async () => {
  const source = await readFile(new URL('../src/components/ui/StudioButton.jsx', import.meta.url), 'utf8');
  assert.match(source, /studio-button/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/studioTokens.test.mjs`  
Expected: FAIL because the token and primitive files do not exist.

- [ ] **Step 3: Add the default token contract**

Create `src/styles/studio-tokens.css` with a `[data-studio-skin='ironwrap']` block defining graphite `#111417`, warm-white `#f7f5f1`, action red `#e21b23`, accessible text/border/focus colors, `--studio-control-min: 44px`, radii, shadows, spacing, and reduced-motion overrides. Style `.studio-button` variants `primary`, `secondary`, and `ghost`, plus `.studio-panel`, entirely from semantic variables.

- [ ] **Step 4: Add focused primitives**

```jsx
export default function StudioButton({ variant = 'secondary', className = '', type = 'button', ...props }) {
  return <button type={type} className={`studio-button studio-button-${variant} ${className}`.trim()} {...props} />;
}
```

```jsx
export default function StudioPanel({ as: Component = 'section', className = '', ...props }) {
  return <Component className={`studio-panel ${className}`.trim()} {...props} />;
}
```

Import `./styles/studio-tokens.css` at the top of `src/index.css`.

- [ ] **Step 5: Run the focused test and build**

Run: `node --test tests/studioTokens.test.mjs && npm run build`  
Expected: token tests pass and both Vite builds complete; the existing bundle-size warning is allowed.

- [ ] **Step 6: Commit**

```bash
git add src/styles/studio-tokens.css src/components/ui src/index.css tests/studioTokens.test.mjs
git commit -m "feat: add IronWrap Studio design tokens"
```

### Task 4: Shell Navigation Components

**Files:**
- Create: `src/components/StudioTopBar.jsx`
- Create: `src/components/GuidedStepRail.jsx`
- Create: `src/components/ContextInspector.jsx`
- Create: `tests/studioShell.test.mjs`

**Interfaces:**
- `StudioTopBar({ title, subtitle, logoUrl, saveState, canUseExpert, expertActive, onToggleExpert, onLogout, onOpenNavigation })`
- `GuidedStepRail({ steps, activeStep, completedSteps, onStepChange })`
- `ContextInspector({ title, mobileOpen, onMobileOpenChange, children })`

- [ ] **Step 1: Write failing source-contract tests**

Read all three component sources and assert that the top bar contains `aria-pressed={expertActive}`, the rail contains `aria-current={active ? 'step' : undefined}`, and the inspector contains `aria-expanded={mobileOpen}` and a visible heading.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL because the shell components do not exist.

- [ ] **Step 3: Implement the three presentational components**

Use `StudioButton`, native semantic elements, explicit labels, and callbacks only. Do not import pricing, project, viewer, auth, or API modules. Render step numbers and labels so selection is not conveyed by red alone.

- [ ] **Step 4: Run shell and token tests**

Run: `node --test tests/studioShell.test.mjs tests/studioTokens.test.mjs`  
Expected: all focused tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/StudioTopBar.jsx src/components/GuidedStepRail.jsx src/components/ContextInspector.jsx tests/studioShell.test.mjs
git commit -m "feat: add Studio shell navigation"
```

### Task 5: Viewer Workspace and Estimate Dock

**Files:**
- Create: `src/components/ViewerWorkspace.jsx`
- Create: `src/components/EstimateDock.jsx`
- Modify: `tests/studioShell.test.mjs`

**Interfaces:**
- `ViewerWorkspace({ viewerMode, onViewerModeChange, children })`
- `EstimateDock({ estimate, activeStep, onPrevious, onNext, atFirstStep, atLastStep, children })`

- [ ] **Step 1: Extend the shell test with viewer and estimate contracts**

Assert accessible buttons named `Hide 3D Model`, `Full Screen`, `Previous step`, and `Next step`; assert `EstimateDock` receives an existing estimate object rather than calculating totals.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL because the two files do not exist.

- [ ] **Step 3: Implement presentational wrappers**

Move only viewer chrome into `ViewerWorkspace`; pass the existing `Viewer3D`, `FacetInspector`, and `AssemblyAdjustment` tree as `children`. Render `PriceSummary` or review actions through `EstimateDock.children`; do not import `calculateEstimate`.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/studioShell.test.mjs`  
Expected: all shell tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/ViewerWorkspace.jsx src/components/EstimateDock.jsx tests/studioShell.test.mjs
git commit -m "feat: add Studio viewer and estimate regions"
```

### Task 6: Guided Step Adapters

**Files:**
- Create: `src/components/SalesStepContent.jsx`
- Modify: `tests/studioShell.test.mjs`

**Interfaces:**
- `SalesStepContent({ activeStep, projectContent, roofContent, sidingContent, accentsContent, servicesContent, reviewContent })`
- Each content prop is a React node assembled in `App.jsx` from existing controls.

- [ ] **Step 1: Add a failing exact-mapping test**

Assert that `SalesStepContent.jsx` contains one branch for each approved key and returns `projectContent`, `roofContent`, `sidingContent`, `accentsContent`, `servicesContent`, or `reviewContent` without importing domain modules.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL because `SalesStepContent.jsx` does not exist.

- [ ] **Step 3: Implement the adapter**

```jsx
const CONTENT_BY_STEP = {
  project: 'projectContent', roof: 'roofContent', siding: 'sidingContent',
  accents: 'accentsContent', services: 'servicesContent', review: 'reviewContent',
};

export default function SalesStepContent({ activeStep, ...content }) {
  return content[CONTENT_BY_STEP[activeStep] || 'projectContent'] || null;
}
```

- [ ] **Step 4: Run the focused test**

Run: `node --test tests/studioShell.test.mjs`  
Expected: all shell tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/SalesStepContent.jsx tests/studioShell.test.mjs
git commit -m "feat: map configurator controls to Sales steps"
```

### Task 7: Compose the Context-Aware Studio Shell

**Files:**
- Create: `src/components/StudioShell.jsx`
- Create: `src/styles/studio-shell.css`
- Modify: `src/index.css`
- Modify: `tests/studioShell.test.mjs`

**Interfaces:**
- `StudioShell({ mode, topBar, stepRail, viewer, inspector, estimateDock, platformContent, auxiliaryContent })`
- Uses `data-studio-mode` and `data-studio-skin='ironwrap'` on the root.

- [ ] **Step 1: Add failing composition and responsive-contract tests**

Assert the component exposes `data-studio-mode`, and the CSS defines the four desktop grid areas `steps`, `viewer`, `inspector`, and `estimate`; `@media (max-width: 900px)` hides the desktop rail and positions the inspector as a bottom sheet.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL for missing shell/CSS contracts.

- [ ] **Step 3: Implement the shell composition**

Keep it stateless. In `platform` mode, render `platformContent` under the shared top bar. In `sales`, `expert`, and `showroom`, render supplied regions; the caller decides which controls exist.

- [ ] **Step 4: Implement responsive CSS**

Desktop uses `grid-template-columns: 168px minmax(0, 1fr) minmax(320px, 380px)` with viewer as the flexible region. At 900px and below, use one viewer column, progress header, fixed safe-area-aware inspector sheet, and no permanent model obstruction. Add `@media (prefers-reduced-motion: reduce)`.

- [ ] **Step 5: Run focused tests and build**

Run: `node --test tests/studioShell.test.mjs tests/studioTokens.test.mjs && npm run build`  
Expected: tests and both builds pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/StudioShell.jsx src/styles/studio-shell.css src/index.css tests/studioShell.test.mjs
git commit -m "feat: compose responsive Studio shell"
```

### Task 8: Integrate Sales Mode Without Changing Domain Behavior

**Files:**
- Modify: `src/App.jsx`
- Modify: `tests/studioShell.test.mjs`

**Interfaces:**
- Consumes Tasks 1–7.
- Preserves all existing handler names and state variables.
- Adds local UI state: `activeStudioStep`, `expertRequested`, and `mobileInspectorOpen`.

- [ ] **Step 1: Add failing App integration assertions**

Assert `App.jsx` imports `resolveStudioMode`, `STUDIO_STEPS`, and `StudioShell`; customer mode is resolved before expert mode; Platform remains guarded by `canViewPlatform`; and existing handlers `handleExportHtml`, `handleExportPdf`, `handleApproveDesign`, and `applyDesignSnapshot` remain present.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL because `App.jsx` has not integrated the shell.

- [ ] **Step 3: Add UI state and mode resolution**

```jsx
const [activeStudioStep, setActiveStudioStep] = useState('project');
const [expertRequested, setExpertRequested] = useState(false);
const [mobileInspectorOpen, setMobileInspectorOpen] = useState(true);
const capabilities = currentUser?.capabilities || [];
const studioMode = resolveStudioMode({ isCustomerView, activeSection, role: currentUser?.role || null, capabilities, expertRequested });
```

- [ ] **Step 4: Assemble existing controls by step**

Move JSX, not logic: Project receives `LayersPanel`, `ProjectsPanel`, and `AttachmentsPanel`; Roof receives the roof `ServiceRow`, `ProductSelector`, color picker, and uniform/facet control; Siding receives the wall equivalents; Accents receives accessory options and `PhotoOverlayControl`; Services receives `ServicesPanel`; Review receives `PriceSummary`, approval, and export buttons. Keep every existing prop and handler unchanged.

- [ ] **Step 5: Render StudioShell and preserve Platform/legacy sections**

Pass the unchanged viewer tree into `ViewerWorkspace`. Keep Settings, Discounts, Custom Services, Materials, and Platform navigation capability-gated. Expert Mode initially presents the current full controls workspace and must toggle back without state reset.

- [ ] **Step 6: Add the inactive Interface Design placeholder**

Render a disabled or non-operational `Import Interface Design` control only when `canViewPlatform` is true, with helper text `Skin package validation is not enabled in this release.` Do not add a file input or upload handler.

- [ ] **Step 7: Run all automated tests**

Run: `npm test`  
Expected: the prior 65 tests plus new Studio tests all pass.

- [ ] **Step 8: Run both production builds**

Run: `npm run build`  
Expected: main PWA, artifact build, and snapshot template complete; the existing large-chunk warning is allowed.

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx tests/studioShell.test.mjs
git commit -m "feat: integrate red-direction Sales Mode"
```

### Task 9: Accessibility, Empty States, and Recovery

**Files:**
- Modify: `src/components/ContextInspector.jsx`
- Modify: `src/components/StudioShell.jsx`
- Modify: `src/components/SalesStepContent.jsx`
- Modify: `src/styles/studio-shell.css`
- Modify: `tests/studioShell.test.mjs`

**Interfaces:**
- `ContextInspector` additionally accepts `error`, `onRetry`, and `busy`.
- Shell accepts `notice` for project-wide non-sensitive feedback.

- [ ] **Step 1: Add failing accessibility/recovery assertions**

Assert `role='alert'` for step errors, retry controls only when `onRetry` exists, `aria-busy` on the inspector, visible focus styles using `--studio-focus`, and reduced-motion rules. Assert no customer-facing error renders raw `error.stack` or response bodies.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL for missing recovery contracts.

- [ ] **Step 3: Implement bounded feedback**

Render the supplied safe error message and `Try again` button. Keep errors local to the inspector unless the caller passes a shell notice. Do not clear children or active step when an error occurs.

- [ ] **Step 4: Add focus and motion rules**

Use `:focus-visible` with a 3px semantic focus ring, preserve 44px controls, and disable non-essential transitions in reduced-motion mode.

- [ ] **Step 5: Run all tests and builds**

Run: `npm test && npm run build`  
Expected: complete pass with no new warning category.

- [ ] **Step 6: Commit**

```bash
git add src/components/ContextInspector.jsx src/components/StudioShell.jsx src/components/SalesStepContent.jsx src/styles/studio-shell.css tests/studioShell.test.mjs
git commit -m "fix: harden Studio accessibility and recovery"
```

### Task 10: Milestone Evidence and Authenticated Preview Gate

**Files:**
- Create: `docs/milestones/2026-07-17-studio-ui-foundation-verification.md`
- Modify: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces the release record; no runtime interface.

- [ ] **Step 1: Add a failing documentation assertion**

Assert the milestone file names every protected behavior: login, real XML, rotatable 3D, products/profiles/colors, facet overrides, measurements, estimate, save/refresh, Share Design HTML, PDF, customer context, Expert toggle, Platform, Library, and responsive layouts.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL because the milestone file does not exist.

- [ ] **Step 3: Create the milestone record**

Record exact `npm test` totals, exact build result, commit SHA, Preview URL, date, tester, and one Pass/Fail/Blocked row per protected behavior. Mark browser rows `Pending authenticated Preview verification` until actually run; never record an unperformed check as passed.

- [ ] **Step 4: Run final local verification**

Run: `git diff --check && npm test && npm run build`  
Expected: clean diff check, all tests pass, both builds complete.

- [ ] **Step 5: Publish a draft PR and wait for Vercel Preview**

Push the feature branch, open a draft PR against `main`, and wait until both Vercel checks succeed. Do not merge.

- [ ] **Step 6: Run authenticated Preview workflow**

Verify owner Sales Mode, all six steps, real-world XML, 3D rotation/facet selection, pricing, save/refresh, HTML/PDF export, customer Showroom context, authorized Expert toggle, Platform/Library access, and desktop/tablet/mobile layouts. Update each milestone row with evidence.

- [ ] **Step 7: Commit verified evidence**

```bash
git add docs/milestones/2026-07-17-studio-ui-foundation-verification.md tests/studioShell.test.mjs
git commit -m "docs: verify Studio UI foundation"
```

- [ ] **Step 8: Request explicit release approval**

Mark the PR ready only after all required checks pass. Merge and Production deployment require a separate explicit user approval.
