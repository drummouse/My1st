# Studio Workspace Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the Studio’s settings persistence and rebuild the GPT-sandbox workspace interactions, catalog selection, Presentation controls, and responsive 3D controls to match the approved red-direction concept.

**Architecture:** Keep `App.jsx` as the composition root but move administrative workspace selection and viewer visibility into one explicit shell state. Add a read-only tenant-scoped Library option adapter that feeds a common picker used by Settings, Trims, Services, and authenticated Presentation; public Showroom DTOs remain allowlisted and write-free. Preserve legacy saved-design fields through normalization adapters instead of deleting their historical values.

**Tech Stack:** React/Vite, existing Vercel serverless routes, Neon Postgres, Node test runner, current IronWrap Studio CSS tokens.

## Global Constraints

- Work only on `chatgpt/configurator-gpt-lab`; do not modify PR #17 or Claude branches.
- `GPT_DATABASE_URL` remains server-only; no secrets enter source, browser state, logs, or tests.
- Public Showroom links remain read-only and receive only safe allowlisted catalog/quote/design fields.
- Trims exclusively owns soffit, fascia, gutters, downspouts, garage-door capping, flashing, and custom trims; Services excludes those items.
- New/legacy saved projects must reopen without data loss.
- Administrative sections hide the viewer; Sales, Expert, and authenticated Presentation keep one stable viewer lifecycle.
- Use test-first changes and run the full suite plus production/PWA/artifact/snapshot build before publishing.

---

### Task 1: Repair first-write Settings persistence and truthful errors

**Files:**
- Modify: `configurator/api/settings/index.js`
- Modify: `configurator/src/components/SettingsPanel.jsx`
- Modify: `configurator/tests/settingsSecurity.test.mjs`
- Modify: `configurator/tests/units.test.mjs`
- Create: `configurator/tests/settingsPersistence.test.mjs`

**Interfaces:**
- Consumes: tenant `owner_id`, existing Settings PUT payload, `serializeTenantSettings`.
- Produces: a fully populated owner settings row and a `SETTINGS_PERSISTENCE_FAILED` error contract for non-connectivity write failures.

- [ ] **Step 1: Write failing settings tests**

```js
test('first Settings PUT inserts schema defaults for omitted required discounts', async () => {
  const calls = [];
  const handler = createSettingsHandler({ query: recordingQuery(calls), /* existing injections */ });
  await handler({ method: 'PUT', body: { showExpertMode: true } }, response);
  assert.equal(response.statusCode, 200);
  assert.ok(calls.at(-1).values.includes(0.07));
  assert.ok(calls.at(-1).values.includes(0.5));
});

test('Settings constraint failures are not reported as database unreachable', async () => {
  const handler = createSettingsHandler({ query: async () => { throw new Error('constraint'); }, /* injections */ });
  await handler({ method: 'PUT', body: {} }, response);
  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'SETTINGS_PERSISTENCE_FAILED');
});
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run: `node --test tests/settingsPersistence.test.mjs`

Expected: first insert lacks required discount defaults and error path returns the old generic 500 text.

- [ ] **Step 3: Resolve server-side defaults before the upsert**

```js
const SETTINGS_INSERT_DEFAULTS = {
  gstRate: 0.05,
  fullWrapDiscountPct: 0.07,
  soffitFasciaDiscountPct: 0.5,
  gutterDownspoutFree: true,
};
const insertValues = {
  gstRate: gstRate ?? SETTINGS_INSERT_DEFAULTS.gstRate,
  fullWrapDiscountPct: fullWrapDiscountPct ?? SETTINGS_INSERT_DEFAULTS.fullWrapDiscountPct,
  soffitFasciaDiscountPct: soffitFasciaDiscountPct ?? SETTINGS_INSERT_DEFAULTS.soffitFasciaDiscountPct,
  gutterDownspoutFree: gutterDownspoutFree ?? SETTINGS_INSERT_DEFAULTS.gutterDownspoutFree,
};
```

Use `insertValues` only in the INSERT values list; retain `coalesce(excluded.column, settings.column)` on conflict so partial Settings and Discounts saves do not overwrite one another. Map Postgres constraint errors to HTTP 422 with `SETTINGS_PERSISTENCE_FAILED`; retain 500 only for actual unavailable server/database failures.

- [ ] **Step 4: Make the Settings client display API error text**

```js
const body = await res.json();
if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
```

Show a concise save error without claiming the database is unreachable unless the API explicitly reports that condition.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/settingsPersistence.test.mjs tests/settingsSecurity.test.mjs tests/units.test.mjs`

Expected: PASS.

