import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { STUDIO_STEPS } from '../src/lib/studioSteps.js';

let vite;
let EstimateDock;
let SalesModeShell;

test.before(async () => {
  vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  ({ default: EstimateDock } = await vite.ssrLoadModule('/src/components/EstimateDock.jsx'));
  ({ default: SalesModeShell } = await vite.ssrLoadModule('/src/components/workspaces/SalesModeShell.jsx'));
});

test.after(async () => {
  await vite.close();
});

const readComponent = (name, directory = 'components') => readFile(
  new URL(`../src/${directory}/${name}.jsx`, import.meta.url),
  'utf8',
);

const readStyles = () => readFile(
  new URL('../src/styles/workspace-modes.css', import.meta.url),
  'utf8',
);

test('Option A composes one compact desktop workspace in the approved region order', async () => {
  const source = await readComponent('SalesModeShell', 'components/workspaces');

  assert.match(source, /className=\{`\$\{embedded \? 'workspace-shell' : 'workspace-root'\} sales-workspace\$\{detailsOpen \? '' : ' is-details-closed'\}`\}/);
  const top = source.indexOf('sales-workspace-top');
  const rail = source.indexOf('sales-workspace-rail');
  const viewer = source.indexOf('sales-workspace-viewer');
  const inspector = source.indexOf('sales-workspace-inspector');
  assert.ok(top < rail && rail < viewer && viewer < inspector, 'desktop regions should follow top, rail, viewer, inspector order');

  assert.equal((source.match(/\{viewerStage\}/g) || []).length, 1);
  assert.equal((source.match(/\{inspector\}/g) || []).length, 1);
  assert.match(source, /<aside className="sales-workspace-inspector"/);
  assert.doesNotMatch(source, />Menu</);
  assert.doesNotMatch(source, />Log out</);
  assert.doesNotMatch(source, /app-nav|admin-tabs|studio-shell-estimate/);
});

test('Option A progression invokes clamped canonical targets without retaining inactive panels', () => {
  const targets = [];
  const shell = SalesModeShell({
    topBar: createElement('header', null, 'Top'),
    steps: STUDIO_STEPS,
    activeStep: 'roof',
    onStepChange: () => {},
    viewerStage: createElement('main', null, 'Viewer'),
    inspector: createElement('section', { 'data-active-panel': 'roof' }, 'Roof controls'),
    estimate: { content: createElement('strong', null, '$1,000'), nextReady: true },
    onPrevious: (target) => targets.push(target),
    onNext: (target) => targets.push(target),
  });
  const inspectorRegion = shell.props.children[3];
  const dock = inspectorRegion.props.children[1];

  dock.props.onPrevious();
  dock.props.onNext();
  assert.deepEqual(targets, ['project', 'siding']);

  const html = renderToStaticMarkup(shell);
  assert.equal((html.match(/data-active-panel="roof"/g) || []).length, 1);
  assert.doesNotMatch(html, /\shidden(?:="")?/);
});

test('Review derives the final-step state and cannot invoke a no-op Next action', () => {
  const targets = [];
  const shell = SalesModeShell({
    topBar: createElement('header', null, 'Top'),
    steps: STUDIO_STEPS,
    activeStep: 'review',
    onStepChange: () => {},
    inspector: createElement('section', null, 'Review'),
    estimate: { content: '$1,000', nextReady: true },
    onNext: (target) => targets.push(target),
  });
  const dock = shell.props.children[3].props.children[1];
  const html = renderToStaticMarkup(dock);

  assert.equal(dock.props.atLastStep, true);
  assert.match(html, /aria-label="Next step" disabled=""/);
  assert.deepEqual(targets, []);
});

