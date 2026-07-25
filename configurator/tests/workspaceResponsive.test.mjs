import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

const readWorkspaceComponent = (name) => readFile(
  new URL(`../src/components/workspaces/${name}.jsx`, import.meta.url),
  'utf8',
);

const readWorkspaceStyles = () => readFile(
  new URL('../src/styles/workspace-modes.css', import.meta.url),
  'utf8',
);

let vite;
let SalesModeShell;
let ExpertWorkspaceShell;
let ShowroomModeShell;
let AdminWorkspaceShell;
let ViewerStage;

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: SalesModeShell } = await vite.ssrLoadModule('/src/components/workspaces/SalesModeShell.jsx'));
  ({ default: ExpertWorkspaceShell } = await vite.ssrLoadModule('/src/components/workspaces/ExpertWorkspaceShell.jsx'));
  ({ default: ShowroomModeShell } = await vite.ssrLoadModule('/src/components/workspaces/ShowroomModeShell.jsx'));
  ({ default: AdminWorkspaceShell } = await vite.ssrLoadModule('/src/components/workspaces/AdminWorkspaceShell.jsx'));
  ({ default: ViewerStage } = await vite.ssrLoadModule('/src/components/workspaces/ViewerStage.jsx'));
});

test.after(async () => {
  await vite?.close();
});

test('all three modes mount one compact responsive header and one viewer', () => {
  const sales = renderToStaticMarkup(createElement(SalesModeShell, {
    activeStep: 'roof',
    viewerStage: createElement('main', { 'data-test-viewer': 'sales' }, 'Sales viewer'),
  }));
  const expert = renderToStaticMarkup(createElement(ExpertWorkspaceShell, {
    expertEntitled: true,
    showExpertMode: true,
    activeTool: 'select',
    viewerStage: createElement('main', { 'data-test-viewer': 'expert' }, 'Expert viewer'),
  }));
  const showroom = renderToStaticMarkup(createElement(ShowroomModeShell, {
    sessionType: 'public',
    viewerStage: createElement('main', { 'data-test-viewer': 'showroom' }, 'Showroom viewer'),
  }));

  for (const [mode, html] of [['sales', sales], ['expert', expert], ['showroom', showroom]]) {
    assert.equal((html.match(/class="workspace-mobile-header"/g) || []).length, 1, `${mode} needs one responsive header`);
    assert.equal((html.match(new RegExp(`data-test-viewer="${mode}"`, 'g')) || []).length, 1, `${mode} needs one viewer`);
    assert.match(html, new RegExp(`data-workspace-mode="${mode}"`));
  }

  assert.match(sales, /Roof[\s\S]*Profiles &amp; Colors/);
  assert.match(expert, /Select Surface/);
  assert.match(showroom, /Explore your design/);
});

test('each compact layout exposes a focused control surface and reachable primary actions', async () => {
  const [sales, expert, showroom] = await Promise.all([
    readWorkspaceComponent('SalesModeShell'),
    readWorkspaceComponent('ExpertWorkspaceShell'),
    readWorkspaceComponent('ShowroomModeShell'),
  ]);

  assert.match(sales, /className="sales-workspace-inspector"[\s\S]*?data-control-surface/);
  assert.match(sales, /className="sales-workspace-estimate workspace-primary-actions"/);
  assert.match(expert, /className="expert-workspace-inspector workspace-control-surface"/);
  assert.match(expert, /className="expert-quick-estimate workspace-primary-actions"/);
  assert.match(showroom, /className="showroom-quote-region workspace-control-surface"/);
  assert.match(showroom, /className="showroom-estimate-card workspace-primary-actions"/);
});