Commit: `fix: preserve required settings defaults on first save`

### Task 2: Add a tenant-safe Library option adapter and shared searchable picker

**Files:**
- Modify: `configurator/api/custom-services/index.js`
- Modify: `configurator/api/_lib/libraryService.js`
- Create: `configurator/src/lib/libraryOptions.js`
- Create: `configurator/src/components/LibraryOptionPicker.jsx`
- Modify: `configurator/src/App.jsx`
- Create: `configurator/tests/libraryOptions.test.mjs`
- Create: `configurator/tests/libraryOptionPicker.test.mjs`

**Interfaces:**
- Consumes: active owner, global and owner-visible tenant Library records, current materials/custom-services catalogs.
- Produces: `GET /api/custom-services?action=library-options` returning `{ products: LibraryOption[], services: LibraryOption[] }` and a browser picker that emits a complete `LibraryOption`.

```ts
type LibraryOption = {
  id: string;
  source: 'library' | 'material' | 'custom-service';
  kind: 'product' | 'service';
  label: string;
  unit: string;
  unitPrice: number | null;
  colorIds: string[];
  profileLabel: string | null;
  active: boolean;
};
```

- [ ] **Step 1: Write failing option projection tests**

```js
test('tenant Library options include active global and tenant records but never private Library fields', () => {
  const result = toTenantLibraryOptions(records, details, ownerId);
  assert.deepEqual(Object.keys(result.products[0]).sort(), ['active', 'colorIds', 'id', 'kind', 'label', 'profileLabel', 'source', 'unit', 'unitPrice']);
});

test('picker searches labels and returns its selected option once', () => {
  const source = await readComponent('LibraryOptionPicker');
  assert.match(source, /aria-label="Search Library"/);
  assert.match(source, /onSelect\(option\)/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/libraryOptions.test.mjs tests/libraryOptionPicker.test.mjs`

Expected: FAIL because no tenant option projection/action/picker exists.

- [ ] **Step 3: Implement the safe projection and route action**

Add `toTenantLibraryOptions` in `src/lib/libraryOptions.js` and a server equivalent in `libraryService.js`. `library-options` must require the active tenant, return only active records visible to that tenant, map legacy Materials as product options and existing custom services as service options, and never return audit, owner, source credential, project, or customer fields.

In `api/custom-services/index.js`, preserve the existing list/create/update/delete behavior and dispatch `action=library-options` before mutating actions. Do not add another Vercel function.

- [ ] **Step 4: Implement `LibraryOptionPicker`**

```jsx
export default function LibraryOptionPicker({ kind, options, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const visible = options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));
  return <section role="dialog" aria-label={`Add ${kind}`} className="library-option-picker">{/* search and options */}</section>;
}
```

The picker must have a visible close action, empty state, keyboard-reachable options, and no hidden internal price when the caller is public.

- [ ] **Step 5: Hydrate options once in App**

Fetch `/api/custom-services?action=library-options` only for authenticated workspaces. Store options as React state and pass the scoped arrays to Settings, Trims, Services, and authenticated Presentation; do not pass them into `buildShowroomViewModel` for a public route.

- [ ] **Step 6: Verify and commit**

Run: `node --test tests/libraryOptions.test.mjs tests/libraryOptionPicker.test.mjs tests/publicProjectCatalog.test.mjs`

Expected: PASS.

Commit: `feat: expose tenant-safe Library selection options`

### Task 3: Make defaults, Trims, and Services Library-driven without data loss

**Files:**
- Modify: `configurator/src/components/SettingsPanel.jsx`
- Modify: `configurator/src/components/TrimsPanel.jsx`
- Modify: `configurator/src/components/TrimAccentRow.jsx`
- Modify: `configurator/src/components/ExtrasServicesPanel.jsx`
- Modify: `configurator/src/lib/newProjectDesignState.js`
- Modify: `configurator/src/lib/trimAccents.js`
- Modify: `configurator/src/lib/trimServiceBoundary.js`
- Modify: `configurator/src/lib/designState.js`
- Modify: `configurator/api/settings/index.js`
- Modify: `configurator/api/_lib/db.js`
- Modify: `configurator/api/_lib/tenantFeatures.js`
- Modify: `configurator/db/schema.sql`
- Create: `configurator/tests/defaultLibrarySelection.test.mjs`
- Modify: `configurator/tests/trimAccents.test.mjs`
- Modify: `configurator/tests/trimsAndExtrasPanels.test.mjs`
- Modify: `configurator/tests/newProjectDesignState.test.mjs`

