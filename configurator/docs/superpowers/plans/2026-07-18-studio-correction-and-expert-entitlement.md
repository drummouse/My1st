# Studio Correction and Expert Entitlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore authenticated project operations and deliver tenant-controlled Expert Mode, company units, structured trims/services, compact 3D controls, and the complete IronWrap red Studio presentation.

**Architecture:** Keep `App.jsx` as the existing domain-state owner while extracting pure readiness, entitlement, unit, and presentation contracts into focused helpers. Persist company/tenant settings through the existing Settings and SuperAdmin APIs and migrations, adapt existing design-state fields without invalidating saved projects, and verify every behavior with Node contract tests plus authenticated Preview checks.

**Tech Stack:** React 18, Vite 5, Node.js built-in test runner, Vercel Functions, Neon Postgres, CSS custom properties.

## Global Constraints

- Preserve credentials, sessions, tenant privacy, existing project records, and saved design compatibility.
- SuperAdmin effective Expert Mode entitlement is always true; tenant entitlement defaults to false.
- Project units are inherited from company settings; no project-level unit override is allowed.
- Branch-specific unit resolution is supported by a pure resolver, but branch administration is not built.
- Scanner/Capture remains a separate application.
- The visible iRoof Alberta/IronWrap Exteriors switch is removed while internal brand capability remains.
- Red is limited to primary actions, active states, progress, selection, and critical metrics.
- Use test-first development for every production-code change.

---

### Task 1: Separate Project Read and Write Readiness

**Files:**
- Modify: `src/lib/studioDesignState.js`
- Modify: `src/App.jsx`
- Modify: `src/components/ProjectsPanel.jsx`
- Test: `tests/studioDesignState.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: `getProjectOperationState({ accountSettled, defaultsReady, persistenceReady }): { canOpen: boolean, canSave: boolean, canShare: boolean, message: string }`
- Consumes: existing `getDesignPersistenceState` and `getProjectSaveStatus` contracts.

- [ ] **Step 1: Write failing operation-state tests**

Add tests proving that saved projects can open whenever authentication is settled, optional catalog failure cannot hold writes disabled forever, and save/share require a stable design normalizer plus resolved pricing.

```js
test('project opening is independent from write readiness', () => {
  assert.deepEqual(getProjectOperationState({ accountSettled: true, defaultsReady: false, persistenceReady: false }), {
    canOpen: true,
    canSave: false,
    canShare: false,
    message: 'Loading account project defaults…',
  });
});

