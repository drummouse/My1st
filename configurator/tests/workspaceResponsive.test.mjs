import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: SalesModeShell } = await vite.ssrLoadModule('/src/components/workspaces/SalesModeShell.jsx'));
  ({ default: ExpertWorkspaceShell } = await vite.ssrLoadModule('/src/components/workspaces/ExpertWorkspaceShell.jsx'));
  ({ default: ShowroomModeShell } = await vite.ssrLoadModule('/src/components/workspaces/ShowroomModeShell.jsx'));
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

  assert.match(sales, /Roof[\s\S]*Materials &amp; Colors/);
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