**Interfaces:**
- Consumes: `LibraryOptionPicker`, company settings, legacy trim/profile fields, service catalog.
- Produces: `default_catalog_items` settings JSON and project records with selected Library source/label/unit/price snapshot.

```ts
type DefaultCatalogItem = {
  optionId: string;
  kind: 'trim' | 'service';
  label: string;
  quantity: number;
  unit: string;
  locked: boolean;
};
```

- [ ] **Step 1: Write failing data-boundary tests**

```js
test('new-project defaults instantiate every selected Library trim/service and omit removed hardcoded defaults', () => {
  const design = createNewProjectDesign({ companySettings: { default_catalog_items: [trim, service] } });
  assert.equal(design.trimAccents.records[0].productLabel, trim.label);
  assert.equal(design.customServiceLines[0].sourceOptionId, service.optionId);
});

test('garage-door capping is absent until selected and legacy profile text remains visible in product label', () => {
  const normalized = normalizeTrimAccents(legacyGarageDoorDesign);
  assert.equal(normalized.records.some((row) => row.kind === 'garageDoorCapping'), false);
  assert.match(normalized.records[0].productLabel, /K-Style/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/defaultLibrarySelection.test.mjs tests/trimAccents.test.mjs tests/newProjectDesignState.test.mjs`

Expected: FAIL because defaults are fixed switches and trim rows use separate profile controls.

- [ ] **Step 3: Add settings storage and serialization**

Add nullable `default_catalog_items jsonb` to `db/schema.sql` and idempotently in `ensureSchema`, include it in Settings GET/PUT/projection, validate each element against the `DefaultCatalogItem` shape, and leave legacy `default_services` / `default_custom_service_ids` readable for old owners. Do not delete legacy columns.

- [ ] **Step 4: Replace Settings fixed controls with Add Product/Add Service**

Remove Snow Retention, Cap Flashing, and Garage Door Capping from `SERVICE_KEYS`. Render selected default catalog items as editable rows with quantity/lock/remove controls. `Add Product` opens `LibraryOptionPicker kind="product"`; `Add Service` opens `kind="service"`.

- [ ] **Step 5: Simplify Trims and modernize Services**

Change `TrimAccentRow` to one visible Product selector and retain color, quantity, unit, lock, and remove controls. Compose the practical display label from selected product plus legacy profile when needed; never expose a separate Profile field. Remove Garage Door Capping from default trim creation.

Change `ExtrasServicesPanel` primary action to Add Service and append selected Library service lines. Keep non-trim custom services compatible; reject trim keys through `trimServiceBoundary` before they can appear in Services.

- [ ] **Step 6: Materialize defaults in new project state**

```js
for (const item of companySettings?.default_catalog_items || []) {
  if (item.kind === 'trim') addDefaultTrim(design, item, catalogById[item.optionId]);
  if (item.kind === 'service') addDefaultService(design, item, catalogById[item.optionId]);
}
```

Use snapshots for label/unit/price so a saved design remains stable if the Library changes later.

- [ ] **Step 7: Verify and commit**

Run: `node --test tests/defaultLibrarySelection.test.mjs tests/trimAccents.test.mjs tests/trimsAndExtrasPanels.test.mjs tests/newProjectDesignState.test.mjs`

Expected: PASS.

Commit: `feat: drive defaults trims and services from Library options`

### Task 4: Separate administration from the viewer and fix header overlays

**Files:**
- Modify: `configurator/src/App.jsx`
- Modify: `configurator/src/components/workspaces/WorkspaceTopBar.jsx`
- Modify: `configurator/src/components/workspaces/SalesModeShell.jsx`
- Modify: `configurator/src/components/workspaces/ExpertWorkspaceShell.jsx`
- Create: `configurator/src/components/workspaces/AdminWorkspaceShell.jsx`
- Modify: `configurator/src/styles/workspace-modes.css`
- Modify: `configurator/src/styles/studio-shell.css`
- Modify: `configurator/tests/appWorkspaceIntegration.test.mjs`
- Modify: `configurator/tests/workspaceFrame.test.mjs`
- Modify: `configurator/tests/workspaceResponsive.test.mjs`

**Interfaces:**
- Consumes: `activeSection`, existing panel components, `returnToSales`, workspace mode state.
- Produces: `isAdministrativeSection(section)` and `AdminWorkspaceShell({ title, onClose, children })`.

- [ ] **Step 1: Write failing composition and CSS contract tests**

