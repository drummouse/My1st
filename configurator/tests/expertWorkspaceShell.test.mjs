import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Children, createElement, isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

let vite;
let ExpertToolRail;
let ExpertWorkspaceShell;
let ExpertSurfaceInspector;
let DEFAULT_EXPERT_TOOLS;
let ViewerStage;

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: ExpertToolRail, DEFAULT_EXPERT_TOOLS } = await vite.ssrLoadModule('/src/components/workspaces/ExpertToolRail.jsx'));
  ({ default: ExpertWorkspaceShell, ExpertSurfaceInspector } = await vite.ssrLoadModule('/src/components/workspaces/ExpertWorkspaceShell.jsx'));
  ({ default: ViewerStage } = await vite.ssrLoadModule('/src/components/workspaces/ViewerStage.jsx'));
});

test.after(async () => {
  await vite?.close();
});

const tools = [
  { key: 'select', label: 'Select Surface', implemented: true },
  { key: 'move', label: 'Move Model', implemented: false, disabledReason: 'Use the viewer orbit controls.' },
  { key: 'split', label: 'Surface Split', implemented: false, disabledReason: 'Surface splitting is planned for a future release.' },
];

const shellProps = (overrides = {}) => ({
  expertEntitled: true,
  showExpertMode: true,
  topBar: createElement('header', null, 'Project 1704'),
  tools,
  activeTool: 'select',
  onToolChange: () => {},
  viewerStage: createElement('div', { 'data-model': 'house' }, '3D model'),
  surfaceInspector: createElement('section', { 'data-surface-id': 'roof-4' }, 'Roof facet 4'),
  estimate: createElement('strong', null, '$12,450.00'),
  onUpdateEstimate: () => {},
  onReturnToSales: () => {},
  onPresent: () => {},
  ...overrides,
});

function findElements(node, predicate, matches = []) {
  if (!isValidElement(node)) return matches;
  if (predicate(node)) matches.push(node);
  Children.forEach(node.props.children, (child) => findElements(child, predicate, matches));
  return matches;
}

test('Expert composition stays closed unless both verified gates pass', () => {
  for (const gates of [
    { expertEntitled: false, showExpertMode: false },
    { expertEntitled: false, showExpertMode: true },
    { expertEntitled: true, showExpertMode: false },
  ]) {
    assert.equal(renderToStaticMarkup(createElement(ExpertWorkspaceShell, shellProps(gates))), '');
  }

  const authorized = renderToStaticMarkup(createElement(ExpertWorkspaceShell, shellProps()));
  assert.match(authorized, /data-workspace-mode="expert"/);
});

test('implemented tools are controlled actions and unavailable tools explain why', () => {
  const changes = [];
  const rail = ExpertToolRail({ tools, activeTool: 'select', onToolChange: (key) => changes.push(key) });
  const buttons = findElements(rail, (element) => element.type === 'button');
  const select = buttons.find((button) => button.props.children?.[0]?.props?.children === 'Select Surface');
  const split = buttons.find((button) => button.props.children?.[0]?.props?.children === 'Surface Split');

  assert.equal(select.props['aria-pressed'], true);
  assert.equal(select.props['aria-current'], undefined);
  assert.equal(select.props['aria-disabled'], undefined);
  select.props.onClick();
  assert.deepEqual(changes, ['select']);

  assert.equal(split.props['aria-disabled'], true);
  assert.equal(split.props.disabled, undefined);
  split.props.onClick();
  assert.deepEqual(changes, ['select']);

  const html = renderToStaticMarkup(rail);
  assert.match(html, /role="toolbar"/);
  assert.match(html, /Surface splitting is planned for a future release\./);
  assert.match(html, /aria-describedby="expert-tool-reason-split"/);
});

test('only the surface-selection tool is presented as implemented until tool state drives behavior', () => {
  const states = Object.fromEntries(DEFAULT_EXPERT_TOOLS.map((tool) => [tool.key, tool.implemented]));

  assert.equal(states.select, true);
  assert.equal(states.move, false);
  assert.equal(states.rotate, false);
  assert.equal(states.measure, false);
});

test('Expert selected-surface composition exposes real measurements, material, color, and override callbacks', () => {
  const calls = [];
  const inspector = ExpertSurfaceInspector({
    surface: { identity: 'Roof facet 4', measurement: '9.29 m²', pitch: '6/12 pitch' },
    material: { id: 'standing-seam', label: 'Standing Seam' },
    color: { id: 'graphite', label: 'Graphite' },
    hasOverride: true,
    onEditMaterial: () => calls.push('material'),
    onEditColor: () => calls.push('color'),
    onClearOverride: () => calls.push('clear'),
  });
  const buttons = findElements(inspector, (element) => element.type === 'button');
  const html = renderToStaticMarkup(inspector);

  assert.match(html, /Roof facet 4/);
  assert.match(html, /9\.29 m²/);
  assert.match(html, /6\/12 pitch/);
  assert.match(html, /Standing Seam/);
  assert.match(html, /Graphite/);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(calls, ['material', 'color', 'clear']);
});

