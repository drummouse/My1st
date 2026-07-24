import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement, useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';
import {
  enterExpert,
  enterPresentation,
  exitPresentation,
  resolveWorkspaceMode,
} from '../src/lib/workspaceMode.js';

let vite;
let AppWorkspace;
let openWorkspaceNavigation;
let useWorkspaceController;
let WorkspaceTopBar;

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ AppWorkspace, openWorkspaceNavigation } = await vite.ssrLoadModule('/src/App.jsx'));
  ({ default: useWorkspaceController } = await vite.ssrLoadModule('/src/hooks/useWorkspaceController.js'));
  ({ default: WorkspaceTopBar } = await vite.ssrLoadModule('/src/components/workspaces/WorkspaceTopBar.jsx'));
});

test.after(async () => {
  await vite?.close();
});

const readApp = () => readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const readWorkspaceController = () => readFile(new URL('../src/hooks/useWorkspaceController.js', import.meta.url), 'utf8');

const shellViewModels = (workspaceState) => {
  const viewerStage = createElement('div', { 'data-shared-viewer': true }, '3D model');
  return {
    viewerStage,
    salesViewModel: {
      topBar: createElement('header', null, 'Sales navigation'),
      activeStep: workspaceState.activeStudioStep || 'project',
      onStepChange: () => {},
      inspector: createElement('section', null, 'Sales controls'),
      estimate: { content: '$1,000' },
    },
    expertViewModel: {
      expertEntitled: workspaceState.expertEntitled === true,
      showExpertMode: workspaceState.showExpertMode === true,
      topBar: createElement('header', null, 'Expert navigation'),
      activeTool: workspaceState.activeExpertTool,
      surfaceInspector: createElement('section', null, 'Surface controls'),
      estimate: '$1,000',
    },
    showroomViewModel: {
      sessionType: workspaceState.presentationSource === 'authenticated'
        ? 'authenticated-presentation'
        : 'public',
      categories: [],
      materials: [],
      estimate: { displayTotal: '$1,000' },
      customerActions: {},
    },
  };
};

const renderWorkspace = (workspaceState) => renderToStaticMarkup(createElement(AppWorkspace, {
  workspaceState,
  ...shellViewModels(workspaceState),
}));

function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node?.children) return '';
  return node.children.map(textOf).join(' ');
}

function findButton(root, predicate) {
  return root.findAllByType('button').find((button) => predicate(button, textOf(button)));
}

function PersistentViewer({ lifecycle }) {
  useEffect(() => {
    lifecycle.mounts += 1;
    return () => { lifecycle.unmounts += 1; };
  }, [lifecycle]);
  return createElement('div', { 'data-persistent-viewer': true }, 'Persistent viewer');
}

function WorkspaceControllerHarness({ lifecycle }) {
  const controller = useWorkspaceController({
    authenticated: true,
    role: 'owner',
    tenantEntitlement: true,
    showExpertMode: true,
  });

  return createElement(AppWorkspace, {
    workspaceState: controller.workspaceState,
    viewerStage: createElement(PersistentViewer, { lifecycle }),
    salesViewModel: {
      topBar: createElement('button', { onClick: controller.requestExpert }, 'Expert mode'),
      activeStep: controller.activeStudioStep,
      onStepChange: controller.setActiveStudioStep,
      inspector: createElement('section', null, 'Sales controls'),
      estimate: { content: '$1,000' },
    },
    expertViewModel: {
      expertEntitled: controller.workspaceSecurityContext.expertEntitled,
      showExpertMode: controller.workspaceSecurityContext.showExpertMode,
      topBar: createElement('header', null, 'Expert navigation'),
      activeTool: controller.activeExpertTool,
      onToolChange: controller.setActiveExpertTool,
      surfaceInspector: createElement('section', null, 'Surface controls'),
      estimate: '$1,000',
      onOpenNavigation: () => { lifecycle.menuOpens += 1; },
      onReturnToSales: controller.returnToSales,
      onPresent: controller.enterPresentationMode,
    },
    showroomViewModel: {
      sessionType: 'authenticated-presentation',
      categories: [],
      materials: [],
      estimate: { displayTotal: '$1,000' },
      customerActions: {},
      onExitPresentation: controller.exitPresentationMode,
    },
  });
}