```js
test('administrative sections mount a full-screen shell and do not mount ViewerStage', async () => {
  const app = await readApp();
  assert.match(app, /isAdministrativeSection\(activeSection\)/);
  assert.match(app, /<AdminWorkspaceShell/);
});

test('desktop Account and Project menus are absolute overlays below their trigger', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  assert.match(css, /\.workspace-topbar-menu-popover\s*\{[^}]*position:\s*absolute[^}]*top:\s*calc\(100%/s);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/appWorkspaceIntegration.test.mjs tests/workspaceFrame.test.mjs tests/workspaceResponsive.test.mjs`

Expected: FAIL because administrative content is inserted beside the workspace viewer and menu layout participates in header flow.

- [ ] **Step 3: Add `AdminWorkspaceShell` and explicit section predicate**

```js
const ADMINISTRATIVE_SECTIONS = new Set(['settings', 'discounts', 'customServices', 'materials', 'platform']);
const isAdministrativeSection = (section) => ADMINISTRATIVE_SECTIONS.has(section);
```

When true, App renders the compact application header plus `AdminWorkspaceShell`; it does not construct the Sales/Expert/Showroom viewer region. Its Close action sets `activeSection` to `configurator` and restores Sales unless an authenticated presentation is active.

- [ ] **Step 4: Anchor menus and widen desktop header**

Set `.workspace-topbar-menu { position: relative; }` and `.workspace-topbar-menu-popover { position: absolute; inset: calc(100% + .4rem) 0 auto auto; z-index: ...; }`. Remove any popover rule that changes parent block height. Increase the desktop brand/navigation track by 40% relative to its current cap, scale logo/text tokens proportionally, and preserve the existing compact/mobile drawer rules.

- [ ] **Step 5: Verify detail/viewer restoration and commit**

Add a contract assertion that closing inspector details restores `minmax(0, 1fr)` viewer space without a reserved blank row. Run: `node --test tests/appWorkspaceIntegration.test.mjs tests/workspaceFrame.test.mjs tests/workspaceResponsive.test.mjs`

Expected: PASS.

Commit: `fix: contain Studio menus and administrative workspaces`

### Task 5: Rebuild desktop/mobile model positioning and camera controls

**Files:**
- Modify: `configurator/src/components/AssemblyAdjustment.jsx`
- Modify: `configurator/src/components/workspaces/ViewerStage.jsx`
- Modify: `configurator/src/components/Viewer3D.jsx`
- Modify: `configurator/src/styles/workspace-modes.css`
- Modify: `configurator/src/styles/studio-shell.css`
- Modify: `configurator/tests/studioShell.test.mjs`
- Modify: `configurator/tests/workspaceResponsive.test.mjs`
- Create: `configurator/tests/modelPositioningControls.test.mjs`

**Interfaces:**
- Consumes: layer offset callbacks and camera shortcut callbacks.
- Produces: compact `ModelPositioningPanel` behavior with `open`, `onClose`, numeric increment/decrement, and non-overlapping camera actions.

- [ ] **Step 1: Write failing positioning contracts**

```js
test('positioning has a close action, range input, numeric input, and adjacent decrement/increment buttons per axis', async () => {
  const source = await readComponent('AssemblyAdjustment');
  assert.match(source, /aria-label="Close model positioning"/);
  assert.match(source, /aria-label="Decrease .* offset"/);
  assert.match(source, /aria-label="Increase .* offset"/);
});

test('viewer controls name Front Back Left Right and Top and reserve separate corners', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  assert.match(css, /\.viewer-direction-controls/);
  assert.doesNotMatch(css, /left.*model-positioning/s);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/modelPositioningControls.test.mjs tests/studioShell.test.mjs tests/workspaceResponsive.test.mjs`

Expected: FAIL because positioning lacks a reliable close state and directional controls collide with it.

- [ ] **Step 3: Implement compact controls**

Render each axis as label, thick range slider, numeric input, and a right-side button group: `−`, decrement arrow, increment arrow, `+`. Keep keyboard input and bounded min/max behavior. Move the desktop panel to one dedicated viewer corner, reduce its desktop width/height by about 20%, and reserve the opposite corner for directional camera controls.

- [ ] **Step 4: Implement mobile sheet lifecycle**

