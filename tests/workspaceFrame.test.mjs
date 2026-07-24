import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readWorkspaceComponent = (name) => readFile(
  new URL(`../src/components/workspaces/${name}.jsx`, import.meta.url),
  'utf8',
);

const readWorkspaceStyles = () => readFile(
  new URL('../src/styles/workspace-modes.css', import.meta.url),
  'utf8',
);

test('workspace top bar is one compact semantic banner with named menus', async () => {
  const source = await readWorkspaceComponent('WorkspaceTopBar');

  assert.equal((source.match(/<header\b/g) || []).length, 1);
  assert.match(source, /className="workspace-topbar"/);
  assert.match(source, /<nav[^>]*aria-label="Workspace navigation"/);
  assert.match(source, /aria-label=\{label\}/);
  assert.match(source, /label="Project actions"/);
  assert.match(source, /label="User menu"/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /actions\.busy/);
  assert.match(source, /focusProjectMenuBoundary/);
  assert.match(source, /moveProjectMenuFocus/);
  assert.match(source, /event\.key !== 'Escape'/);
  assert.match(source, /event\.key !== 'ArrowDown'/);
  assert.match(source, /event\.key !== 'ArrowUp'/);
  assert.match(source, /document\.addEventListener\('pointerdown', handlePointerDown\)/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
});

test('administration shell is a full-screen main workspace with an explicit close action', async () => {
  const source = await readWorkspaceComponent('AdminWorkspaceShell');

  assert.match(source, /import MobileWorkspaceHeader from '\.\/MobileWorkspaceHeader\.jsx';/);
  assert.match(source, /topBar,[\s\S]*?onOpenNavigation,/);
  assert.match(source, /className="admin-workspace-shell"/);
  assert.match(source, /className="admin-workspace-top sales-workspace-top"[^>]*id="admin-navigation-drawer"[^>]*popover="auto"/);
  assert.match(source, /className="admin-workspace-mobile-header"[\s\S]*?<MobileWorkspaceHeader[\s\S]*?menuTarget="admin-navigation-drawer"/);
  assert.match(source, /<main[^>]*className="admin-workspace-content"/);
  assert.match(source, /aria-label=\{`Close \$\{title\}`\}/);
  assert.match(source, /onClick=\{onClose\}/);
});

test('desktop Account and Project menus are fixed overlays below their trigger', async () => {
  const [css, topBar] = await Promise.all([
    readWorkspaceStyles(),
    readWorkspaceComponent('WorkspaceTopBar'),
  ]);

  assert.match(css, /\.workspace-root \.workspace-topbar-menu\s*\{[^}]*position:\s*relative/s);
  assert.match(css, /\.workspace-root \.workspace-topbar-menu-popover\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*70/s);
  assert.match(topBar, /createPortal\(menu, portalTarget\)/);
  assert.match(topBar, /data-workspace-menu-overlay="true"/);
  assert.match(topBar, /getBoundingClientRect\(\)/);
});

test('desktop brand and navigation track scale forty percent without changing compact defaults', async () => {
  const css = await readWorkspaceStyles();
  const desktopStart = css.indexOf('@media (min-width: 1180px)');
  const desktopEnd = css.indexOf('@media (max-width: 1179px)', desktopStart);
  const desktop = css.slice(desktopStart, desktopEnd);

  assert.notEqual(desktopStart, -1, 'desktop workspace rules should exist');
  assert.match(css, /\.workspace-root \.workspace-topbar-brand\s*\{[^}]*flex:\s*0 1 14rem[^}]*font-size:\s*0\.75rem/s);
  assert.match(css, /\.workspace-root \.workspace-topbar-logo\s*\{[^}]*height:\s*2rem[^}]*max-width:\s*8rem/s);
  assert.match(desktop, /\.workspace-root:is\(\.sales-workspace, \.expert-workspace, \.admin-workspace\)\s*\{[^}]*--workspace-topbar-h:\s*4\.55rem/s);
  assert.match(desktop, /\.workspace-root:is\(\.sales-workspace, \.expert-workspace, \.admin-workspace\) \.workspace-topbar-brand\s*\{[^}]*flex-basis:\s*19\.6rem[^}]*font-size:\s*1\.05rem/s);
  assert.match(desktop, /\.workspace-root:is\(\.sales-workspace, \.expert-workspace, \.admin-workspace\) \.workspace-topbar-logo\s*\{[^}]*height:\s*2\.8rem[^}]*max-width:\s*11\.2rem/s);
  assert.match(desktop, /\.workspace-root:is\(\.sales-workspace, \.expert-workspace, \.admin-workspace\) \.workspace-topbar :is\(button, \[role='button'\]\)\s*\{[^}]*font-size:\s*0\.9625rem/s);
  assert.match(desktop, /\.workspace-root\.showroom-workspace\s*\{[^}]*--workspace-topbar-h:\s*3\.25rem/s);
  assert.doesNotMatch(desktop, /\.workspace-root\s*\{[^}]*--workspace-topbar-h:\s*4\.55rem/s);
});