function TopBarMenuHarness() {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  return createElement(WorkspaceTopBar, {
    mode: 'sales',
    project: {
      label: 'Project menu',
      menuId: 'test-project-menu',
      menuOpen: projectMenuOpen,
      onMenuToggle: setProjectMenuOpen,
      onMenuClose: setProjectMenuOpen,
      menu: createElement(
        'div',
        null,
        createElement('button', { role: 'menuitem', type: 'button' }, 'Open'),
        createElement('button', { role: 'menuitem', type: 'button' }, 'Save'),
      ),
    },
  });
}

test('authenticated App composition defaults to exactly one Sales shell', () => {
  const workspaceState = {
    mode: resolveWorkspaceMode({ authenticated: true }),
    authenticated: true,
    activeStudioStep: 'project',
  };
  const html = renderWorkspace(workspaceState);

  assert.equal((html.match(/class="workspace-root /g) || []).length, 1);
  assert.match(html, /data-workspace-mode="sales"/);
  assert.match(html, /data-studio-skin="ironwrap"/);
  assert.doesNotMatch(html, /data-workspace-mode="expert"|data-workspace-mode="showroom"/);
});

test('the live scoped skin contains actual legacy controls inside the workspace root', () => {
  const workspaceState = { mode: 'sales', authenticated: true, activeStudioStep: 'project' };
  const viewModels = shellViewModels(workspaceState);
  viewModels.salesViewModel.inspector = createElement('section', null,
    createElement('button', { className: 'btn-primary' }, 'Legacy primary'),
    createElement('select', { className: 'control-select', defaultValue: 'one' },
      createElement('option', { value: 'one' }, 'One')),
  );
  const html = renderToStaticMarkup(createElement(AppWorkspace, { workspaceState, ...viewModels }));

  assert.match(html, /^<div[^>]*data-studio-skin="ironwrap"/);
  assert.match(html, /class="btn-primary"/);
  assert.match(html, /class="control-select"/);
});

test('gated Expert transition selects one Expert shell without applying a design snapshot', () => {
  let snapshotCalls = 0;
  const sales = {
    mode: 'sales',
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
    activeStudioStep: 'siding',
    activeExpertTool: 'move',
    applyDesignSnapshot: () => { snapshotCalls += 1; },
  };

  assert.throws(() => enterExpert({ ...sales, showExpertMode: false }), /unavailable/i);
  const expert = enterExpert(sales);
  const html = renderWorkspace(expert);

  assert.equal((html.match(/class="workspace-root /g) || []).length, 1);
  assert.match(html, /data-workspace-mode="expert"/);
  assert.match(html, /data-active-tool="move"/);
  assert.equal(expert.activeStudioStep, 'siding');
  assert.equal(snapshotCalls, 0);
});

test('Present and Exit restore the prior mode, Sales step, and Expert tool without snapshots', () => {
  let snapshotCalls = 0;
  const expert = enterExpert({
    mode: 'sales',
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
    activeStudioStep: 'services',
    activeExpertTool: 'measure',
    captureDesignSnapshot: () => { snapshotCalls += 1; },
    applyDesignSnapshot: () => { snapshotCalls += 1; },
  });
  const presentation = enterPresentation(expert);
  const presentationHtml = renderWorkspace(presentation);
  const restored = exitPresentation(presentation, {
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
  });
  const restoredHtml = renderWorkspace(restored);

  assert.equal((presentationHtml.match(/class="workspace-root /g) || []).length, 1);
  assert.match(presentationHtml, /data-workspace-mode="showroom"/);
  assert.match(presentationHtml, /Exit Presentation/);
  assert.equal(restored.mode, 'expert');
  assert.equal(restored.activeStudioStep, 'services');
  assert.equal(restored.activeExpertTool, 'measure');
  assert.match(restoredHtml, /data-workspace-mode="expert"/);
  assert.match(restoredHtml, /data-active-tool="measure"/);
  assert.equal(snapshotCalls, 0);
});

test('public App composition renders only the customer-safe Showroom shell', () => {
  const workspaceState = {
    mode: resolveWorkspaceMode({ authenticated: false, publicShowroom: true }),
    authenticated: false,
    publicShowroom: true,
  };
  const html = renderWorkspace(workspaceState);

  assert.equal((html.match(/class="workspace-root /g) || []).length, 1);
  assert.match(html, /data-workspace-mode="showroom"/);
  for (const forbidden of ['data-workspace-mode="sales"', 'data-workspace-mode="expert"', 'Exit Presentation', 'Sales navigation', 'Expert navigation']) {
    assert.doesNotMatch(html, new RegExp(forbidden));
  }
});

test('Showroom safe-state modifier is applied to the outer workspace root targeted by layout CSS', () => {
  const workspaceState = { mode: 'showroom', authenticated: false, publicShowroom: true };
  const viewModels = shellViewModels(workspaceState);
  viewModels.showroomViewModel.status = 'error';
  const html = renderToStaticMarkup(createElement(AppWorkspace, { workspaceState, ...viewModels }));

  assert.match(html, /^<div class="[^"]*workspace-root[^"]*showroom-safe-state-workspace/);
});

test('Materials administration updates React-owned color catalog state', async () => {
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<MaterialsPanel[\s\S]*?onColorsChanged=\{applyColorsCatalog\}/);
});

test('administrative sections mount a full-screen shell outside the persistent viewer workspace', async () => {
  const app = await readApp();

  assert.match(app, /const ADMINISTRATIVE_SECTIONS = new Set\(\['settings', 'discounts', 'customServices', 'materials', 'capture', 'platform'\]\);/);
  assert.match(app, /export const isAdministrativeSection = \(section\) => ADMINISTRATIVE_SECTIONS\.has\(section\);/);
  assert.match(app, /const administrativeWorkspace = !isCustomerView && isAdministrativeSection\(activeSection\);/);
  assert.match(app, /administrativeWorkspace \? \([\s\S]*?<AdminWorkspaceShell[\s\S]*?\{administrativeContent\}[\s\S]*?<\/AdminWorkspaceShell>[\s\S]*?\) : \([\s\S]*?<AppWorkspace/s);
});

test('closing administration restores Configurator and Sales unless presentation is authenticated', async () => {
  const app = await readApp();
  const closeHandler = app.match(/const handleCloseAdministration = \(\) => \{([\s\S]*?)\n  \};/)?.[1];

  assert.ok(closeHandler, 'App should own the administrative workspace close transition');
  assert.match(closeHandler, /setActiveSection\('configurator'\)/);
  assert.match(closeHandler, /workspaceState\.presentationSource !== 'authenticated'/);
  assert.match(closeHandler, /returnToSales\(\)/);
});

test('App connects the administration compact header to its dedicated navigation drawer', async () => {
  const app = await readApp();

  assert.match(app, /const handleOpenAdminNavigation = \(event\) => \{[\s\S]*?openWorkspaceNavigation\('admin', event\)/);
  assert.match(app, /<AdminWorkspaceShell[\s\S]*?topBar=\{applicationTopBar\}[\s\S]*?onOpenNavigation=\{handleOpenAdminNavigation\}/);
  assert.doesNotMatch(app, /className="admin-workspace-application-header"/);
});

test('mounted controller transitions preserve viewer lifecycle and restore step and tool state', () => {
  const lifecycle = { menuOpens: 0, mounts: 0, unmounts: 0 };
  let renderer;

  act(() => {
    renderer = TestRenderer.create(createElement(WorkspaceControllerHarness, { lifecycle }));
  });
  assert.equal(lifecycle.mounts, 1);
  assert.equal(lifecycle.unmounts, 0);

  const services = findButton(renderer.root, (button) => button.props['aria-label']?.startsWith('Step 5: Services.'));
  assert.ok(services, 'Sales shell should expose the Services step button');
  act(() => services.props.onClick());

  const expertToggle = findButton(renderer.root, (_button, label) => label.trim() === 'Expert mode');
  assert.ok(expertToggle, 'Sales shell should expose the gated Expert transition');
  act(() => expertToggle.props.onClick());
  assert.equal(renderer.root.findByProps({ 'data-workspace-mode': 'expert' }).props['data-active-tool'], 'select');

  const expertMenu = findButton(renderer.root, (button) => button.props['aria-label'] === 'Open workspace menu');
  act(() => expertMenu.props.onClick());
  assert.equal(lifecycle.menuOpens, 1);
  assert.equal(renderer.root.findByProps({ 'data-workspace-mode': 'expert' }).props['data-active-tool'], 'select');

  const measurementTool = findButton(renderer.root, (button) => button.props['data-tool-key'] === 'measure');
  assert.ok(measurementTool, 'Expert shell should visibly expose unavailable Measurements');
  assert.equal(measurementTool.props['aria-disabled'], true);
  act(() => measurementTool.props.onClick());
  assert.equal(renderer.root.findByProps({ 'data-workspace-mode': 'expert' }).props['data-active-tool'], 'select');

  const present = findButton(renderer.root, (button) => button.props.className === 'expert-present-action');
  assert.ok(present, 'Expert shell should expose Present to Customer');
  act(() => present.props.onClick());
  assert.ok(renderer.root.findByProps({ 'data-workspace-mode': 'showroom' }));

  const exit = findButton(renderer.root, (button) => button.props.className === 'showroom-exit-presentation');
  assert.ok(exit, 'authenticated Showroom should expose Exit Presentation');
  act(() => exit.props.onClick());
  assert.equal(renderer.root.findByProps({ 'data-workspace-mode': 'expert' }).props['data-active-tool'], 'select');

  const returnToSales = findButton(renderer.root, (_button, label) => label.trim() === 'Return to Sales');
  act(() => returnToSales.props.onClick());
  const activeSalesStep = renderer.root.findAllByType('button').find((button) => button.props['aria-current'] === 'step');
  assert.match(activeSalesStep.props['aria-label'], /^Step 5: Services\./);
  assert.equal(lifecycle.mounts, 1, 'Viewer mounts exactly once across Sales, Expert, and Showroom');
  assert.equal(lifecycle.unmounts, 0, 'Mode transitions do not unmount the viewer');

  act(() => renderer.unmount());
  assert.equal(lifecycle.unmounts, 1);
});

test('mounted active top bar restores keyboard navigation, outside dismissal, and trigger focus', () => {
  const listeners = {};
  const focusLog = [];
  const itemMocks = ['Open', 'Save'].map((label) => {
    const item = {
      focus: () => {
        globalThis.document.activeElement = item;
        focusLog.push(label);
      },
    };
    return item;
  });
  const triggerMock = {
    focus: () => { focusLog.push('trigger'); },
  };
  const menuMock = {
    querySelectorAll: () => itemMocks,
  };
  const menuRootMock = {
    contains: (target) => target === triggerMock || target === menuMock || itemMocks.includes(target),
    querySelectorAll: () => itemMocks,
  };
  const previousDocument = globalThis.document;
  globalThis.document = {
    activeElement: null,
    addEventListener: (type, listener) => { listeners[type] = listener; },
    removeEventListener: (type, listener) => {
      if (listeners[type] === listener) delete listeners[type];
    },
  };
  let renderer;
  const getTrigger = () => renderer.root.findAllByType('button')
    .find((button) => button.props['aria-label'] === 'Project actions');

  try {
    act(() => {
      renderer = TestRenderer.create(createElement(TopBarMenuHarness), {
        createNodeMock: (element) => {
          if (element.props['aria-label'] === 'Project actions' && element.type === 'button') return triggerMock;
          if (element.props.className === 'workspace-topbar-menu') return menuRootMock;
          if (element.props.role === 'menu') return menuMock;
          return {};
        },
      });
    });

    let trigger = getTrigger();
    act(() => trigger.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} }));
    trigger = getTrigger();
    assert.equal(trigger.props['aria-expanded'], true);
    assert.equal(focusLog.at(-1), 'Open');

    let menu = renderer.root.findByProps({ role: 'menu' });
    act(() => menu.props.onKeyDown({
      currentTarget: menuMock,
      key: 'ArrowDown',
      preventDefault: () => {},
    }));
    assert.equal(focusLog.at(-1), 'Save');

    act(() => listeners.pointerdown({ target: {} }));
    assert.equal(getTrigger().props['aria-expanded'], false);

    trigger = getTrigger();
    act(() => trigger.props.onClick());
    act(() => listeners.keydown({ key: 'Escape', preventDefault: () => {} }));
    assert.equal(getTrigger().props['aria-expanded'], false);
    assert.equal(focusLog.at(-1), 'trigger');

    trigger = getTrigger();
    act(() => trigger.props.onClick());
    menu = renderer.root.findByProps({ role: 'menu' });
    act(() => menu.props.onClick({ target: { closest: () => ({}) } }));
    assert.equal(getTrigger().props['aria-expanded'], false);
    assert.equal(focusLog.at(-1), 'trigger');
  } finally {
    if (renderer) act(() => renderer.unmount());
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('App builds the shared viewer once and gives Trims and Services exclusive inputs', async () => {
  const source = await readApp();

  assert.equal((source.match(/<Viewer3D/g) || []).length, 1, 'all three modes share one viewer node');
  assert.equal((source.match(/<ViewerStage/g) || []).length, 1, 'all three modes share one viewer stage');
  assert.equal((source.match(/<SalesStepContent/g) || []).length, 1, 'Sales step content is selected once');
  assert.match(source, /const extraServices = projectExtrasOnly\(services\);/);
  assert.match(source, /<TrimsPanel[\s\S]*?records=\{trimAccents\}/);
  assert.match(source, /<ExtrasServicesPanel[\s\S]*?services=\{extraServices\}/);
  assert.doesNotMatch(source, /<ServicesPanel|section="accents"|section="services"/);
});

test('AppWorkspace keeps the shared viewer under one stable keyed parent across shell changes', async () => {
  const source = await readApp();

  assert.match(source, /export function AppWorkspace\(\{[\s\S]*?viewerStage,[\s\S]*?\}\)/);
  assert.match(source, /className=\{`workspace-root app-workspace-layout \$\{workspaceState\.mode\}-workspace\$\{safeStateClass\}\$\{detailsStateClass\}`\}/);
  assert.match(source, /key="persistent-viewer"[\s\S]*?\{viewerStage\}/);
  for (const shell of ['SalesModeShell', 'ExpertWorkspaceShell', 'ShowroomModeShell']) {
    assert.match(source, new RegExp(`<${shell}[^>]*key="workspace-shell"[^>]*embedded[^>]*viewerStage=\\{null\\}`));
  }
});

test('the mounted workspace controller has no design snapshot dependency', async () => {
  const source = await readWorkspaceController();

  assert.doesNotMatch(source, /captureDesignSnapshot|applyDesignSnapshot|applyDesignState/);
  assert.match(source, /setActiveStudioStep\(restoredWorkspace\.activeStudioStep\)/);
  assert.match(source, /setActiveExpertTool\(restoredWorkspace\.activeExpertTool\)/);
});

test('App owns transition state and selects shells through a closed three-mode boundary', async () => {
  const source = await readApp();
  const controller = await readWorkspaceController();

  assert.match(source, /useWorkspaceController\(\{/);
  assert.match(controller, /const \[activeStudioStep, setActiveStudioStep\] = useState\('project'\);/);
  assert.match(controller, /const \[activeExpertTool, setActiveExpertTool\] = useState\('select'\);/);
  assert.match(controller, /const workspaceState = presentationWorkspace \|\| resolvedWorkspaceState;/);
  assert.match(source, /if \(workspaceState\.mode === 'showroom'\) \{/);
  assert.match(source, /else if \(workspaceState\.mode === 'expert'\) \{/);
  assert.match(source, /shell = <SalesModeShell/);
  assert.doesNotMatch(source, /import StudioShell|<StudioShell|<ViewerWorkspace|<EstimateDock|className="app-header"|className="app-nav"/);

  const presentHandler = source.match(/const handlePresentToCustomer = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  const exitHandler = source.match(/const handleExitPresentation = \(\) => \{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(presentHandler && exitHandler, 'App should own both presentation transitions');
  assert.doesNotMatch(presentHandler, /applyDesignSnapshot|captureDesignSnapshot/);
  assert.doesNotMatch(exitHandler, /applyDesignSnapshot|captureDesignSnapshot/);
  assert.match(presentHandler, /enterPresentationMode\(\)/);
  assert.match(exitHandler, /exitPresentationMode\(\)/);
});

test('Expert mobile navigation opens its current drawer without changing mode', async () => {
  const source = await readApp();
  const handler = source.match(/const handleOpenWorkspaceNavigation = \(event\) => \{([\s\S]*?)\n  \};/)?.[1];
  let prevented = false;
  let opened = false;
  let requestedId = '';

  openWorkspaceNavigation('expert', { preventDefault: () => { prevented = true; } }, {
    getElementById: (id) => {
      requestedId = id;
      return { showPopover: () => { opened = true; } };
    },
  });

  assert.ok(handler, 'App should own the mobile workspace drawer interaction');
  assert.match(handler, /openWorkspaceNavigation\(workspaceState\.mode, event\)/);
  assert.doesNotMatch(handler, /setExpertRequested|handleApplicationSectionChange/);
  assert.match(source, /onOpenNavigation: handleOpenWorkspaceNavigation/);
  assert.equal(requestedId, 'expert-navigation-drawer');
  assert.equal(prevented, true);
  assert.equal(opened, true);
});

test('Present is limited to the configurator so Exit restores the same workspace context', async () => {
  const source = await readApp();

  assert.match(source, /onPresent=\{workspaceState\.mode === 'sales' && configuratorActive \? handlePresentToCustomer : undefined\}/);
});

test('App passes inspector disclosure state to the Sales shell so closing details releases its grid row', async () => {
  const source = await readApp();

  assert.match(source, /const salesViewModel = \{[\s\S]*?detailsOpen: mobileInspectorOpen,/);
  assert.match(source, /const expertViewModel = \{[\s\S]*?detailsOpen: Boolean\(selectedFacet\),/);
});
