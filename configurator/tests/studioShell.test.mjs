import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readComponent = (name) => readFile(
  new URL(`../src/components/${name}.jsx`, import.meta.url),
  'utf8',
);

const readApp = () => readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const readIndexCss = () => readFile(new URL('../src/index.css', import.meta.url), 'utf8');
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

test('Studio top bar exposes the active project and a direct path to stable project tools', async () => {
  const topBar = await readComponent('StudioTopBar');
  const app = await readApp();

  assert.match(topBar, /projectLabel/);
  assert.match(topBar, /projectStatus/);
  assert.match(topBar, /aria-label=\{`Project: \$\{projectLabel\}\. \$\{projectStatus\}\. Open project tools`\}/);
  assert.match(topBar, /onClick=\{onOpenProject\}/);
  assert.match(topBar, /\{projectLabel\}/);
  assert.match(topBar, /\{projectStatus\}/);

  assert.match(app, /const handleOpenProjectTools = \(\) => \{[\s\S]*?setActiveSection\('configurator'\);[\s\S]*?setExpertRequested\(false\);[\s\S]*?setActiveStudioStep\('project'\);[\s\S]*?setMobileInspectorOpen\(true\);[\s\S]*?\};/);
  assert.match(app, /projectLabel=\{house\.jobNumber \|\| 'Untitled project'\}/);
  assert.match(app, /projectStatus=\{projectSaveStatus\}/);
  assert.doesNotMatch(app, /projectStatus=\{currentProjectId \? 'Saved' : 'Not saved'\}/);
  assert.match(app, /onOpenProject=\{handleOpenProjectTools\}/);
});

