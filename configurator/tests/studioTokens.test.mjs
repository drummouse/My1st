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

test('IronWrap skin maps visible legacy accents onto semantic red action tokens', async () => {
  const css = await readFile(new URL('../src/styles/studio-tokens.css', import.meta.url), 'utf8');
  const brandToggle = await readFile(new URL('../src/components/BrandToggle.jsx', import.meta.url), 'utf8');

  assert.match(
    css,
    /\[data-studio-skin='ironwrap'\]\s*\{[^}]*--brand-accent:\s*var\(--studio-action\);[^}]*--brand-accent-dark:\s*var\(--studio-action-hover\);[^}]*\}/s,
  );
  assert.match(css, /\[data-studio-skin='ironwrap'\] \.library-tabs button\.active\s*\{[^}]*color:\s*var\(--studio-action-active\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] \.brand-toggle-btn\.active\s*\{[^}]*background:\s*var\(--studio-action\)/s);
  assert.doesNotMatch(css, /:root\s*\{[^}]*--brand-accent:\s*var\(--studio-action\)/s);
  assert.match(brandToggle, /'--brand-option-accent': b\.accent/);
  assert.doesNotMatch(brandToggle, /background:\s*b\.accent/);
});
