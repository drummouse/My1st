import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('default skin defines required semantic tokens and safe touch geometry', async () => {
  const css = await readFile(new URL('../src/styles/studio-tokens.css', import.meta.url), 'utf8');
  for (const token of ['--studio-action', '--studio-surface-canvas', '--studio-surface-panel', '--studio-text', '--studio-border', '--studio-focus', '--studio-radius-control', '--studio-shadow-panel']) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /--studio-control-min:\s*44px/);
});

test('UI primitives consume semantic classes without tenant color literals', async () => {
  const source = await readFile(new URL('../src/components/ui/StudioButton.jsx', import.meta.url), 'utf8');
  assert.match(source, /studio-button/);
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}/i);
});
