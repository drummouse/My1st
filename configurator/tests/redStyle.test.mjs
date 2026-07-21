import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readStyle = (name) => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8');

test('workspace red is reserved for active and primary controls, never major surfaces', async () => {
  const css = await readStyle('styles/workspace-modes.css');
  const redSurfaceRules = [...css.matchAll(/([^{}]+)\{([^{}]*background:\s*var\(--studio-action\)[^{}]*)\}/g)]
    .map((match) => match[1].trim());

  assert.deepEqual(redSurfaceRules, [
    '.workspace-root .sales-workspace-rail .is-active .studio-button',
    '.workspace-root .expert-workspace-mode-actions .expert-present-action,\n.workspace-root .expert-update-estimate',
    '.workspace-root .expert-tool-rail .is-active button',
    '.workspace-root .showroom-customer-actions .showroom-primary-action',
  ]);

  for (const surface of ['workspace-root', 'workspace-topbar', 'sales-workspace-rail', 'sales-workspace-inspector', 'expert-workspace-tools', 'expert-workspace-inspector', 'showroom-category-region', 'showroom-quote-region']) {
    const rule = css.match(new RegExp(`\\.${surface}\\s*\\{([^}]*)\\}`))?.[1] || '';
    assert.doesNotMatch(rule, /background:\s*var\(--studio-action\)/, `${surface} must stay neutral`);
  }
});

test('disabled primary controls use neutral, legible semantic tokens', async () => {
  const [tokens, workspace] = await Promise.all([
    readStyle('styles/studio-tokens.css'),
    readStyle('styles/workspace-modes.css'),
  ]);

  assert.match(tokens, /--studio-action-disabled-surface:\s*#e2ddd5/);
  assert.match(tokens, /--studio-action-disabled-text:\s*#514d48/);
  assert.match(tokens, /--studio-action-disabled-border:\s*#a79f95/);
  assert.doesNotMatch(tokens, /--studio-action-disabled-(?:surface|text|border):\s*var\(--studio-action\)/);
  assert.match(workspace, /\.expert-update-estimate:disabled\s*\{[^}]*background:\s*var\(--studio-action-disabled-surface\)[^}]*border-color:\s*var\(--studio-action-disabled-border\)[^}]*color:\s*var\(--studio-action-disabled-text\)/s);
});