test('Sales and Expert compact menus control their existing administrative drawers', async () => {
  const [sales, expert, mobileHeader] = await Promise.all([
    readWorkspaceComponent('SalesModeShell'),
    readWorkspaceComponent('ExpertWorkspaceShell'),
    readWorkspaceComponent('MobileWorkspaceHeader'),
  ]);

  assert.match(sales, /id="sales-navigation-drawer"[\s\S]*?popover="auto"/);
  assert.match(sales, /menuTarget="sales-navigation-drawer"/);
  assert.match(expert, /id="expert-navigation-drawer"[\s\S]*?popover="auto"/);
  assert.match(expert, /menuTarget="expert-navigation-drawer"/);
  assert.match(mobileHeader, /popovertarget=\{menuTarget\}/);
  assert.doesNotMatch(mobileHeader, /popoverTarget=/);
  assert.match(mobileHeader, /disabled=\{!onMenu && !menuTarget\}/);

  const css = await readWorkspaceStyles();
  assert.match(css, /\.expert-workspace-top\[popover\]:popover-open \.expert-workspace-topbar\s*\{[^}]*display:\s*block/s);
});

test('Administration reuses the compact drawer so navigation and account actions stay reachable', async () => {
  const html = renderToStaticMarkup(createElement(AdminWorkspaceShell, {
    title: 'Settings',
    topBar: createElement('header', { 'data-admin-topbar': true },
      createElement('button', null, 'Account')),
    onClose: () => {},
    onOpenNavigation: () => {},
    children: createElement('section', null, 'Settings controls'),
  }));
  const css = await readWorkspaceStyles();

  assert.match(html, /class="admin-workspace-top sales-workspace-top"[^>]*id="admin-navigation-drawer"[^>]*popover/);
  assert.match(html, /class="admin-workspace-mobile-header"[\s\S]*?aria-controls="admin-navigation-drawer"[\s\S]*?Open workspace menu/);
  assert.match(html, /data-admin-topbar="true"[\s\S]*?Account/);
  assert.match(css, /\.workspace-root \.admin-workspace-mobile-header\s*\{[^}]*display:\s*none[^}]*grid-area:\s*mobile/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root \.admin-workspace-mobile-header\s*\{[^}]*display:\s*block/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root \.sales-workspace-top\[popover\]:popover-open[\s\S]*?overflow:\s*auto[^}]*width:\s*min\(28rem, calc\(100vw - 1rem\)\)/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root \.admin-workspace-shell\s*\{[^}]*"mobile"[^}]*"content"[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
});

test('responsive CSS declares desktop, tablet, and mobile boundaries without horizontal overflow', async () => {
  const css = await readWorkspaceStyles();

  assert.match(css, /@media \(min-width:\s*1180px\)/);
  assert.match(css, /@media \(min-width:\s*768px\) and \(max-width:\s*1179px\)/);
  assert.match(css, /@media \(max-width:\s*767px\)/);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root\.sales-workspace\s*\{[^}]*grid-template-areas:[^}]*"viewer inspector"/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root\.expert-workspace\s*\{[^}]*grid-template-areas:[^}]*"viewer inspector"/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-root\.showroom-workspace\s*\{[^}]*grid-template-areas:[^}]*"viewer quote"/s);
});

test('mobile mode stacks a dominant viewer above one contained control surface', async () => {
  const css = await readWorkspaceStyles();
  const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)\n\}/)?.[1];

  assert.ok(mobile, 'mobile rules should exist');
  assert.match(mobile, /\.workspace-root\.sales-workspace\s*\{[^}]*grid-template-areas:\s*"mobile"\s*"viewer"\s*"inspector"/s);
  assert.match(mobile, /\.workspace-root\.expert-workspace\s*\{[^}]*grid-template-areas:\s*"mobile"\s*"tools"\s*"viewer"\s*"inspector"/s);
  assert.match(mobile, /\.workspace-root\.showroom-workspace\s*\{[^}]*grid-template-areas:\s*"header"\s*"categories"\s*"viewer"\s*"quote"/s);
  assert.match(mobile, /grid-template-rows:[^;]*minmax\([^;]*3fr\)[^;]*minmax\([^;]*2fr\)/s);
  assert.match(mobile, /\.workspace-control-surface,[\s\S]*?\[data-control-surface\]\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*hidden/s);
  assert.match(mobile, /\.workspace-root\.sales-workspace,[\s\S]*?\.workspace-root\.expert-workspace,[\s\S]*?\.workspace-root\.showroom-workspace\s*\{[^}]*height:\s*auto[^}]*min-height:\s*100dvh[^}]*overflow-y:\s*auto/s);
});