test('resolved fallbacks allow project writes after optional catalogs fail', () => {
  const state = getProjectOperationState({ accountSettled: true, defaultsReady: true, persistenceReady: true });
  assert.equal(state.canOpen, true);
  assert.equal(state.canSave, true);
  assert.equal(state.canShare, true);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/studioDesignState.test.mjs tests/studioShell.test.mjs`  
Expected: FAIL because `getProjectOperationState` and distinct open/save props do not exist.

- [ ] **Step 3: Implement the pure operation contract**

```js
export function getProjectOperationState({ accountSettled = false, defaultsReady = false, persistenceReady = false } = {}) {
  const canOpen = accountSettled;
  const canWrite = accountSettled && defaultsReady && persistenceReady;
  return {
    canOpen,
    canSave: canWrite,
    canShare: canWrite,
    message: canWrite ? '' : 'Loading account project defaults…',
  };
}
```

Wire `canOpen`, `canSave`, and `canShare` separately. `ProjectsPanel` must disable saved rows only with `busy || !canOpen`; its Save/Download control uses `busy || !canSave`. Share Design uses `!canShare`.

- [ ] **Step 4: Verify focused tests and complete suite**

Run: `npm test`  
Expected: all tests pass and project source contracts show independent read/write gates.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studioDesignState.js src/App.jsx src/components/ProjectsPanel.jsx tests/studioDesignState.test.mjs tests/studioShell.test.mjs
git commit -m "fix: restore Studio project operations"
```

### Task 2: Project Actions Dropdown

**Files:**
- Modify: `src/components/StudioTopBar.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles/studio-shell.css`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- `StudioTopBar` consumes `projectActions: { onNew, onOpen, onSave, onShare, canOpen, canSave, canShare }`.
- Produces one accessible project menu with stable action names and status.

- [ ] **Step 1: Write failing project-menu contract tests**

Assert that the top bar has a menu disclosure with `aria-expanded`, Escape/outside-click closing, and buttons named `New Project`, `Open Project`, `Save / Download`, and `Share Design`; assert App passes existing handlers rather than duplicating persistence logic.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL because project actions are not composed into a dropdown.

- [ ] **Step 3: Implement the accessible dropdown**

Use local disclosure state in `StudioTopBar`, a button with `aria-haspopup="menu"`, a labeled menu container, and native buttons. `Open Project` calls the existing stable project-panel opener. The Save and Share entries use the readiness props from Task 1 and show the supplied status text when unavailable.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/studioShell.test.mjs && npm run build`  
Expected: tests pass; Vite and snapshot builds complete with only the existing chunk advisory.

- [ ] **Step 5: Commit**

```bash
git add src/components/StudioTopBar.jsx src/App.jsx src/styles/studio-shell.css tests/studioShell.test.mjs
git commit -m "feat: group Studio project actions"
```

### Task 3: Tenant Expert Mode Entitlement

**Files:**
- Create: `api/_lib/tenantFeatures.js`
- Modify: `api/_lib/db.js`
- Modify: `api/_lib/auth.js`
- Modify: `api/superadmin/index.js`
- Modify: `src/lib/studioMode.js`
- Test: `tests/studioMode.test.mjs`
- Test: `tests/superadminRoutes.test.mjs`
- Test: `tests/superadminSchema.test.mjs`

**Interfaces:**
- Produces: `resolveExpertEntitlement({ role, tenantEntitlement }): boolean`.
- Produces protected read/write helpers for `expert_mode_enabled` and tenant preference `show_expert_mode`.
- SuperAdmin administration accepts `EXPERT_MODE_VAR` as the external API name and maps it to `expert_mode_enabled`.

- [ ] **Step 1: Write failing entitlement and authorization tests**

```js
test('SuperAdmin entitlement is hardwired and tenants default off', () => {
  assert.equal(resolveExpertEntitlement({ role: 'superadmin', tenantEntitlement: false }), true);
  assert.equal(resolveExpertEntitlement({ role: 'owner', tenantEntitlement: false }), false);
  assert.equal(resolveExpertEntitlement({ role: 'owner', tenantEntitlement: true }), true);
});
```

Add API source-contract tests proving only SuperAdmin can write `EXPERT_MODE_VAR`, remote reads return effective values, and tenant-private fields are not included.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test tests/studioMode.test.mjs tests/superadminRoutes.test.mjs tests/superadminSchema.test.mjs`  
Expected: FAIL because the entitlement resolver, schema fields, and protected update path do not exist.

- [ ] **Step 3: Add the additive migration and entitlement helper**

Extend the existing idempotent `settings` schema initialization. In the current data model, each owner settings row is the tenant-level settings record:

```sql
ALTER TABLE settings ADD COLUMN IF NOT EXISTS expert_mode_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS show_expert_mode boolean NOT NULL DEFAULT false;
```

Implement the role override in a pure helper and map the protected API external name `EXPERT_MODE_VAR` to the database field. Reject non-boolean values and non-SuperAdmin writes.

- [ ] **Step 4: Run security tests**

Run: `node --test tests/studioMode.test.mjs tests/superadminRoutes.test.mjs tests/superadminSchema.test.mjs`  
Expected: all entitlement and authorization tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/tenantFeatures.js api/_lib/db.js api/_lib/auth.js api/superadmin/index.js src/lib/studioMode.js tests/studioMode.test.mjs tests/superadminRoutes.test.mjs tests/superadminSchema.test.mjs
git commit -m "feat: add tenant Expert Mode entitlement"
```

### Task 4: Expert Mode Settings and UI Gating

**Files:**
- Modify: `api/settings/index.js`
- Modify: `src/components/SettingsPanel.jsx`
- Modify: `src/components/StudioTopBar.jsx`
- Modify: `src/App.jsx`
- Modify: `src/lib/studioMode.js`
- Test: `tests/studioMode.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces: `canShowExpertControl({ role, entitled, tenantPreference }): boolean`.
- Settings returns `expertModeEntitled` and `show_expert_mode`; only the latter is tenant-editable.

- [ ] **Step 1: Write failing visibility combination tests**

Cover tenant off/preference off, tenant on/preference off, tenant on/preference on, and SuperAdmin entitlement with preference off/on. Assert Settings hides the checkbox when not entitled and the top-bar control requires effective entitlement plus preference.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioMode.test.mjs tests/studioShell.test.mjs`  
Expected: FAIL because Settings and the top bar do not use the two-gate contract.

- [ ] **Step 3: Implement Settings and top-bar gating**

Add a disabled-by-default tenant preference update through the existing Settings save flow. Never accept `EXPERT_MODE_VAR` from the tenant Settings payload. Compute the effective entitlement on the server and pass the two effective booleans into App. Keep the existing Expert presentation content unchanged.

- [ ] **Step 4: Run full tests and build**

Run: `npm test && npm run build`  
Expected: all tests and builds pass.

- [ ] **Step 5: Commit**

```bash
git add api/settings/index.js src/components/SettingsPanel.jsx src/components/StudioTopBar.jsx src/App.jsx src/lib/studioMode.js tests/studioMode.test.mjs tests/studioShell.test.mjs
git commit -m "feat: gate Expert Mode through tenant settings"
```

### Task 5: Company Units with Branch-Ready Resolution

**Files:**
- Create: `src/lib/units.js`
- Modify: `api/_lib/db.js`
- Modify: `api/settings/index.js`
- Modify: `src/components/SettingsPanel.jsx`
- Test: `tests/units.test.mjs`

**Interfaces:**
- Produces: `resolveUnitSystem({ companyUnits, branchUnits }): 'imperial' | 'metric'`.
- Produces: `linearUnit(system)`, `areaUnit(system)`, `feetToDisplay(value, system)`, and `squareFeetToDisplay(value, system)`.

- [ ] **Step 1: Write failing unit tests**

```js
test('branch-ready units fall back to the company without project overrides', () => {
  assert.equal(resolveUnitSystem({ companyUnits: 'imperial' }), 'imperial');
  assert.equal(resolveUnitSystem({ companyUnits: 'imperial', branchUnits: 'metric' }), 'metric');
  assert.equal(resolveUnitSystem({ companyUnits: 'metric', branchUnits: null }), 'metric');
});
```

Test exact conversion constants (`1 ft = 0.3048 m`, `1 sq ft = 0.09290304 m²`) and invalid enum rejection.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/units.test.mjs`  
Expected: FAIL because `units.js` does not exist.

- [ ] **Step 3: Implement schema, resolver, and Settings control**

Add `unit_system text NOT NULL DEFAULT 'imperial' CHECK (unit_system IN ('imperial','metric'))` through the existing idempotent `ensureSchema()` sequence in `api/_lib/db.js`. Settings exposes one company-level selector. No project state or saved-design field is added.

- [ ] **Step 4: Run tests and Settings contracts**

Run: `node --test tests/units.test.mjs tests/studioShell.test.mjs`  
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/units.js api/_lib/db.js api/settings/index.js src/components/SettingsPanel.jsx tests/units.test.mjs tests/studioShell.test.mjs
git commit -m "feat: add company measurement units"
```

### Task 6: Structured Trims and Accents

**Files:**
- Create: `src/components/TrimAccentRow.jsx`
- Create: `src/lib/trimAccents.js`
- Modify: `src/components/ServicesPanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/lib/designState.js`
- Test: `tests/trimAccents.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Produces canonical trim records `{ id, kind, productId, profile, colorId, quantity, canonicalUnit, locked, customLabel? }`.
- `canonicalUnit` is `linear_feet` or `square_feet`; display units come from Task 5.

- [ ] **Step 1: Write failing trim schema and component tests**

Assert standard kinds `soffit`, `fascia`, `garage_doors`, and `other_trims`; assert `Add Additional` creates the same record shape; assert product/profile/color/quantity/unit/Lock controls are rendered; assert legacy accessory colors and measurements normalize without data loss.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/trimAccents.test.mjs tests/studioShell.test.mjs`  
Expected: FAIL because standardized trim records and row component do not exist.

- [ ] **Step 3: Implement trim normalization and UI**

Keep canonical measurements in existing Imperial base units. Convert only at control display/input boundaries. Extend captured design state additively with `trimAccents`; when absent, normalize from existing accessory color and measurement fields. Render standard and custom rows through `TrimAccentRow`.

- [ ] **Step 4: Run design compatibility tests and build**

Run: `node --test tests/trimAccents.test.mjs tests/studioDesignState.test.mjs tests/studioShell.test.mjs && npm run build`  
Expected: all tests pass and legacy snapshots reopen identically.

- [ ] **Step 5: Commit**

```bash
git add src/components/TrimAccentRow.jsx src/lib/trimAccents.js src/components/ServicesPanel.jsx src/App.jsx src/lib/designState.js tests/trimAccents.test.mjs tests/studioShell.test.mjs
git commit -m "feat: structure trims and accents"
```

### Task 7: Standardized Optional Services

**Files:**
- Create: `src/components/OptionalServiceRow.jsx`
- Modify: `src/components/ServicesPanel.jsx`
- Modify: `src/components/CustomServicesPanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/lib/designState.js`
- Test: `tests/optionalServices.test.mjs`

**Interfaces:**
- Produces service records `{ id, name, description, pricingMethod, quantity, unit, unitPrice, selected, locked }`.
- Adapts existing `customServiceLines` into the new presentation without changing API identity fields.

- [ ] **Step 1: Write failing service adapter tests**

Cover travel, snow bars, stripping, strapping, chimney caps, and arbitrary custom entries. Verify existing lines normalize with safe defaults, pricing methods remain explicit, and Lock prevents customer changes without hiding quantities.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/optionalServices.test.mjs`  
Expected: FAIL because the standardized adapter/component does not exist.

- [ ] **Step 3: Implement the adapter and shared row**

Reuse the current custom-service API and pricing engine. Add only presentation metadata that can be defaulted for legacy records. Keep physical trims out of Optional Services.

- [ ] **Step 4: Run focused and pricing tests**

Run: `node --test tests/optionalServices.test.mjs tests/studioShell.test.mjs tests/designState.test.mjs`  
Expected: all tests pass and estimates remain unchanged for equivalent inputs.

- [ ] **Step 5: Commit**

```bash
git add src/components/OptionalServiceRow.jsx src/components/ServicesPanel.jsx src/components/CustomServicesPanel.jsx src/App.jsx src/lib/designState.js tests/optionalServices.test.mjs
git commit -m "feat: standardize optional services"
```

### Task 8: Branding and 3D Control Corrections

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Viewer3D.jsx`
- Modify: `src/components/AssemblyAdjustment.jsx`
- Modify: `src/index.css`
- Modify: `src/styles/studio-shell.css`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- Visible camera controls are named `Front`, `Back`, `Left`, `Right`, and `Top`.
- Internal `brandId`, brand assets, and design-state capture remain unchanged.

- [ ] **Step 1: Write failing source and layout tests**

Assert no visible authenticated `BrandToggle`; assert internal brand state remains; assert each camera button has a unique visible label and accessible name; assert desktop Model Positioning has bounded dimensions and a non-overlapping reserved region.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioShell.test.mjs`  
Expected: FAIL against the visible brand toggle, repeated Elevation View labels, and oversized assembly dock contract.

- [ ] **Step 3: Implement compact controls**

Remove the authenticated toggle rendering without deleting brand data. Render five compact camera controls using short labels and existing camera handlers. On desktop, constrain Model Positioning to a compact collapsible panel and reserve the left camera-control lane; retain the existing mobile layout.

- [ ] **Step 4: Run tests and build**

Run: `node --test tests/studioShell.test.mjs && npm run build`  
Expected: all tests pass; builds complete.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/Viewer3D.jsx src/components/AssemblyAdjustment.jsx src/index.css src/styles/studio-shell.css tests/studioShell.test.mjs
git commit -m "fix: simplify branding and 3D controls"
```

### Task 9: Complete IronWrap Red Studio Styling

**Files:**
- Modify: `src/styles/studio-tokens.css`
- Modify: `src/styles/studio-shell.css`
- Modify: `src/index.css`
- Modify: affected Studio components only where semantic classes are missing
- Test: `tests/studioTokens.test.mjs`
- Test: `tests/studioShell.test.mjs`

**Interfaces:**
- All authenticated Studio surfaces consume `--studio-*` semantic tokens.
- Legacy accent literals are removed or scoped outside `[data-studio-skin='ironwrap']`.

- [ ] **Step 1: Write failing visual-contract tests**

Assert graphite navigation/framing, warm-white canvas/panels, red primary/active/progress controls, semantic menus/fields/cards, and absence of visible legacy blue/purple/teal/orange accent rules inside the Studio skin.

- [ ] **Step 2: Run and verify RED**

Run: `node --test tests/studioTokens.test.mjs tests/studioShell.test.mjs`  
Expected: FAIL because legacy visual literals and neutral components still dominate.

- [ ] **Step 3: Apply semantic Red-Style mapping**

Map existing authenticated controls to Studio primitives/tokens. Keep red restrained to actions, selections, progress, and critical metrics; use graphite/warm-white surfaces elsewhere. Preserve WCAG focus and reduced-motion safeguards.

- [ ] **Step 4: Run full suite and production builds**

Run: `npm test && npm run build`  
Expected: all tests pass; production, artifact, and snapshot builds complete with only the known bundle-size advisory.

- [ ] **Step 5: Commit**

```bash
git add src/styles/studio-tokens.css src/styles/studio-shell.css src/index.css src/components tests/studioTokens.test.mjs tests/studioShell.test.mjs
git commit -m "feat: complete IronWrap Red Studio styling"
```

### Task 10: Preview Migration and Authenticated Release Gate

**Files:**
- Modify: `docs/milestones/2026-07-17-studio-ui-foundation-verification.md`
- Create: `docs/milestones/2026-07-18-studio-correction-verification.md`

**Interfaces:**
- Produces an auditable Preview verification record and release decision.

- [ ] **Step 1: Verify source and migrations locally**

Run: `npm test && npm run build && git diff --check`  
Expected: all automated checks pass; no whitespace errors.

- [ ] **Step 2: Publish the feature branch and wait for Preview**

Push the reviewed commits to `chatgpt/ui-foundation-design`. Confirm the Vercel deployment is `READY` and `/api/auth/me` returns JSON rather than a platform runtime error.

- [ ] **Step 3: Run authenticated functional verification**

Verify: login; New/Open/Save/Download/refresh/Share; existing saved projects; Expert entitlement and preference combinations; company units; trims; custom optional services; 3D positioning; five camera controls; internal brand preservation; desktop/tablet/mobile layouts.

- [ ] **Step 4: Record evidence and unresolved items**

Write exact Preview URL, commit SHA, test totals, observed results, and any blocker into the milestone record. Do not mark an untested row passed.

- [ ] **Step 5: Commit verification evidence**

```bash
git add docs/milestones
git commit -m "docs: verify Studio correction preview"
```

- [ ] **Step 6: Request explicit release approval**

Keep PR #17 in draft until the user confirms the authenticated Preview is acceptable. Do not merge or deploy Production without that approval.