test('viewer stage exposes the supplied viewer in the sole main landmark', async () => {
  const source = await readWorkspaceComponent('ViewerStage');

  assert.equal((source.match(/<main\b/g) || []).length, 1);
  assert.match(source, /className="workspace-viewer-stage"/);
  assert.match(source, /aria-label="3D model viewer"/);
  assert.match(source, /\{viewer\}/);
  assert.match(source, /\{toolbar\}/);
  assert.match(source, /\{cameraControls\}/);
  assert.match(source, /\{positioning\}/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
});

test('mobile workspace header identifies the active step and only exposes presentation exit when supplied', async () => {
  const source = await readWorkspaceComponent('MobileWorkspaceHeader');

  assert.match(source, /<header[^>]*className="workspace-mobile-header"/);
  assert.match(source, /aria-label="Open workspace menu"/);
  assert.match(source, /step\.label/);
  assert.match(source, /step\.description/);
  assert.match(source, /\{onExitPresentation && \(/);
  assert.match(source, />Exit Presentation</);
});

test('public Showroom omits internal navigation, project, account, and presentation actions', async () => {
  const source = await readWorkspaceComponent('WorkspaceTopBar');

  assert.match(source, /const publicShowroom = mode === 'showroom' && !onExitPresentation;/);
  assert.match(source, /\{publicShowroom \? \(/);
  assert.match(source, /mode !== 'showroom' && navigation/);
  assert.match(source, /mode !== 'showroom' && project\.label/);
  assert.match(source, /mode !== 'showroom' && account\.label/);
  assert.match(source, /mode !== 'showroom' && onPresent/);
});

test('workspace styles are contained by the new root and define layout tokens', async () => {
  const css = await readWorkspaceStyles();

  const rootRule = css.match(/\.workspace-root\s*\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(rootRule, 'workspace root rule should exist');
  assert.match(rootRule, /--workspace-topbar-h:\s*3\.25rem/);
  assert.match(rootRule, /--workspace-rail-w:\s*15rem/);
  assert.match(rootRule, /--workspace-inspector-w:\s*21rem/);
  assert.match(rootRule, /--studio-surface-graphite:\s*var\(--studio-surface-frame\)/);
  assert.match(rootRule, /min-height:\s*100dvh/);
  assert.match(rootRule, /background:\s*var\(--studio-surface-graphite\)/);
  assert.match(css, /\.workspace-root :is\(button, \[href\], \[role='button'\]\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  const cssWithoutMediaHeaders = css
    .replace(/@media[^\{]+\{/g, '')
    .replace(/^\s+(?=\.workspace-root)/gm, '');
  assert.doesNotMatch(cssWithoutMediaHeaders, /(?:^|\n)(?!\.workspace-root)[^{\n]+\{/);
});

test('main entrypoint loads the workspace frame stylesheet without changing legacy application composition', async () => {
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');

  assert.match(main, /import '\.\/styles\/workspace-modes\.css';/);
  assert.doesNotMatch(main, /\.app-nav/);
});
