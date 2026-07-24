import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { createServer } from 'vite';

const readComponent = (name) => readFile(
  new URL(`../src/components/${name}.jsx`, import.meta.url),
  'utf8',
);

const readWorkspaceComponent = (name) => readFile(
  new URL(`../src/components/workspaces/${name}.jsx`, import.meta.url),
  'utf8',
);

const readStyle = (path) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

let vite;
let AssemblyAdjustment;
let ViewerStage;

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: AssemblyAdjustment } = await vite.ssrLoadModule('/src/components/AssemblyAdjustment.jsx'));
  ({ default: ViewerStage } = await vite.ssrLoadModule('/src/components/workspaces/ViewerStage.jsx'));
});

test.after(async () => {
  await vite?.close();
});

const adjustmentProps = (overrides = {}) => ({
  layers: [{ id: 'main', name: 'Main' }],
  layerOffsets: { main: { dx: 0, dy: 0, dz: 0 } },
  activeLayerId: 'main',
  onActiveLayerChange: () => {},
  onChange: () => {},
  onReset: () => {},
  ...overrides,
});

test('positioning has a close action, thick range controls, numeric inputs, and four adjacent actions per axis', async () => {
  const source = await readComponent('AssemblyAdjustment');

  assert.match(source, /aria-label="Close model positioning"/);
  assert.match(source, /className="adjust-range"/);
  assert.match(source, /className="adjust-number"/);
  assert.match(source, /className="adjust-axis-actions"/);
  assert.match(source, /aria-label={`Decrease \${label} offset`}/);
  assert.match(source, /aria-label={`Increase \${label} offset`}/);
  assert.match(source, />−<\/button>/);
  assert.match(source, />▼<\/button>/);
  assert.match(source, />▲<\/button>/);
  assert.match(source, />\+<\/button>/);
});

test('positioning close removes the panel and its launcher can restore it through ViewerStage state', () => {
  let renderer;
  act(() => {
    renderer = TestRenderer.create(createElement(ViewerStage, {
      mode: 'sales',
      viewer: createElement(AssemblyAdjustment, adjustmentProps()),
    }));
  });

  const close = renderer.root.findByProps({ 'aria-label': 'Close model positioning' });
  assert.equal(renderer.root.findByType('main').props['data-positioning-open'], 'true');

  act(() => close.props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Close model positioning' }).length, 0);
  assert.equal(renderer.root.findByType('main').props['data-positioning-open'], 'false');

  const open = renderer.root.findByProps({ 'aria-label': 'Open model positioning' });
  act(() => open.props.onClick());
  assert.equal(renderer.root.findAllByProps({ 'aria-label': 'Close model positioning' }).length, 1);
  assert.equal(renderer.root.findByType('main').props['data-positioning-open'], 'true');

  act(() => renderer.unmount());
});

test('fine and coarse positioning actions preserve layer callbacks and clamp at axis bounds', () => {
  const changes = [];
  let renderer;
  act(() => {
    renderer = TestRenderer.create(createElement(AssemblyAdjustment, adjustmentProps({
      layerOffsets: { main: { dx: 59.8, dy: 0, dz: 0 } },
      onChange: (...args) => changes.push(args),
    })));
  });

  act(() => renderer.root.findByProps({ 'aria-label': 'Increase East/West offset' }).props.onClick());
  assert.deepEqual(changes.at(-1), ['main', { dx: 60, dy: 0, dz: 0 }]);

  act(() => renderer.root.findByProps({ 'aria-label': 'Increase East/West offset by 5 ft' }).props.onClick());
  assert.deepEqual(changes.at(-1), ['main', { dx: 60, dy: 0, dz: 0 }]);

  const number = renderer.root.findByProps({ 'aria-label': 'East/West offset in ft' });
  act(() => number.props.onChange({ target: { value: '99' } }));
  assert.deepEqual(changes.at(-1), ['main', { dx: 60, dy: 0, dz: 0 }]);

  act(() => renderer.unmount());
});

test('viewer controls stay docked to the model edges while positioning remains compact', async () => {
  const [viewer, stage, css] = await Promise.all([
    readComponent('Viewer3D'),
    readWorkspaceComponent('ViewerStage'),
    readStyle('styles/workspace-modes.css'),
  ]);

  assert.match(viewer, /className="viewer-direction-controls"[\s\S]*?>Top<\/button>[\s\S]*?>Back<\/button>[\s\S]*?>Front<\/button>[\s\S]*?>Left<\/button>[\s\S]*?>Right<\/button>/);
  assert.match(stage, /positioningOpen/);
  assert.match(css, /\.workspace-root \.viewer-direction-controls\s*\{[^}]*inset:\s*0[^}]*pointer-events:\s*none[^}]*position:\s*absolute/s);
  assert.match(css, /\.viewer-direction-controls \.viewer3d-elevation-btn-left\s*\{[^}]*left:\s*0\.75rem[^}]*top:\s*50%/s);
  assert.match(css, /\.viewer-direction-controls \.viewer3d-elevation-btn-right\s*\{[^}]*right:\s*0\.75rem[^}]*top:\s*50%/s);
  assert.match(css, /\.viewer-direction-controls \.viewer3d-topview-btn\s*\{[^}]*right:\s*0\.75rem[^}]*top:\s*0\.75rem/s);
  assert.match(css, /\.adjust-range::-(?:webkit-slider-runnable|moz-range)-track\s*\{[^}]*height:\s*0\.9rem/s);
  assert.match(css, /\.adjust-number-stepper \.adjust-number\s*\{[^}]*font-size:\s*1\.3rem[^}]*font-weight:\s*800/s);
  assert.match(css, /\.workspace-root \.model-positioning-launcher/);
  assert.doesNotMatch(css, /\.viewer-direction-controls[^}]*left:\s*[^;]*model-positioning/s);
});