test('an explicit Expert surface edit activates per-surface mode and preserves existing overrides', async () => {
  const { applySurfaceEdit } = await import('../src/lib/surfaceOverrides.js');
  const current = { 'roof:F1': { colorId: 'graphite' } };

  assert.deepEqual(applySurfaceEdit({
    uniformFinish: true,
    facetOverrides: current,
    facetKey: 'roof:F2',
    patch: { productId: 'standing-seam' },
  }), {
    uniformFinish: false,
    facetOverrides: {
      'roof:F1': { colorId: 'graphite' },
      'roof:F2': { productId: 'standing-seam' },
    },
  });
  assert.deepEqual(current, { 'roof:F1': { colorId: 'graphite' } });
});

test('Option B composes a dense tool, viewer, surface, and quick-estimate workspace', () => {
  const html = renderToStaticMarkup(createElement(ExpertWorkspaceShell, shellProps({ activeTool: 'select' })));

  assert.match(html, /aria-label="Expert tools"/);
  assert.match(html, /class="expert-workspace-viewer"/);
  assert.match(html, /aria-label="Selected surface inspector"/);
  assert.match(html, /Roof facet 4/);
  assert.match(html, /aria-label="Quick estimate"/);
  assert.match(html, /\$12,450\.00/);
  assert.match(html, /Select Surface[\s\S]*aria-pressed="true"|aria-pressed="true"[\s\S]*Select Surface/);
  assert.equal((html.match(/data-model="house"/g) || []).length, 1);
  assert.equal((html.match(/data-surface-id="roof-4"/g) || []).length, 1);
});

test('the shared viewer stage remains the sole main landmark', () => {
  const viewerStage = createElement(ViewerStage, {
    viewer: createElement('div', null, '3D model'),
    mode: 'expert',
  });
  const html = renderToStaticMarkup(createElement(ExpertWorkspaceShell, shellProps({ viewerStage })));

  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /<main[^>]*class="workspace-viewer-stage"/);
});

test('Sales, Presentation, and estimate transitions remain explicit callbacks', () => {
  const calls = [];
  const shell = ExpertWorkspaceShell(shellProps({
    onReturnToSales: () => calls.push('sales'),
    onPresent: () => calls.push('presentation'),
    onUpdateEstimate: () => calls.push('estimate'),
  }));
  const buttons = findElements(shell, (element) => element.type === 'button');

  for (const [label, expected] of [
    ['Return to Sales', 'sales'],
    ['Present to Customer', 'presentation'],
    ['Update Estimate', 'estimate'],
  ]) {
    const button = buttons.find((candidate) => candidate.props.children === label);
    assert.ok(button, `${label} should be a named button`);
    button.props.onClick();
    assert.equal(calls.at(-1), expected);
  }
});

test('active tool and selected surface survive a presentation round trip without snapshots', async () => {
  const { enterPresentation, exitPresentation } = await import('../src/lib/workspaceMode.js');
  const source = await readFile(
    new URL('../src/components/workspaces/ExpertWorkspaceShell.jsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /useState|useReducer|useRef|captureDesignState|applyDesignState/);

  let snapshotCalls = 0;
  const selectedFacet = { key: 'wall-9', role: 'wall', faceId: 9 };
  const presented = enterPresentation({
    mode: 'expert',
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
    activeExpertTool: 'move',
    selectedFacet,
    captureDesignSnapshot: () => { snapshotCalls += 1; },
    applyDesignSnapshot: () => { snapshotCalls += 1; },
  });
  const restored = exitPresentation(presented, {
    authenticated: true,
    expertEntitled: true,
    showExpertMode: true,
  });
  const afterPresentation = renderToStaticMarkup(createElement(ExpertWorkspaceShell, shellProps({
    activeTool: restored.activeExpertTool,
    surfaceInspector: createElement('section', { 'data-surface-id': restored.selectedFacet.key }, 'Wall facet 9'),
  })));

  assert.equal(restored.mode, 'expert');
  assert.equal(restored.activeExpertTool, 'move');
  assert.equal(restored.selectedFacet, selectedFacet);
  assert.equal(snapshotCalls, 0);
  assert.match(afterPresentation, /data-active-tool="move"/);
  assert.match(afterPresentation, /data-surface-id="wall-9"/);
});

test('invalid parent tool state is not presented as an active implemented tool', () => {
  const html = renderToStaticMarkup(createElement(ExpertWorkspaceShell, shellProps({ activeTool: 'future-tool' })));

  assert.match(html, /Active tool: None/);
  assert.doesNotMatch(html, /aria-pressed="true"/);
});

test('Expert CSS gives the viewer the dominant center region and compact adjacent tools', async () => {
  const css = await readFile(new URL('../src/styles/workspace-modes.css', import.meta.url), 'utf8');
  const shellRule = css.match(/\.workspace-root\.expert-workspace\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(shellRule, 'Expert workspace should have a root layout rule');
  assert.match(shellRule, /display:\s*grid/);
  assert.match(shellRule, /"top top top"/);
  assert.match(shellRule, /"tools viewer inspector"/);
  assert.match(shellRule, /minmax\(0, 1fr\)/);
  assert.match(css, /\.workspace-root \.expert-workspace-tools\s*\{[^}]*grid-area:\s*tools/s);
  assert.match(css, /\.workspace-root \.expert-workspace-viewer\s*\{[^}]*grid-area:\s*viewer/s);
  assert.match(css, /\.workspace-root \.expert-workspace-inspector\s*\{[^}]*grid-area:\s*inspector/s);
  assert.match(css, /\.workspace-root \.expert-quick-estimate\s*\{/);
});