test('mobile positioning leaves a geometric camera-row clearance above its bottom-anchored sheet', async () => {
  const [stage, css] = await Promise.all([
    readWorkspaceComponent('ViewerStage'),
    readWorkspaceStyles(),
  ]);
  const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)\n\}/)?.[1];

  assert.match(stage, /const \[positioningOpen, setPositioningOpen\] = useState/);
  assert.match(stage, /data-positioning-open=\{positioningOpen \? 'true' : 'false'\}/);
  assert.match(stage, /onClose:\s*\(\) => setPositioningOpen\(false\)/);
  assert.match(stage, /onOpen:\s*\(\) => setPositioningOpen\(true\)/);
  assert.ok(mobile, 'mobile rules should exist');
  const sheetRule = mobile.match(/\.workspace-root \.assembly-dock\s*\{([^}]*)\}/)?.[1];
  const directionRule = mobile.match(/\.workspace-root \.viewer-direction-controls\s*\{([^}]*)\}/)?.[1];
  assert.match(sheetRule || '', /bottom:\s*0/);
  assert.match(sheetRule || '', /top:\s*auto/);
  assert.match(sheetRule || '', /position:\s*absolute/);
  assert.match(sheetRule || '', /max-height:\s*min\(/);
  assert.match(sheetRule || '', /calc\(100dvh - var\(--workspace-topbar-h\) - \.75rem\)/);
  assert.match(sheetRule || '', /calc\(100% - var\(--studio-control-min\) - 1\.25rem\)/);
  assert.match(sheetRule || '', /overflow-y:\s*auto/);
  assert.match(sheetRule || '', /z-index:\s*40/);
  assert.match(directionRule || '', /top:\s*0\.5rem/);
  assert.match(directionRule || '', /z-index:\s*41/);
  assert.match(mobile, /\.workspace-root \.workspace-viewer-stage\[data-positioning-open='false'\] \.assembly-dock\s*\{[^}]*display:\s*none/s);
});

test('positioning open state follows mobile breakpoint changes without trapping controls', () => {
  const originalWindow = globalThis.window;
  let breakpointListener;
  let removedListener;
  globalThis.window = {
    matchMedia: () => ({
      matches: false,
      addEventListener: (type, listener) => {
        assert.equal(type, 'change');
        breakpointListener = listener;
      },
      removeEventListener: (type, listener) => {
        assert.equal(type, 'change');
        removedListener = listener;
      },
    }),
  };

  let renderer;
  try {
    act(() => {
      renderer = TestRenderer.create(createElement(ViewerStage, {
        viewer: createElement('div', null, 'Viewer'),
        positioning: createElement('div', null, 'Positioning controls'),
        mode: 'sales',
      }));
    });
    assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Model positioning controls' }).length, 1);

    assert.equal(typeof breakpointListener, 'function');
    act(() => breakpointListener({ matches: true }));
    assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Open model positioning' }).length, 1);

    act(() => breakpointListener({ matches: false }));
    assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Model positioning controls' }).length, 1);
  } finally {
    act(() => renderer?.unmount());
    globalThis.window = originalWindow;
  }
  assert.equal(removedListener, breakpointListener);
});