test('App derives dirty state from database persistence and gates owner writes until pricing settles', async () => {
  const app = await readApp();
  const projectsPanel = await readComponent('ProjectsPanel');

  assert.match(app, /import \{ captureDesignState, applyDesignState, createStableDesignNormalizer, decodeDesignFromUrl \} from '\.\/lib\/designState\.js';/);
  assert.match(app, /import \{ createInitialEditRestore, designFingerprint, getDesignPersistenceState, getProjectSaveStatus \} from '\.\/lib\/studioDesignState\.js';/);
  assert.match(app, /const \[persistedDesignFingerprint, setPersistedDesignFingerprint\] = useState\(null\);/);
  assert.match(app, /const \[companySettingsSettled, setCompanySettingsSettled\] = useState\(false\);/);
  assert.match(app, /const \[defaultCatalogsSettled, setDefaultCatalogsSettled\] = useState\(false\);/);
  assert.match(app, /const stableDesignNormalizerRef = useRef\(null\);/);
  assert.match(app, /buildAccountDefaultDesignSnapshot\(\{[\s\S]*?companySettings,[\s\S]*?customServiceCatalog,[\s\S]*?effectivePricingSettings,[\s\S]*?\}\)/);
  assert.match(app, /if \(stableDesignNormalizerRef\.current \|\| isCustomerView \|\| !companySettingsSettled \|\| !defaultCatalogsSettled\) return;/);
  assert.match(app, /stableDesignNormalizerRef\.current = createStableDesignNormalizer\(accountDefaults\);[\s\S]*?setDesignDefaultsReady\(true\);/);
  assert.match(app, /const initialEditRestoreRef = useRef\(null\);/);
  assert.match(app, /initialEditRestoreRef\.current = createInitialEditRestore\(window\.location\.search\);/);
  assert.match(app, /const currentDesignFingerprint = useMemo\([\s\S]*?designFingerprint\(currentDesignSnapshot\)/);
  assert.match(app, /const persistence = getDesignPersistenceState\(\{[\s\S]*?isCustomerView,[\s\S]*?companySettingsSettled,[\s\S]*?effectivePricingSettings,[\s\S]*?\}\);/);
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
  assert.match(app, /if \(!persistence\.ready\) return;/);
  assert.match(app, /onClick=\{handleExportHtml\} disabled=\{!persistence\.ready\}/);
  assert.match(app, /persistenceReady=\{projectPersistenceReady\}/);
  assert.match(app, /persistenceMessage=\{projectPersistenceMessage\}/);
  assert.match(app, /onDesignPersisted=\{markDesignPersisted\}/);
  assert.match(projectsPanel, /persistenceReady/);
  assert.match(projectsPanel, /persistenceMessage/);
  assert.match(projectsPanel, /if \(!persistenceReady\) return;/);
  assert.match(projectsPanel, /disabled=\{busy \|\| !persistenceReady\}/);
  assert.match(projectsPanel, /onDesignPersisted\?\.\(design\)/);
  assert.match(projectsPanel, /const restoredDesign = onOpenProject\(row\.design\);/);
  assert.match(projectsPanel, /onDesignPersisted\?\.\(restoredDesign\)/);
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

test('App integrates the Studio shell with customer-first mode resolution and protected behavior', async () => {
  const source = await readApp();

  assert.match(source, /import \{[^}]*\bresolveStudioMode\b[^}]*\} from '\.\/lib\/studioMode\.js';/);
  assert.match(source, /import \{ STUDIO_STEPS,[^}]+\} from '\.\/lib\/studioSteps\.js';/);
  assert.match(source, /import StudioShell from '\.\/components\/StudioShell\.jsx';/);

  assert.match(source, /useState\(getInitialCustomerContext\)/);

  assert.match(source, /platformContent=\{canViewPlatform && <PlatformConsole/);
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
  const panel = await readComponent('ServicesPanel');

  assert.equal((source.match(/<ServicesPanel/g) || []).length, 3, 'Accents, Services, and Expert each compose one scoped panel');
  assert.equal((source.match(/section="accents"/g) || []).length, 1);
  assert.equal((source.match(/section="services"/g) || []).length, 1);

  const accents = source.match(/const accentsContent = \(([\s\S]*?)\n  \);/)?.[1];
  assert.ok(accents, 'Accents step content should be explicit');
  assert.match(accents, /section="accents"/);
  assert.match(accents, /<PhotoOverlayControl/);

  const services = source.match(/const servicesContent = \(([\s\S]*?)\n  \);/)?.[1];
  assert.ok(services, 'Services step content should be explicit');
  assert.match(services, /section="services"/);
  assert.doesNotMatch(services, /PhotoOverlayControl/);

  assert.match(panel, /const showServiceControls = section !== 'accents';/);
  assert.match(panel, /const showAccentControls = section !== 'services';/);
  assert.match(panel, /showToggle=\{showServiceControls\}/);
  assert.match(panel, /qty=\{showServiceControls \? measurements\.soffitSqft : undefined\}/);
  assert.match(panel, /colorId=\{showAccentControls \? accessoryColors\.soffit : undefined\}/);
  assert.match(panel, /extra=\{showAccentControls \? \(/);
  assert.match(panel, /\{showServiceControls && customServiceLines\.length > 0 && \(/);
  assert.match(panel, /\{showServiceControls && !isCustomerView && !readOnlyQuantities && \(/);
});

test('Projects and attachments stay in one stable inspector location across Project, Review, and Expert', async () => {
  const source = await readApp();

  assert.equal((source.match(/<ProjectsPanel/g) || []).length, 1);
  assert.equal((source.match(/<AttachmentsPanel/g) || []).length, 1);
  assert.equal((source.match(/data-project-panels/g) || []).length, 1);
  assert.doesNotMatch(source, /auxiliaryContent=\{[\s\S]*?<AttachmentsPanel/);

  const inspector = source.match(/inspector=\{configuratorActive \? \(([\s\S]*?)\n        \) : null\}/)?.[1];
  assert.ok(inspector, 'configurator inspector should own the stable panel host');
  assert.ok(
    inspector.indexOf('data-project-panels') < inspector.indexOf("{studioMode === 'sales' ? ("),
    'stateful project panels must be mounted outside the mode-specific content branch',
  );
  assert.match(source, /hidden=\{studioMode === 'sales' && !\['project', 'review'\]\.includes\(activeStudioStep\)\}/);
  assert.match(source, /onOpenProject=\{handleOpenProjectTools\}/);
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
  assert.match(source, /error=\{xmlRecoveryMessage\}/);
  assert.match(source, /recoveryLabel="Review project imports"/);
  assert.match(source, /onRetry=\{parseFailures\.length \? handleOpenProjectTools : undefined\}/);
  assert.match(source, /notice=\{shellNotice\}/);
  for (const notice of [
    'shared design',
    'shared project',
    'saved project',
    'account settings',
  ]) assert.match(source, new RegExp(`showLoadNotice\\([^\\n]+${notice}`, 'i'));
  assert.doesNotMatch(source, /setShellNotice\([^)]*(?:err|error)\.(?:message|stack|body|response)/);
});

test('Viewer3D gives every elevation shortcut a distinct directional accessible name', async () => {
  const source = await readComponent('Viewer3D');

  for (const [direction, position] of [
    ['Back', 'top'],
    ['Front', 'bottom'],
    ['Left', 'left'],
    ['Right', 'right'],
  ]) {
    const button = source.match(new RegExp(`<button[^\\n]+viewer3d-elevation-btn-${position}[^\\n]+</button>`))?.[0];
    assert.ok(button, `${position} elevation shortcut should exist`);
    assert.match(button, new RegExp(`aria-label="${direction} elevation view"`));
    assert.match(button, new RegExp(`snapToElevation\\('${direction.toLowerCase()}'\\)`));
    assert.match(button, />Elevation View<\/button>/);
  }
  assert.equal((source.match(/>Elevation View<\/button>/g) || []).length, 4);
});

test('authenticated mobile navigation scrolls without shrinking touch targets', async () => {
  const css = await readIndexCss();
  const navRule = css.match(/\.app-nav\s*\{([^}]*)\}/)?.[1];
  const tabRule = css.match(/\.app-nav-tab\s*\{([^}]*)\}/)?.[1];
  const brandRule = css.match(/\.brand-toggle-btn\s*\{([^}]*)\}/)?.[1];

  assert.match(navRule || '', /overflow-x:\s*auto/);
  assert.match(navRule || '', /flex-wrap:\s*nowrap/);
  assert.match(tabRule || '', /min-height:\s*44px/);
  assert.match(tabRule || '', /flex:\s*0 0 auto/);
  assert.match(brandRule || '', /min-height:\s*44px/);
  assert.match(brandRule || '', /min-width:\s*44px/);
  assert.match(css, /\.app-nav > \.brand-toggle\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(css, /\[data-interface-design-placeholder\]\s*\{[^}]*flex:\s*0 0 auto/s);
});

test('App exposes only an inactive capability-protected Interface Design placeholder', async () => {
  const source = await readApp();
  const placeholder = source.match(/\{canViewPlatform && \(\s*<div[^>]*data-interface-design-placeholder[\s\S]*?<\/div>\s*\)\}/)?.[0];

  assert.ok(placeholder, 'Interface Design placeholder should be guarded by canViewPlatform');
  assert.match(placeholder, /Import Interface Design/);
  assert.match(placeholder, /disabled/);
  assert.match(placeholder, /Skin package validation is not enabled in this release\./);
  assert.doesNotMatch(placeholder, /type=["']file["']/);
  assert.doesNotMatch(placeholder, /onChange|onSubmit|upload/i);
});
