import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readComponent = (name) => readFile(
  new URL(`../src/components/${name}.jsx`, import.meta.url),
  'utf8',
);

const readApp = () => readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const readIndexCss = () => readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const readSettingsRoute = () => readFile(new URL('../api/settings/index.js', import.meta.url), 'utf8');
const readFoundationMilestone = () => readFile(
  new URL('../docs/milestones/2026-07-17-studio-ui-foundation-verification.md', import.meta.url),
  'utf8',
);

test('Studio UI foundation milestone names every protected behavior', async () => {
  const milestone = await readFoundationMilestone();

  for (const behavior of [
    'login',
    'real XML',
    'rotatable 3D',
    'products/profiles/colors',
    'facet overrides',
    'measurements',
    'estimate',
    'save/refresh',
    'Share Design HTML',
    'PDF',
    'customer context',
    'Expert toggle',
    'Platform',
    'Library',
    'responsive layouts',
  ]) {
    assert.match(milestone, new RegExp(behavior, 'i'));
  }
});

test('Studio top bar exposes expert mode as a pressed toggle', async () => {
  const source = await readComponent('StudioTopBar');

  assert.match(source, /aria-pressed=\{expertActive\}/);
});

test('Settings exposes only the entitled tenant preference through its save flow', async () => {
  const settings = await readComponent('SettingsPanel');
  const route = await readSettingsRoute();

  assert.match(settings, /expertModeEntitled:\s*row\.expertModeEntitled === true/);
  assert.match(settings, /showExpertMode:\s*row\.show_expert_mode === true/);
  assert.match(settings, /\{form\.expertModeEntitled && \([\s\S]*?Show Expert Mode/);
  assert.match(settings, /checked=\{!!form\.showExpertMode\}/);
  assert.match(settings, /\.\.\.\(form\.expertModeEntitled\s*\?\s*\{ showExpertMode: form\.showExpertMode \}\s*:\s*\{\}\)/);
  assert.doesNotMatch(settings, /EXPERT_MODE_VAR/);

  assert.match(route, /showExpertMode/);
  assert.match(route, /show_expert_mode = case[\s\S]*?expert_mode_enabled/);
  assert.match(route, /Object\.hasOwn\(body, 'EXPERT_MODE_VAR'\)[\s\S]*?status\(400\)/);
});

test('Settings exposes one company-level measurement system selector', async () => {
  const settings = await readComponent('SettingsPanel');
  const route = await readSettingsRoute();

  assert.match(settings, /unitSystem:\s*row\.unit_system/);
  assert.match(settings, /id="settings-unit-system"/);
  assert.match(settings, /<option value="imperial">Imperial/);
  assert.match(settings, /<option value="metric">Metric/);
  assert.match(settings, /unitSystem:\s*form\.unitSystem/);
  assert.match(route, /unit_system/);
});

test('App gates the top-bar Expert control with effective entitlement and preference', async () => {
  const app = await readApp();

  assert.match(app, /canShowExpertControl\(\{[\s\S]*?role:\s*currentUser\?\.role[\s\S]*?entitled:\s*companySettings\?\.expertModeEntitled[\s\S]*?tenantPreference:\s*companySettings\?\.show_expert_mode[\s\S]*?\}\)/);
  assert.match(app, /tenantEntitlement:\s*companySettings\?\.expertModeEntitled === true/);
  assert.match(app, /\{showExpertControl && workspaceState\.mode === 'sales' && \([\s\S]*?requestExpert\(\);[\s\S]*?Expert mode/);
  assert.doesNotMatch(app, /canUseExpert/);
});

test('Studio top bar exposes the active project through an accessible actions disclosure', async () => {
  const topBar = await readComponent('StudioTopBar');

  assert.match(topBar, /projectLabel/);
  assert.match(topBar, /projectStatus/);
  assert.match(topBar, /aria-expanded=\{projectMenuOpen\}/);
  assert.match(topBar, /aria-controls=\{projectMenuId\}/);
  assert.match(topBar, /aria-labelledby=\{projectMenuButtonId\}/);
  assert.match(topBar, /aria-haspopup="menu"/);
  assert.match(topBar, /role="menu"/);
  assert.equal((topBar.match(/<button role="menuitem"/g) || []).length, 4);
  assert.match(topBar, /onKeyDown=\{handleProjectMenuButtonKeyDown\}/);
  assert.match(topBar, /onKeyDown=\{handleProjectMenuKeyDown\}/);
  assert.match(topBar, /focusProjectMenuBoundary/);
  assert.match(topBar, /moveProjectMenuFocus/);
  assert.match(topBar, /event\.key === 'Escape'/);
  assert.match(topBar, /document\.addEventListener\('pointerdown', handlePointerDown\)/);
  assert.match(topBar, /projectMenuRef\.current\?\.contains\(event\.target\)/);
  assert.match(topBar, /setProjectMenuOpen\(false\)/);
  assert.doesNotMatch(topBar, /\.catch\(\(\) => \{\}\)/);
  assert.match(topBar, /\{projectLabel\}/);
  assert.match(topBar, /\{projectStatus\}/);
  for (const actionName of ['New Project', 'Open Project', 'Save \/ Download', 'Share Design']) {
    assert.match(topBar, new RegExp(`>${actionName.replace('/', '\\/')}<`));
  }
});

test('Studio project menu executes shared App actions and explains unavailable operations', async () => {
  const app = await readApp();
  const topBar = await readFile(new URL('../src/components/workspaces/WorkspaceTopBar.jsx', import.meta.url), 'utf8');
  const projectsPanel = await readComponent('ProjectsPanel');

  assert.match(app, /const handleOpenProjectTools = \(\) => \{[\s\S]*?setActiveSection\('configurator'\);[\s\S]*?returnToSales\(\);[\s\S]*?setActiveStudioStep\('project'\);[\s\S]*?setMobileInspectorOpen\(true\);[\s\S]*?\};/);
  assert.match(app, /const handleSaveProject = async \(\) => \{[\s\S]*?saveOrUpdateProject\(design, currentProjectId\)[\s\S]*?setOwnerProjectId\(saved\.id\)[\s\S]*?markDesignPersisted\(design\)[\s\S]*?downloadProjectFile\(/);
  assert.match(app, /label: `\$\{house\.jobNumber \|\| 'Untitled project'\} · \$\{projectSaveStatus\}`/);
  assert.doesNotMatch(app, /projectStatus=\{currentProjectId \? 'Saved' : 'Not saved'\}/);
  assert.match(app, /menu: \([\s\S]*?closeProjectMenuAndRun\(handleOpenProjectTools\)[\s\S]*?closeProjectMenuAndRun\(handleSaveProject\)[\s\S]*?closeProjectMenuAndRun\(handleExportHtml\)/);
  assert.match(app, /disabled=\{projectActionBusy \|\| !projectOperations\.canOpen\}/);
  assert.match(app, /disabled=\{projectActionBusy \|\| !projectOperations\.canSave\}/);
  assert.match(app, /disabled=\{projectActionBusy \|\| !projectOperations\.canShare\}/);
  assert.match(app, /actions=\{\{[\s\S]*?busy: projectActionBusy,[\s\S]*?onNew: handleNewProject/);
  assert.match(app, /onSaveProject=\{handleSaveProject\}/);
  assert.match(projectsPanel, /onSaveProject/);
  assert.match(projectsPanel, /return onSaveProject\(\);/);
  assert.doesNotMatch(projectsPanel, /saveOrUpdateProject/);

  assert.match(topBar, /actions\.onNew/);
  assert.match(topBar, /disabled=\{projectBusy\}/);
  assert.match(topBar, /\{config\.menu\}/);
  assert.match(topBar, /focusProjectMenuBoundary/);
  assert.match(topBar, /moveProjectMenuFocus/);
  assert.match(app, /onMenuClose: setProjectMenuOpen/);
  assert.match(app, /\{projectActionStatus && <span role="status" aria-live="polite">\{projectActionStatus\}<\/span>\}/);
  assert.match(app, /const handleNewProject = \(\) => \{\s*if \(projectActionBusy\) return;/);
  assert.match(app, /showTimedProjectActionStatus\('Could not reach the Projects database[^']*'\);\s*return null;/);
  assert.doesNotMatch(app, /showTimedProjectActionStatus\('Could not reach the Projects database[^']*'\);\s*throw error;/);
});

test('every inspector identity action is disabled while the shared save is in flight', async () => {
  const app = await readApp();
  const layersPanel = await readComponent('LayersPanel');
  const projectsPanel = await readComponent('ProjectsPanel');

  assert.match(app, /<LayersPanel[\s\S]*?projectOperationBusy=\{projectActionBusy\}/);
  assert.match(app, /<ProjectsPanel[\s\S]*?operationBusy=\{projectActionBusy\}/);
  assert.match(app, /<ProjectsPanel[\s\S]*?onOperationBusyChange=\{setProjectActionBusy\}/);
  assert.match(layersPanel, /onClick=\{onNewProject\}[\s\S]*?disabled=\{projectOperationBusy\}/);
  assert.match(projectsPanel, /if \(operationBusy \|\| !canOpen\) return;/);
  assert.match(projectsPanel, /if \(operationBusy\) return;\s*if \(!window\.confirm\('Delete this project\?/);
  assert.match(projectsPanel, /disabled=\{busy \|\| operationBusy \|\| !canOpen\}/);
  assert.match(projectsPanel, /disabled=\{busy \|\| operationBusy\}/);
  assert.match(projectsPanel, /onClick=\{handleDownload\} disabled=\{busy \|\| operationBusy \|\| !canSave\}/);
  assert.doesNotMatch(projectsPanel, /withStatus\('Saving\.\.\.'/);
});

test('saved facet overrides survive project application and only removed-layer overrides are cleared', async () => {
  const app = await readApp();

  assert.doesNotMatch(app, /useEffect\(\(\) => \{\s*setFacetOverrides\(\{\}\);\s*setSelectedFacet\(null\);\s*\}, \[parsedLayers\]\);/);
  assert.match(app, /const handleRemoveLayer = \(id\) => \{[\s\S]*?if \(!key\.startsWith\(`\$\{id\}:`\)\) next\[key\] = val;/);
  assert.match(app, /const restoredDesign = applyDesignSnapshot\(row\.design, false\);\s*if \(!restoredDesign\) throw new Error\('Saved project design is unavailable\.'\);\s*setCurrentProjectId\(projectId\);/);
});

test('every startup share format rejects an unapplied design before assigning project identity', async () => {
  const app = await readApp();

  assert.match(app, /const restoredDesign = requireAppliedDesign\(\s*applyDesignSnapshot\(loaded\.design, true\),\s*'Shared design is unavailable\.',\s*\);/);
  assert.match(app, /if \(loaded\.projectId\) \{\s*setCurrentProjectId\(loaded\.projectId\);\s*markDesignPersisted\(restoredDesign\);/);
  assert.equal((app.match(/loadPublicDesignEntry\(entry,/g) || []).length, 1);
});

test('ProjectsPanel lifts Open and Delete into the shared project operation lock', async () => {
  const panel = await readComponent('ProjectsPanel');

  assert.match(panel, /onOperationBusyChange/);
  assert.match(panel, /setBusy\(true\);\s*onOperationBusyChange\?\.\(true\);/);
  assert.match(panel, /finally \{\s*setBusy\(false\);\s*onOperationBusyChange\?\.\(false\);/);
});

test('Share Design holds the shared project operation lock through identity assignment', async () => {
  const app = await readApp();
  const shareHandler = app.match(/const handleExportHtml = async \(\) => \{([\s\S]*?)\n  \};\n\n  const handleExportPdf/)?.[1];

  assert.ok(shareHandler, 'Share Design handler should remain explicit');
  assert.match(shareHandler, /if \(!projectOperations\.canShare \|\| projectActionBusy\) return null;/);
  assert.match(shareHandler, /setProjectActionBusy\(true\);/);
  assert.match(shareHandler, /setProjectActionStatus\('Preparing shared design\.\.\.'\);/);
  assert.match(shareHandler, /saveOrUpdateProject\(state, currentProjectId\)[\s\S]*?setOwnerProjectId\(saved\.id\);/);
  assert.match(shareHandler, /showTimedProjectActionStatus\(saved\?\.id[\s\S]*?'Shared design downloaded\.'/);
  assert.match(shareHandler, /finally \{\s*setProjectActionBusy\(false\);\s*\}/);
  assert.match(app, /onClick=\{handleExportHtml\} disabled=\{projectActionBusy \|\| !projectOperations\.canShare\}/);
});

test('Share Design reconciles a fulfilled project save before returning on template failure', async () => {
  const app = await readApp();
  const shareHandler = app.match(/const handleExportHtml = async \(\) => \{([\s\S]*?)\n  \};\n\n  const handleExportPdf/)?.[1];

  assert.ok(shareHandler, 'Share Design handler should remain explicit');
  assert.match(
    shareHandler,
    /if \(projectSaveResult\.status === 'fulfilled'\) \{[\s\S]*?saved = projectSaveResult\.value;[\s\S]*?setOwnerProjectId\(saved\.id\);[\s\S]*?markDesignPersisted\(state\);[\s\S]*?if \(templateResult\.status === 'rejected'\)/,
  );
  assert.equal((shareHandler.match(/setOwnerProjectId\(saved\.id\)/g) || []).length, 1);
  assert.equal((shareHandler.match(/markDesignPersisted\(state\)/g) || []).length, 1);
});

test('App derives dirty state from database persistence and gates owner writes until pricing settles', async () => {
  const app = await readApp();
  const projectsPanel = await readComponent('ProjectsPanel');

  assert.match(app, /import \{[\s\S]*?captureDesignState,[\s\S]*?applyDesignState,[\s\S]*?createStableDesignNormalizer,[\s\S]*?decodeDesignFromUrl,[\s\S]*?\} from '\.\/lib\/designState\.js';/);
  assert.match(app, /import \{[^}]*createDeferredDesignApplication[^}]*createInitialEditRestore[^}]*designFingerprint[^}]*getDesignPersistenceState[^}]*getProjectOperationState[^}]*getProjectSaveStatus[^}]*requireAppliedDesign[^}]*\} from '\.\/lib\/studioDesignState\.js';/);
  assert.match(app, /const \[persistedDesignFingerprint, setPersistedDesignFingerprint\] = useState\(null\);/);
  assert.match(app, /const \[companySettingsSettled, setCompanySettingsSettled\] = useState\(false\);/);
  assert.match(app, /const \[defaultCatalogsSettled, setDefaultCatalogsSettled\] = useState\(false\);/);
  assert.match(app, /const \[libraryOptionsSettled, setLibraryOptionsSettled\] = useState\(false\);/);
  assert.match(app, /const stableDesignNormalizerRef = useRef\(null\);/);
  assert.match(app, /buildAccountDefaultDesignSnapshot\(\{[\s\S]*?companySettings,[\s\S]*?customServiceCatalog,[\s\S]*?effectivePricingSettings,[\s\S]*?\}\)/);
  assert.match(app, /stableDesignNormalizerRef\.current[\s\S]*?!companySettingsSettled[\s\S]*?!defaultCatalogsSettled[\s\S]*?!libraryOptionsSettled[\s\S]*?\) return;/);
  assert.match(app, /stableDesignNormalizerRef\.current = createStableDesignNormalizer\(accountDefaults\);[\s\S]*?setDesignDefaultsReady\(true\);/);
  assert.match(app, /const initialEditRestoreRef = useRef\(null\);/);
  assert.match(app, /initialEditRestoreRef\.current = createInitialEditRestore\(window\.location\.search\);/);
  assert.match(app, /const currentDesignFingerprint = useMemo\([\s\S]*?designFingerprint\(currentDesignSnapshot\)/);
  assert.match(app, /const persistence = getDesignPersistenceState\(\{[\s\S]*?isCustomerView,[\s\S]*?companySettingsSettled,[\s\S]*?effectivePricingSettings,[\s\S]*?\}\);/);
  assert.match(app, /const projectOperations = getProjectOperationState\(\{[\s\S]*?accountSettled: Boolean\(currentUser\),[\s\S]*?defaultsReady: designDefaultsReady,[\s\S]*?persistenceReady: persistence\.ready,[\s\S]*?\}\);/);
  assert.match(app, /const markDesignPersisted = \(design\) => \{[\s\S]*?setPricingSettings\(design\.pricingSettings\);[\s\S]*?setPersistedDesignFingerprint\(designFingerprint\(design\)\);[\s\S]*?\};/);
  assert.doesNotMatch(app, /settlePersistedDesignPricing|pendingPersistedPricingRef|persistedDesignRef/);
  assert.doesNotMatch(app, /normalizeDesignState\(snapshot, currentDesignSnapshot\)/);
  assert.match(app, /const applyCurrentDesignState = \(design\) => \{[\s\S]*?applyDesignState\(design,[\s\S]*?return design;[\s\S]*?\};/);
  assert.match(app, /const normalizedDesign = stableDesignNormalizerRef\.current\?\.\(snapshot\);[\s\S]*?applyCurrentDesignState\(normalizedDesign\);[\s\S]*?return normalizedDesign;/);
  assert.match(app, /const newProjectDesign = buildNewProjectDesignSnapshot\(\{[\s\S]*?companySettings,[\s\S]*?customServiceCatalog,[\s\S]*?\}\);[\s\S]*?applyCurrentDesignState\(newProjectDesign\);/);
  assert.match(app, /applyCurrentDesignState\(newProjectDesign\);[\s\S]*?setPhotoOverlay\(null\);[\s\S]*?setAttachments\(\[\]\);/);
  assert.doesNotMatch(app, /applyDesignSnapshot\(\{ version: 2 \}, false\)/);
  assert.match(app, /getProjectSaveStatus\(\{[\s\S]*?currentProjectId,[\s\S]*?currentDesignFingerprint,[\s\S]*?persistedDesignFingerprint,[\s\S]*?persistenceReady: persistence\.ready,[\s\S]*?\}\)/);
  assert.match(app, /const projectId = initialEditRestoreRef\.current\.claim\(designDefaultsReady\);[\s\S]*?const restoredDesign = applyDesignSnapshot\(row\.design, false\);[\s\S]*?markDesignPersisted\(restoredDesign\);/);
  assert.doesNotMatch(app, /getEditProjectId\(window\.location\.search\)/);
  assert.match(app, /const restoredDesign = applyDesignSnapshot\(row\.design, false\);[\s\S]*?markDesignPersisted\(restoredDesign\);/);
  assert.match(app, /!isCustomerView && \(/);
  assert.match(app, /if \(!projectOperations\.canShare \|\| projectActionBusy\) return null;/);
  assert.match(app, /onClick=\{handleExportHtml\} disabled=\{projectActionBusy \|\| !projectOperations\.canShare\}/);
  assert.match(app, /!projectOperations\.canShare && <div className="control-sublabel" role="status">\{projectOperations\.message\}<\/div>/);
  assert.match(app, /canOpen=\{projectOperations\.canOpen\}/);
  assert.match(app, /canSave=\{projectOperations\.canSave\}/);
  assert.match(app, /persistenceMessage=\{projectOperations\.message\}/);
  assert.match(app, /onDesignPersisted=\{markDesignPersisted\}/);
  assert.match(projectsPanel, /canOpen/);
  assert.match(projectsPanel, /canSave/);
  assert.match(projectsPanel, /persistenceMessage/);
  assert.match(projectsPanel, /if \(operationBusy \|\| !canSave\) return;/);
  assert.match(projectsPanel, /if \(operationBusy \|\| !canOpen\) return;/);
  assert.match(projectsPanel, /onClick=\{handleDownload\} disabled=\{busy \|\| operationBusy \|\| !canSave\}/);
  assert.match(projectsPanel, /onClick=\{\(\) => handleOpen\(p\.id\)\}[\s\S]*?disabled=\{busy \|\| operationBusy \|\| !canOpen\}/);
  assert.match(app, /markDesignPersisted\(design\);[\s\S]*?downloadProjectFile\(saved\.id, design, defaultProjectName\(house\)\);/);
  assert.match(projectsPanel, /const restoredDesign = await onOpenProject\(row\.design\);/);
  assert.match(projectsPanel, /onDesignPersisted\?\.\(restoredDesign\)/);
});

test('project open queues fetched design until defaults are ready before changing identity', async () => {
  const app = await readApp();
  const projectsPanel = await readComponent('ProjectsPanel');

  assert.match(app, /const projectDesignApplicationRef = useRef\(null\);[\s\S]*?projectDesignApplicationRef\.current = createDeferredDesignApplication\(\);/);
  assert.match(app, /stableDesignNormalizerRef\.current = createStableDesignNormalizer\(accountDefaults\);[\s\S]*?projectDesignApplicationRef\.current\.setReady\(\(snapshot\) => applyDesignSnapshot\(snapshot, false\)\);[\s\S]*?setDesignDefaultsReady\(true\);/);
  assert.match(app, /onOpenProject=\{projectDesignApplicationRef\.current\.apply\}/);
  assert.match(projectsPanel, /const restoredDesign = await onOpenProject\(row\.design\);\s+if \(!restoredDesign\) throw new Error\('[^']+'\);\s+onProjectIdChange\(id\);/);
});

test('manual queued project open cancels startup edit restoration before queueing', async () => {
  const app = await readApp();
  const projectsPanel = await readComponent('ProjectsPanel');

  assert.match(app, /const cancelInitialEditRestore = \(\) => initialEditRestoreRef\.current\.cancel\(\);/);
  assert.match(app, /onOpenProjectStart=\{cancelInitialEditRestore\}/);
  assert.match(projectsPanel, /if \(operationBusy \|\| !canOpen\) return;\s+onOpenProjectStart\?\.\(\);\s+return withStatus\('Opening\.\.\.', 'Project loaded\.'/);
});

test('guided step rail identifies and labels the active step without relying on color', async () => {
  const source = await readComponent('GuidedStepRail');

  assert.match(source, /aria-current=\{active \? 'step' : undefined\}/);
  assert.match(source, /active && <span[^>]*> \(Current step\)<\/span>/);
});

test('context inspector connects its mobile disclosure control to hidden content', async () => {
  const source = await readComponent('ContextInspector');

  assert.match(source, /import \{ useId \} from 'react';/);
  assert.match(source, /const contentId = useId\(\);/);
  assert.match(source, /aria-expanded=\{mobileOpen\}/);
  assert.match(source, /aria-controls=\{contentId\}/);
  assert.match(source, /id=\{contentId\}/);
  assert.match(source, /hidden=\{!mobileOpen\}/);
  assert.match(source, /<h2[^>]*>\{title\}<\/h2>/);
});

test('context inspector keeps step content available while exposing bounded recovery feedback', async () => {
  const source = await readComponent('ContextInspector');

  assert.match(source, /aria-busy=\{busy\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /\{error\}/);
  assert.match(source, /\{onRetry && \(/);
  assert.match(source, /recoveryLabel = 'Try again'/);
  assert.match(source, /\{recoveryLabel\}/);
  assert.match(source, /disabled=\{busy\}/);
  assert.match(source, /\{children\}/);
  assert.doesNotMatch(source, /error\.(?:stack|body|response)/);
});

test('viewer workspace exposes named model visibility and full screen controls', async () => {
  const source = await readComponent('ViewerWorkspace');

  assert.match(source, /from '\.\/ui\/StudioButton\.jsx'/);
  assert.match(source, /aria-label="Hide 3D Model"/);
  assert.match(source, /aria-label="Full Screen"/);
  assert.match(source, /onViewerModeChange\(/);
  assert.match(source, /\{children\}/);
});

test('viewer full screen mode covers the complete app and normal mode restores flow layout', async () => {
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');
  const fullscreenRule = css.match(/\.viewer-workspace\.viewer-maximized\s*\{([^}]*)\}/)?.[1];

  assert.ok(fullscreenRule, 'maximized viewer should have a dedicated shell-level rule');
  assert.match(fullscreenRule, /position:\s*fixed/);
  assert.match(fullscreenRule, /inset:\s*0/);
  assert.match(fullscreenRule, /z-index:\s*\d+/);
  assert.match(fullscreenRule, /height:\s*100dvh/);
  assert.doesNotMatch(css, /\.viewer-workspace\.viewer-normal\s*\{[^}]*position:\s*fixed/s);
});

test('estimate dock uses its supplied estimate without calculating totals', async () => {
  const source = await readComponent('EstimateDock');

  assert.match(source, /function EstimateDock\(\{ estimate,/);
  assert.match(source, /aria-label="Previous step"/);
  assert.match(source, /aria-label="Next step"/);
  assert.match(source, /onPrevious/);
  assert.match(source, /onNext/);
  assert.doesNotMatch(source, /calculateEstimate/);
  assert.doesNotMatch(source, /pricingEngine/);
});

test('sales step content maps each approved step to supplied content without domain imports', async () => {
  const source = await readComponent('SalesStepContent');

  for (const [step, content] of Object.entries({
    project: 'projectContent',
    roof: 'roofContent',
    siding: 'sidingContent',
    accents: 'accentsContent',
    services: 'servicesContent',
    review: 'reviewContent',
  })) {
    assert.match(source, new RegExp(`${step}: ['\"]${content}['\"]`));
  }

  assert.match(source, /const contentKey = CONTENT_BY_STEP\[activeStep\] \|\| 'projectContent';/);
  assert.match(source, /return content\[contentKey\] \|\| null;/);
  assert.doesNotMatch(source, /^import /m);
});

test('Studio shell composes supplied regions and exposes its selected mode', async () => {
  const source = await readComponent('StudioShell');

  assert.match(source, /data-studio-mode=\{mode\}/);
  assert.match(source, /data-studio-skin="ironwrap"/);
  assert.match(source, /mode === 'platform'/);
  assert.match(source, /\{platformContent\}/);
  for (const region of ['topBar', 'stepRail', 'viewer', 'inspector', 'estimateDock', 'auxiliaryContent']) {
    assert.match(source, new RegExp(`\\{${region}\\}`));
  }
  assert.equal((source.match(/\{stepRail\}/g) || []).length, 1);
  assert.doesNotMatch(source, /<aside/);
  assert.match(source, /<div className="studio-shell-platform">\{platformContent\}<\/div>/);
  assert.doesNotMatch(source, /<main className="studio-shell-platform"/);
});

test('Studio shell keeps non-sensitive notices separate from step recovery feedback', async () => {
  const source = await readComponent('StudioShell');

  assert.match(source, /\bnotice\b/);
  assert.match(source, /\{notice && \(/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
});

test('Studio shell stylesheet defines the desktop grid and mobile inspector-sheet contract', async () => {
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');

  assert.match(css, /grid-template-columns:\s*168px minmax\(0, 1fr\) minmax\(320px, 380px\)/);
  for (const area of ['steps', 'viewer', 'inspector', 'estimate']) {
    assert.match(css, new RegExp(`grid-area:\\s*${area}`));
  }
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /\.studio-shell-steps\s*\{[^}]*grid-area:\s*progress/s);
  assert.match(css, /\.studio-shell-steps \.guided-step-rail ol\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.studio-shell-inspector\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /\.context-inspector\.is-mobile-open\s*\{[^}]*transform:\s*translateY\(0\)/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test('Studio shell renders a graphite frame around a warm work canvas', async () => {
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');

  assert.match(css, /\.studio-shell-top-bar \.studio-top-bar\s*\{[^}]*background:\s*var\(--studio-surface-frame\)[^}]*border-bottom:\s*var\(--studio-border-width\) solid var\(--studio-border-on-frame\)[^}]*color:\s*var\(--studio-text-on-frame\)/s);
  assert.match(css, /\.studio-shell-steps\s*\{[^}]*background:\s*var\(--studio-surface-frame\)[^}]*border-right:[^;]*var\(--studio-border-on-frame\)/s);
  assert.match(css, /\.studio-shell-viewer\s*\{[^}]*background:\s*var\(--studio-surface-canvas\)/s);
  assert.match(css, /\.studio-shell-inspector\s*\{[^}]*background:\s*var\(--studio-surface-panel\)/s);
  assert.match(css, /\.studio-shell-estimate\s*\{[^}]*background:\s*var\(--studio-surface-panel\)[^}]*border-top:\s*var\(--studio-border-width\) solid var\(--studio-border\)/s);
});

test('workflow progress and critical estimate emphasis use semantic red without color-only state', async () => {
  const rail = await readComponent('GuidedStepRail');
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');

  assert.match(css, /\.guided-step-rail \.is-active \.studio-button\s*\{[^}]*background:\s*var\(--studio-action\)/s);
  assert.match(css, /\.guided-step-rail \.is-completed \.studio-button\s*\{[^}]*border-color:\s*var\(--studio-action\)/s);
  assert.match(css, /\.estimate-dock-content strong\s*\{[^}]*color:\s*var\(--studio-critical\)/s);
  assert.match(rail, /aria-current=\{active \? 'step' : undefined\}/);
  assert.match(rail, /Current step/);
  assert.match(rail, /Complete/);
});

test('disabled project primary action returns to a readable neutral surface', async () => {
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');
  const disabledPrimary = css.match(/\.studio-top-bar-project-menu-popover > \.studio-project-menu-primary:disabled\s*\{([^}]*)\}/)?.[1];

  assert.ok(disabledPrimary, 'disabled project primary action should have an explicit cascade-safe rule');
  assert.match(disabledPrimary, /background:\s*var\(--studio-action-disabled-surface\)/);
  assert.match(disabledPrimary, /color:\s*var\(--studio-action-disabled-text\)/);
});

test('Studio shell provides semantic focus, touch-target, and reduced-motion safeguards', async () => {
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');

  assert.match(css, /\.studio-shell\s*:is\(button, \[href\], input, select, textarea, \[role='button'\]\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--studio-focus\)/s);
  assert.match(css, /\.studio-shell\s*:is\(button, \[href\], select, textarea, \[role='button'\]\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(css, /\.studio-shell input:not\(\.visually-hidden\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(css, /\.studio-shell \.layer-remove-btn\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.studio-shell \*\s*\{[^}]*transition-duration:\s*0\.01ms/s);
});

test('Studio shell keeps estimate navigation in the mobile layout without covering the viewer', async () => {
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');

  const mobileLayout = css.match(/@media\s*\(max-width:\s*900px\)\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(mobileLayout, 'mobile stylesheet contract should exist');
  assert.match(mobileLayout, /grid-template-areas:\s*\n\s*'progress'\s*\n\s*'estimate'\s*\n\s*'viewer'/);
  assert.match(mobileLayout, /\.studio-shell-estimate\s*\{[^}]*grid-area:\s*estimate/s);
  assert.doesNotMatch(mobileLayout, /\.studio-shell-estimate\s*\{[^}]*display:\s*none/s);
});

test('App integrates the three workspace shells with customer-first mode resolution and protected behavior', async () => {
  const source = await readApp();
  const controller = await readFile(new URL('../src/hooks/useWorkspaceController.js', import.meta.url), 'utf8');

  assert.match(source, /import useWorkspaceController from '\.\/hooks\/useWorkspaceController\.js';/);
  assert.match(controller, /resolveStudioMode/);
  assert.match(source, /import \{ STUDIO_STEPS \} from '\.\/lib\/studioSteps\.js';/);
  for (const shell of ['SalesModeShell', 'ExpertWorkspaceShell', 'ShowroomModeShell']) {
    assert.match(source, new RegExp(`import ${shell}`));
  }
  assert.doesNotMatch(source, /import StudioShell|<StudioShell/);

  assert.match(source, /const \[isCustomerView, setIsCustomerView\] = useState\(\(\) => Boolean\(initialPublicEntryRef\.current\.kind\)\)/);
  assert.equal((source.match(/parsePublicDesignEntry\(/g) || []).length, 1);
  assert.match(
    controller,
    /resolveStudioMode\(\{[\s\S]*?tenantEntitlement,[\s\S]*?showExpertMode,/s,
  );

  assert.match(source, /activeSection === 'platform' && canViewPlatform/);
  for (const handler of [
    'handleExportHtml',
    'handleExportPdf',
    'handleApproveDesign',
    'applyDesignSnapshot',
  ]) {
    assert.match(source, new RegExp(`\\b${handler}\\b`));
  }
});

test('App gives Accents and Services distinct control semantics', async () => {
  const source = await readApp();
  const [trims, extras, trimRow] = await Promise.all([
    readComponent('TrimsPanel'),
    readComponent('ExtrasServicesPanel'),
    readComponent('TrimAccentRow'),
  ]);

  assert.equal((source.match(/<TrimsPanel/g) || []).length, 1);
  assert.equal((source.match(/<ExtrasServicesPanel/g) || []).length, 1);
  assert.doesNotMatch(source, /<ServicesPanel|section="accents"|section="services"/);

  const accents = source.match(/const accentsContent = \(([\s\S]*?)\n  \);/)?.[1];
  assert.ok(accents, 'Accents step content should be explicit');
  assert.match(accents, /trimsContent/);
  assert.match(accents, /<PhotoOverlayControl/);

  assert.match(source, /const servicesContent = extrasServicesContent;/);

  assert.match(trims, /trimRecords\.map\(\(record\) => \(/);
  assert.match(trims, /<TrimAccentRow/);
  assert.match(trims, /Add Product/);
  assert.match(trims, /LibraryOptionPicker/);
  assert.match(trims, /gutterLabel/);
  assert.match(trims, /downspoutLabel/);
  assert.doesNotMatch(trims, /Eavestrough profile|Downspout type|<select/);
  assert.match(extras, /filter\(\(\[key\]\) => !isTrimServiceKey\(key\)\)/);
  assert.match(extras, /serviceLines\.length > 0/);
  assert.match(extras, /Add Service/);
  assert.match(extras, /<OptionalServiceRow/);
  assert.match(trimRow, />Product</);
  assert.doesNotMatch(trimRow, />Profile</);
  assert.match(trimRow, />Color</);
  assert.match(trimRow, />Quantity</);
  assert.match(trimRow, />Lock</);
});

test('Projects and attachments stay in one shared inspector node across Project, Review, and Expert', async () => {
  const source = await readApp();

  assert.equal((source.match(/<ProjectsPanel/g) || []).length, 1);
  assert.equal((source.match(/<AttachmentsPanel/g) || []).length, 1);
  assert.equal((source.match(/data-project-panels/g) || []).length, 1);
  assert.doesNotMatch(source, /auxiliaryContent=\{[\s\S]*?<AttachmentsPanel/);

  const inspector = source.match(/const sharedInspector = \(([\s\S]*?)\n  \);/)?.[1];
  assert.ok(inspector, 'shared inspector should own the stable panel host');
  assert.ok(
    inspector.indexOf('data-project-panels') < inspector.indexOf('{activeControlContent}'),
    'stateful project panels must be mounted outside the mode-specific content branch',
  );
  assert.match(source, /hidden=\{!configuratorActive \|\| \(workspaceState\.mode === 'sales' && !\['project', 'review'\]\.includes\(activeStudioStep\)\)\}/);
  assert.match(source, /closeProjectMenuAndRun\(handleOpenProjectTools\)/);
});

test('clickable Studio file labels keep semantic 44px targets while their inputs stay hidden', async () => {
  const layers = await readComponent('LayersPanel');
  const attachments = await readComponent('AttachmentsPanel');
  const css = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');
  const fileControlRule = css.match(/\.studio-shell label\.studio-file-control\s*\{([^}]*)\}/)?.[1];

  assert.match(layers, /className="btn-secondary import-file-btn studio-file-control"[^>]*>Import Layer \(XML\)<\/label>/);
  assert.match(layers, /<input id="import-layer-xml" type="file" accept="\.xml"[^>]*className="visually-hidden"/);
  assert.equal((attachments.match(/<label className="btn-secondary studio-file-control"/g) || []).length, 2);
  assert.match(attachments, /\+ Attach File[\s\S]*?<input type="file" className="visually-hidden"/);
  assert.match(attachments, /\+ Attach Photo[\s\S]*?<input type="file" accept="image\/\*" className="visually-hidden"/);
  assert.match(fileControlRule || '', /min-height:\s*var\(--studio-control-min\)/);
  assert.match(fileControlRule || '', /min-width:\s*var\(--studio-control-min\)/);
});

test('App bounds malformed XML recovery and surfaces safe load notices', async () => {
  const source = await readApp();

  assert.match(source, /import \{ parseStudioLayers \} from '\.\/lib\/studioRecovery\.js';/);
  assert.match(source, /const \{ parsedLayers, parseFailures \} = useMemo\(/);
  assert.match(source, /parseStudioLayers\(house\.layers, parseAppliCadXML\)/);
  assert.doesNotMatch(source, /house\.layers\.map\(\(l\) => \(\{[^}]*parseAppliCadXML\(l\.xml\)/s);
  assert.match(source, /const xmlRecoveryMessage = parseFailures\.length/);
  assert.match(source, /error=\{configuratorActive \? xmlRecoveryMessage : ''\}/);
  assert.match(source, /recoveryLabel="Review project imports"/);
  assert.match(source, /onRetry=\{configuratorActive && parseFailures\.length \? handleOpenProjectTools : undefined\}/);
  assert.match(source, /notice=\{shellNotice\}/);
  for (const notice of [
    'shared design',
    'public design',
    'saved project',
    'account settings',
  ]) assert.match(source, new RegExp(`showLoadNotice\\([^\\n]+${notice}`, 'i'));
  assert.doesNotMatch(source, /setShellNotice\([^)]*(?:err|error)\.(?:message|stack|body|response)/);
});

test('Viewer3D gives all five camera shortcuts unique short visible and accessible names', async () => {
  const source = await readComponent('Viewer3D');

  for (const [label, className, handler] of [
    ['Back', 'viewer3d-elevation-btn-top', "snapToElevation('back')"],
    ['Front', 'viewer3d-elevation-btn-bottom', "snapToElevation('front')"],
    ['Left', 'viewer3d-elevation-btn-left', "snapToElevation('left')"],
    ['Right', 'viewer3d-elevation-btn-right', "snapToElevation('right')"],
    ['Top', 'viewer3d-topview-btn', 'snapToTop'],
  ]) {
    const button = source.split('\n').find((line) => line.includes(className));
    assert.ok(button, `${label} camera shortcut should exist`);
    assert.match(button, new RegExp(`aria-label="${label}"`));
    assert.match(button, new RegExp(`>${label}<\\/button>`));
    assert.ok(button.includes(handler), `${label} should retain its camera handler`);
  }
  assert.doesNotMatch(source, />Elevation View<\/button>|>Top View<\/button>/);
});

test('App hides the legacy brand switch while retaining brand state, assets, and design capture', async () => {
  const source = await readApp();
  assert.doesNotMatch(source, /<BrandToggle|import BrandToggle/);
  assert.match(source, /navigation=\{applicationNavigation\}/);
  assert.match(source, /const \[brandId, setBrandId\] = useState\('ironwrap'\);/);
  assert.match(source, /const brand = BRANDS\[brandId\];/);
  assert.match(source, /captureDesignState\(\{[\s\S]*?\bbrandId,/);
  assert.match(source, /style=\{\{ '--brand-accent': brand\.accent, '--brand-accent-dark': brand\.accentDark \}\}/);
});

test('desktop Model Positioning and camera actions use opposite bounded corners', async () => {
  const adjustment = await readComponent('AssemblyAdjustment');
  const css = await readIndexCss();
  const shellCss = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');
  const desktopCss = shellCss.split('@media (min-width: 901px) {')[1]?.split('@media (max-width: 900px) {')[0];
  const dockRule = desktopCss?.match(/\.studio-shell \.assembly-dock\s*\{([^}]*)\}/)?.[1];
  const directionRule = desktopCss?.match(/\.studio-shell \.viewer-direction-controls\s*\{([^}]*)\}/)?.[1];

  assert.match(adjustment, />Model Positioning<\/span>/);
  assert.match(adjustment, /aria-label="Close model positioning"/);
  assert.match(adjustment, /id=\{bodyId\}/);
  assert.match(adjustment, /unitSystem/);
  assert.match(adjustment, /feetToDisplay/);
  assert.match(adjustment, /feetFromDisplay/);
  assert.doesNotMatch(adjustment, />ft<|toFixed\(1\)} ft/);
  assert.match(css, /\.viewer3d-canvas-wrap\s*\{[^}]*--viewer3d-left-control-lane:\s*[^;]+;/s);
  assert.ok(desktopCss, 'desktop positioning contract should use the Studio breakpoint');
  assert.match(dockRule || '', /left:\s*var\(--viewer3d-left-control-lane\)/);
  assert.match(dockRule || '', /width:\s*9\.6rem/);
  assert.match(dockRule || '', /max-height:\s*13\.6rem/);
  assert.match(desktopCss, /\.studio-shell \.assembly-dock :is\(button, input, select\)\s*\{[^}]*min-height:\s*0/s);
  assert.match(directionRule || '', /right:\s*0\.6rem/);
  assert.match(directionRule || '', /left:\s*auto/);
});

test('authenticated application navigation stays compact and outside the legacy tab shell', async () => {
  const source = await readApp();
  const topBar = await readFile(new URL('../src/components/workspaces/WorkspaceTopBar.jsx', import.meta.url), 'utf8');

  assert.match(source, /import WorkspaceTopBar/);
  assert.match(source, /<WorkspaceTopBar/);
  assert.match(source, /navigation=\{applicationNavigation\}/);
  assert.match(topBar, /<nav aria-label="Workspace navigation" className="workspace-topbar-navigation">/);
  assert.match(topBar, /\{navigation\}/);
  assert.doesNotMatch(source, /className="app-nav"|className=\{`app-nav-tab/);
  assert.doesNotMatch(source, /<StudioTopBar|import StudioTopBar/);
});

test('App exposes only an inactive capability-protected Interface Design placeholder', async () => {
  const source = await readApp();
  const placeholder = source.match(/\{canViewPlatform && \(\s*<span[^>]*data-interface-design-placeholder[\s\S]*?<\/span>\s*\)\}/)?.[0];

  assert.ok(placeholder, 'Interface Design placeholder should be guarded by canViewPlatform');
  assert.match(placeholder, /Import Interface Design/);
  assert.match(placeholder, /disabled/);
  assert.match(placeholder, /Skin package validation is not enabled in this release\./);
  assert.doesNotMatch(placeholder, /type=["']file["']/);
  assert.doesNotMatch(placeholder, /onChange|onSubmit|upload/i);
});
