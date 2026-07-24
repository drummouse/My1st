import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readStyle = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('legacy application header and tab chrome is isolated from the workspace shells', async () => {
  const [indexCss, studioCss] = await Promise.all([
    readStyle('index.css'),
    readStyle('styles/studio-shell.css'),
  ]);

  assert.doesNotMatch(indexCss, /(?:^|\n)\.app-header\s*\{/);
  assert.doesNotMatch(indexCss, /(?:^|\n)\.app-nav\s*\{/);
  assert.doesNotMatch(indexCss, /(?:^|\n)\.app-nav-tab(?:\.|\s|\{)/);
  assert.doesNotMatch(studioCss, /(?:^|\n)\s*\.studio-shell-top-bar(?:\s|\{)/);
  assert.doesNotMatch(studioCss, /(?:^|\n)\s*\.studio-top-bar-actions(?:\s|\{)/);
  assert.doesNotMatch(studioCss, /(?:^|\n)\.guided-step-rail(?:\s|\{)/);
  assert.doesNotMatch(studioCss, /(?:^|\n)\.estimate-dock(?:-|\s|\{)/);
});

test('desktop shells preserve the approved compact chrome and viewer-first proportions', async () => {
  const css = await readStyle('styles/workspace-modes.css');

  assert.match(css, /--workspace-topbar-h:\s*3\.25rem/);
  assert.match(css, /--workspace-rail-w:\s*15rem/);
  assert.match(css, /--workspace-inspector-w:\s*21rem/);
  assert.match(css, /--expert-tool-rail-w:\s*11rem/);
  assert.match(css, /--expert-inspector-w:\s*20rem/);
  assert.match(css, /--showroom-category-w:\s*10\.5rem/);
  assert.match(css, /--showroom-quote-w:\s*22rem/);
  assert.match(css, /\.workspace-root \.workspace-topbar-logo\s*\{[^}]*height:\s*2rem[^}]*max-width:\s*8rem/s);
  assert.match(css, /\.workspace-root \.showroom-material-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
});

test('desktop correction shell keeps graphite structure warm inspector surfaces and red-only primary emphasis', async () => {
  const [css, legacyShellCss] = await Promise.all([
    readStyle('styles/workspace-modes.css'),
    readStyle('styles/studio-shell.css'),
  ]);

  assert.match(css, /--workspace-topbar-h:/);
  assert.match(css, /--studio-red:\s*var\(--studio-action\)/);
  assert.match(css, /\.workspace-root\s*\{[^}]*background:\s*var\(--studio-surface-graphite\)/s);
  assert.match(css, /\.workspace-root \.sales-workspace-rail\s*\{[^}]*background:\s*var\(--studio-surface-frame\)/s);
  assert.match(css, /\.workspace-root \.expert-workspace-tools\s*\{[^}]*background:\s*var\(--studio-surface-frame\)/s);
  assert.match(css, /\.workspace-root \.sales-workspace-inspector\s*\{[^}]*background:\s*var\(--studio-surface-panel\)/s);
  assert.match(css, /\.workspace-root \.expert-workspace-inspector\s*\{[^}]*background:\s*var\(--studio-surface-panel\)/s);
  assert.match(css, /\.workspace-root \.showroom-quote-region\s*\{[^}]*background:\s*var\(--studio-surface-panel\)/s);
  assert.match(legacyShellCss, /\.studio-shell \.studio-shell-top-bar \.studio-top-bar\s*\{[^}]*background:\s*var\(--studio-surface-frame\)/s);
  assert.match(legacyShellCss, /\.studio-shell \.studio-shell-inspector\s*\{[^}]*background:\s*var\(--studio-surface-panel\)/s);
  assert.doesNotMatch(css, /background:\s*#d11f2a[^;]*;\s*min-height:\s*100vh/);
});

test('Showroom reserves a material row that cannot cover viewer comparison controls', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  const showroom = css.match(/\.workspace-root\.showroom-workspace\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  const desktopPresentation = css.match(/@media \(min-width:\s*768px\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(showroom, /"categories viewer quote"\s+minmax\(0, 1fr\)\s*\n\s*"categories materials quote"\s+auto/s);
  assert.match(desktopPresentation, /\.workspace-root \.showroom-materials\s*\{[^}]*grid-area:\s*materials/s);
  assert.doesNotMatch(desktopPresentation, /\.workspace-root \.showroom-materials\s*\{[^}]*grid-area:\s*viewer/s);
  assert.match(css, /\.workspace-root \.showroom-viewer-actions\s*\{[^}]*bottom:\s*0\.75rem/s);
});

test('compact navigation drawers reflow desktop navigation and actions into reachable grids', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  const compact = css.match(/@media \(max-width:\s*1179px\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(compact, /:popover-open \.workspace-topbar\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*overflow-x:\s*hidden/s);
  assert.match(compact, /:popover-open \.workspace-topbar-navigation,[\s\S]*?:popover-open \.workspace-topbar-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*overflow-x:\s*hidden/s);
  assert.match(compact, /:popover-open \.workspace-topbar-navigation > button\s*\{[^}]*white-space:\s*normal[^}]*width:\s*100%/s);
  assert.match(compact, /\.expert-workspace-top\[popover\]:popover-open \.expert-workspace-mode-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)[^}]*overflow-x:\s*hidden/s);
});

test('tablet shells cap control columns and leave the flexible remainder to the viewer', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  const compact = css.match(/@media \(max-width:\s*1179px\)\s*\{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(compact, /\.workspace-root\.sales-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(19rem, var\(--workspace-inspector-w\)\)/s);
  assert.match(compact, /\.workspace-root\.expert-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(19rem, var\(--expert-inspector-w\)\)/s);
  assert.match(compact, /\.workspace-root\.showroom-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(19rem, var\(--showroom-quote-w\)\)/s);
  assert.doesNotMatch(compact, /grid-template-columns:\s*minmax\(0, 3fr\) minmax\(19rem, 2fr\)/);
});

test('phone layouts are bounded workspaces rather than document-length generic stacks', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)\n\}/)?.[1];

  assert.ok(mobile, 'mobile workspace contract should exist');
  assert.match(mobile, /\.workspace-root\.app-workspace-layout:is\(\.sales-workspace, \.expert-workspace, \.showroom-workspace\)\s*\{[^}]*height:\s*100dvh[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s);
  assert.match(mobile, /\.sales-workspace-active-panel,[\s\S]*?\.expert-surface-panel\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(mobile, /\.workspace-root \.workspace-mobile-step\s*\{[^}]*min-width:\s*0/s);
  assert.match(mobile, /\.workspace-root \.showroom-material-grid\s*\{[^}]*grid-auto-flow:\s*column[^}]*grid-auto-columns:/s);
});

test('phone sheets keep close controls reachable and preserve 44px interaction geometry', async () => {
  const [css, legacyShellCss] = await Promise.all([
    readStyle('styles/workspace-modes.css'),
    readStyle('styles/studio-shell.css'),
  ]);
  const mobile = css.match(/@media \(max-width:\s*767px\)\s*\{([\s\S]*)\n\}/)?.[1] || '';

  assert.match(css, /\.workspace-root :is\(button, \[href\], \[role='button'\]\)\s*\{[^}]*min-height:\s*var\(--studio-control-min\)[^}]*min-width:\s*var\(--studio-control-min\)/s);
  assert.match(mobile, /\.workspace-root \.context-inspector-heading \.studio-button\s*\{[^}]*display:\s*inline-flex/s);
  assert.match(mobile, /\.workspace-root \.workspace-viewer-stage\[data-positioning-open='false'\] \.assembly-dock\s*\{[^}]*display:\s*none/s);
  assert.match(legacyShellCss, /@media \(max-width:\s*900px\)[\s\S]*?\.studio-shell \.studio-shell-inspector \.context-inspector\.is-mobile-open\s*\{[^}]*transform:\s*translateY\(0\)/s);
});

test('workspace transitions honor reduced motion and keyboard focus remains explicit', async () => {
  const css = await readStyle('styles/workspace-modes.css');

  assert.match(css, /\.workspace-root :is\(button, \[href\], input, select, textarea, \[role='button'\]\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--studio-focus\)[^}]*outline-offset:\s*2px/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.workspace-root \*\s*\{[^}]*animation-duration:\s*0\.01ms[^}]*scroll-behavior:\s*auto[^}]*transition-duration:\s*0\.01ms/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.workspace-root :is\(\.workspace-topbar-menu-popover, \.workspace-primary-actions\)\s*\{[^}]*transition:\s*none/s);
});