test('authenticated phone Presentation uses a bounded vertical quote scroll region', async () => {
  const css = await readWorkspaceStyles();
  const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)\n\}/)?.[1] || '';
  const scrollRule = mobile.match(/\[data-showroom-session='authenticated-presentation'\] \.showroom-quote-region\s*\{([^}]*)\}/)?.[1] || '';

  assert.match(scrollRule, /min-height:\s*0/);
  assert.match(scrollRule, /overflow-x:\s*hidden/);
  assert.match(scrollRule, /overflow-y:\s*auto/);
  assert.match(scrollRule, /overscroll-behavior:\s*contain/);
  assert.doesNotMatch(scrollRule, /overflow:\s*hidden/);
});

test('closing Sales details restores the flexible viewer row without reserving a blank details row', async () => {
  const [shell, css] = await Promise.all([
    readWorkspaceComponent('SalesModeShell'),
    readWorkspaceStyles(),
  ]);
  const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)\n\}/)?.[1];

  assert.match(shell, /detailsOpen = true/);
  assert.match(shell, /sales-workspace\$\{detailsOpen \? '' : ' is-details-closed'\}/);
  assert.ok(mobile, 'mobile rules should exist');
  assert.match(mobile, /\.workspace-root\.app-workspace-layout\.sales-workspace\.is-details-closed\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
});

test('closing Expert surface details removes the inspector track and returns it to the viewer', async () => {
  const [shell, css] = await Promise.all([
    readWorkspaceComponent('ExpertWorkspaceShell'),
    readWorkspaceStyles(),
  ]);

  assert.match(shell, /detailsOpen = true/);
  assert.match(shell, /expert-workspace\$\{detailsOpen \? '' : ' is-details-closed'\}/);
  assert.match(shell, /\{detailsOpen && \([\s\S]*?<aside className="expert-workspace-inspector workspace-control-surface"/);
  assert.match(css, /\.workspace-root\.app-workspace-layout\.expert-workspace\.is-details-closed\s*\{[^}]*"tools viewer" minmax\(0, 1fr\)[^}]*\/ var\(--expert-tool-rail-w\) minmax\(0, 1fr\)/s);
  assert.match(css, /\.workspace-root\.app-workspace-layout\.expert-workspace\.is-details-closed \.expert-workspace-inspector\s*\{[^}]*display:\s*none/s);
});

test('compact controls retain 44px touch targets, scrolling tools, and sticky actions', async () => {
  const css = await readWorkspaceStyles();

  assert.match(css, /--studio-control-min:\s*44px|var\(--studio-control-min\)/);
  assert.match(css, /\.workspace-root :is\(button, \[href\], \[role='button'\]\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(css, /\.workspace-root input:not\(\.visually-hidden\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(css, /\.workspace-root :is\(select, textarea\),[\s\S]*?input:not\(\.visually-hidden\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)/s);
  assert.match(css, /\.workspace-root label\.studio-file-control\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(css, /\.workspace-root :is\(button, \[href\], input, select, textarea, \[role='button'\]\):focus-visible\s*\{/);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.expert-tool-list\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s);
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.showroom-material-grid\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s);
  assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*?\.showroom-customer-actions\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s);
  assert.doesNotMatch(css, /\.showroom-customer-actions button:not\(\.showroom-primary-action\)\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.workspace-primary-actions\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/s);
});

test('Expert exposes one correctly oriented toolbar at each responsive layout', async () => {
  const [shell, rail, css] = await Promise.all([
    readWorkspaceComponent('ExpertWorkspaceShell'),
    readWorkspaceComponent('ExpertToolRail'),
    readWorkspaceStyles(),
  ]);

  assert.match(rail, /orientation = 'vertical'/);
  assert.match(rail, /aria-orientation=\{orientation\}/);
  assert.match(shell, /className="expert-workspace-tools"[\s\S]*?orientation="vertical"/);
  assert.match(shell, /className="expert-workspace-compact-tools"[\s\S]*?orientation="horizontal"/);
  assert.match(css, /\.workspace-root \.expert-workspace-compact-tools\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.expert-workspace-tools\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*1179px\)[\s\S]*?\.expert-workspace-compact-tools\s*\{[^}]*display:\s*block/s);
});