test('compact estimate keeps legacy final-step disabling and explicit readiness disabling', () => {
  const finalStep = renderToStaticMarkup(createElement(EstimateDock, {
    activeStep: 'Review',
    atFirstStep: false,
    atLastStep: true,
    estimate: true,
    nextReady: true,
  }, '$1,000'));
  const notReady = renderToStaticMarkup(createElement(EstimateDock, {
    activeStep: 'Roof',
    atFirstStep: false,
    atLastStep: false,
    estimate: true,
    nextReady: false,
  }, '$1,000'));

  assert.match(finalStep, /aria-label="Next step" disabled=""/);
  assert.match(notReady, /aria-label="Next step" disabled=""/);
});

test('Option A rail names all six steps with descriptors and non-color state text', async () => {
  const source = await readComponent('GuidedStepRail');

  assert.deepEqual(STUDIO_STEPS.map(({ key, label }) => [key, label]), [
    ['project', 'Project'],
    ['roof', 'Roof'],
    ['siding', 'Siding'],
    ['accents', 'Trims & Accents'],
    ['services', 'Services'],
    ['review', 'Review'],
  ]);

  for (const [step, description] of [
    ['project', 'Project Details'],
    ['roof', 'Materials & Colors'],
    ['siding', 'Materials & Colors'],
    ['accents', 'Colors & Styles'],
    ['services', 'Add-ons & Extras'],
    ['review', 'Estimate & Proposal'],
  ]) {
    assert.match(source, new RegExp(`${step}: ['"]${description.replace('&', '\\&')}['"]`));
  }

  assert.match(source, /aria-current=\{active \? 'step' : undefined\}/);
  assert.match(source, /Current step/);
  assert.match(source, /Complete/);
  assert.match(source, /step\.description \|\| STEP_DESCRIPTIONS\[step\.key\]/);
});

test('Option A keeps only the contextual active panel and compact explicit progression', async () => {
  const shell = await readComponent('SalesModeShell', 'components/workspaces');
  const estimateDock = await readComponent('EstimateDock');

  assert.match(shell, /import \{ STUDIO_STEPS, getStudioStep, nextStudioStep, previousStudioStep \}/);
  assert.match(shell, /completedSteps=\{completedSteps\}/);
  assert.match(shell, /previousStudioStep\(currentStep\.key\)\.key/);
  assert.match(shell, /nextStudioStep\(currentStep\.key\)\.key/);
  assert.match(shell, /nextReady=\{estimate\?\.nextReady !== false\}/);
  assert.match(shell, /nextLabel=\{estimate\?\.nextLabel \|\| 'Next Step'\}/);
  assert.doesNotMatch(shell, /hidden=|inspector\.map|loading.*nextReady|nextReady.*loading/is);

  assert.match(estimateDock, /disabled=\{atFirstStep\}/);
  assert.match(estimateDock, /disabled=\{atLastStep \|\| !nextReady\}/);
  assert.doesNotMatch(estimateDock, /disabled=\{[^}]*loading/i);
});

test('Option A CSS uses the concept grid and nests estimate actions in the inspector', async () => {
  const css = await readStyles();
  const shellRule = css.match(/\.workspace-root\.sales-workspace\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(shellRule, 'Sales workspace should have a root layout rule');
  assert.match(shellRule, /display:\s*grid/);
  assert.match(shellRule, /grid-template:\s*\n\s*"top top top" var\(--workspace-topbar-h\)\s*\n\s*"rail viewer inspector" minmax\(0, 1fr\)\s*\n\s*\/ var\(--workspace-rail-w\) minmax\(0, 1fr\) var\(--workspace-inspector-w\)/);
  assert.match(shellRule, /height:\s*100dvh/);
  assert.match(css, /\.workspace-root \.sales-workspace-inspector\s*\{[^}]*grid-area:\s*inspector[^}]*grid-template-rows:\s*minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.workspace-root \.sales-workspace-estimate\s*\{/);
  assert.doesNotMatch(css, /\.workspace-root \.sales-workspace-estimate\s*\{[^}]*grid-area:\s*estimate/s);
});