Use `positioningOpen` state in `ViewerStage`; show a visible `Close model positioning` button. At `max-width: 767px`, make it a bottom sheet beneath the header with `max-height: calc(100dvh - var(--workspace-topbar-h) - .75rem)` and internal scrolling. On close, remove the sheet from layout so the viewer fills the released region.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/modelPositioningControls.test.mjs tests/studioShell.test.mjs tests/workspaceResponsive.test.mjs`

Expected: PASS.

Commit: `fix: compact and contain model positioning controls`

### Task 6: Add editable authenticated Presentation while preserving public Showroom safety

**Files:**
- Modify: `configurator/src/App.jsx`
- Modify: `configurator/src/components/workspaces/ShowroomModeShell.jsx`
- Modify: `configurator/src/components/workspaces/ShowroomCategoryRail.jsx`
- Modify: `configurator/src/lib/customerContext.js`
- Modify: `configurator/src/lib/publicDesign.js`
- Modify: `configurator/tests/showroomModeShell.test.mjs`
- Modify: `configurator/tests/customerContext.test.mjs`
- Modify: `configurator/tests/publicDesign.test.mjs`

**Interfaces:**
- Consumes: `workspaceState.session`, authenticated catalog option arrays, existing product/color setters.
- Produces: `presentationEditable` only for authenticated presentation sessions, never for public routes.

- [ ] **Step 1: Write failing safety and presentation tests**

```js
test('authenticated presentation exposes product/profile/color add-remove callbacks', async () => {
  const source = await readComponent('ShowroomModeShell');
  assert.match(source, /presentationEditable/);
  assert.match(source, /onAddProduct/);
  assert.match(source, /onRemoveProduct/);
});

test('public Showroom never receives picker options or write callbacks', async () => {
  const app = await readApp();
  assert.match(app, /presentationEditable:\s*!isCustomerView/);
  assert.doesNotMatch(publicDesign, /unitPrice|onAddProduct|onRemoveProduct/);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/showroomModeShell.test.mjs tests/customerContext.test.mjs tests/publicDesign.test.mjs`

Expected: FAIL because Presentation currently exposes color-only controls.

- [ ] **Step 3: Add mode-gated controls**

Derive `presentationEditable` from an authenticated presentation session, not from the visual mode alone. When true, pass category-compatible product/profile options and add/remove callbacks to `ShowroomModeShell`; update in-memory design, catalog snapshots, and estimate through the same callbacks used by Sales. When false, omit all write controls and option metadata.

- [ ] **Step 4: Make categories explicit**

Support Roof, Siding, Accents, Doors, and Gutters. Where geometry is unavailable, retain the category with a visible unavailable explanation. A selected category must filter options by kind/compatibility rather than expose a raw unrestricted catalog.

- [ ] **Step 5: Verify and commit**

Run: `node --test tests/showroomModeShell.test.mjs tests/customerContext.test.mjs tests/publicDesign.test.mjs tests/appWorkspaceIntegration.test.mjs`

Expected: PASS.

Commit: `feat: make authenticated Presentation catalog-editable`

### Task 7: Red-direction visual regression pass and release verification

**Files:**
- Modify: `configurator/src/styles/workspace-modes.css`
- Modify: `configurator/src/styles/studio-shell.css`
- Modify: `configurator/tests/workspaceVisualContract.test.mjs`
- Modify: `configurator/tests/redStyle.test.mjs`
- Create: `configurator/docs/milestones/2026-07-20-studio-workspace-correction-verification.md`

**Interfaces:**
- Consumes: all prior shell/control contracts and the approved `ui-concept-04-red-direction.png` reference.
- Produces: recorded GPT Preview verification evidence for the correction release.

- [ ] **Step 1: Write failing visual-contract tests**

```js
test('desktop correction shell keeps graphite structure warm inspector surfaces and red-only primary emphasis', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  assert.match(css, /--workspace-topbar-h:/);
  assert.match(css, /--studio-red:/);
  assert.doesNotMatch(css, /background:\s*#d11f2a[^;]*;\s*min-height:\s*100vh/);
});
```

- [ ] **Step 2: Run and confirm failure if the visual contract is not represented**

Run: `node --test tests/workspaceVisualContract.test.mjs tests/redStyle.test.mjs`

Expected: PASS only after the new header, full-screen admin, and viewer-control selectors are represented.

- [ ] **Step 3: Complete scoped CSS polish**

Keep all new styling under `.workspace-root`. Verify desktop rails/inspectors remain compact, primary red is not used as a page surface, warm-white panels remain readable, and mobile sheets keep reachable close actions and 44px controls.

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run build`

Expected: production app, PWA service worker, Share artifact, and snapshot template build successfully. Existing bundle-size advisories may remain, but no build failure is allowed.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Verify GPT Preview manually and record evidence**

Verify Settings save and Expert toggle; Account/Project overlays; full-screen admin sections; new-project Add Product/Add Service; Trims-only accessories; editable authenticated Presentation; public Share read-only; desktop directional controls/no overlap; mobile positioning close; and close-details viewer fill. Record the exact commit, deployment, and results in the milestone file.

- [ ] **Step 6: Commit**

Commit: `docs: verify Studio workspace correction release`
