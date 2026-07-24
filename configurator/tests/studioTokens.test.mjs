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

test('IronWrap palette separates graphite framing, warm work surfaces, and restrained red emphasis', async () => {
  const css = await readFile(new URL('../src/styles/studio-tokens.css', import.meta.url), 'utf8');

  assert.match(css, /--studio-action:\s*#c81d25/i);
  assert.match(css, /--studio-action-subtle:\s*color-mix\(in srgb, var\(--studio-action\) 9%, var\(--studio-surface-control\)\)/);
  assert.match(css, /--studio-surface-frame:\s*#1c2024/i);
  assert.match(css, /--studio-surface-frame-raised:\s*#292e33/i);
  assert.match(css, /--studio-surface-canvas:\s*#f2efe8/i);
  assert.match(css, /--studio-surface-panel:\s*#fffdf9/i);
  assert.match(css, /--studio-text-on-frame:\s*#fffaf3/i);
  assert.match(css, /--studio-text-on-frame-muted:\s*#c8c2ba/i);
  assert.match(css, /--studio-border-on-frame:\s*#474c50/i);
  assert.match(css, /--studio-positive:/);
  assert.match(css, /--studio-warning:/);
  assert.match(css, /--studio-critical:\s*var\(--studio-action-active\)/);
});

test('disabled primary actions use dedicated neutral tokens with readable text contrast', async () => {
  const css = await readFile(new URL('../src/styles/studio-tokens.css', import.meta.url), 'utf8');
  const shellCss = await readFile(new URL('../src/styles/studio-shell.css', import.meta.url), 'utf8');
  const estimateDock = await readFile(new URL('../src/components/EstimateDock.jsx', import.meta.url), 'utf8');
  const tokenValue = (name) => css.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const luminance = (hex) => {
    const [red, green, blue] = hex.slice(1).match(/../g)
      .map((part) => Number.parseInt(part, 16) / 255)
      .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };
  const contrast = (first, second) => {
    const firstLuminance = luminance(first);
    const secondLuminance = luminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05)
      / (Math.min(firstLuminance, secondLuminance) + 0.05);
  };
  const disabledSurface = tokenValue('--studio-action-disabled-surface');
  const disabledText = tokenValue('--studio-action-disabled-text');
  const primaryDisabledRule = css.match(/\.studio-button-primary:disabled\s*\{([^}]*)\}/)?.[1];

  assert.ok(disabledSurface, 'disabled primary surface token should be an explicit color');
  assert.ok(disabledText, 'disabled primary text token should be an explicit color');
  assert.ok(contrast(disabledSurface, disabledText) >= 4.5, 'disabled primary text should meet 4.5:1 contrast');
  assert.match(primaryDisabledRule || '', /background:\s*var\(--studio-action-disabled-surface\)/);
  assert.match(primaryDisabledRule || '', /border-color:\s*var\(--studio-action-disabled-border\)/);
  assert.match(primaryDisabledRule || '', /color:\s*var\(--studio-action-disabled-text\)/);
  assert.match(primaryDisabledRule || '', /opacity:\s*1/);
  assert.match(shellCss, /\.studio-project-menu-primary:disabled\s*\{[^}]*background:\s*var\(--studio-action-disabled-surface\)[^}]*color:\s*var\(--studio-action-disabled-text\)/s);
  assert.match(estimateDock, /aria-label="Next step"[^>]*variant="primary"/);
});

test('scoped legacy primary buttons override disabled opacity and hover with the neutral pair', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const settingsPanel = await readFile(new URL('../src/components/SettingsPanel.jsx', import.meta.url), 'utf8');
  const materialsPanel = await readFile(new URL('../src/components/MaterialsPanel.jsx', import.meta.url), 'utf8');
  const platformConsole = await readFile(new URL('../src/components/PlatformConsole.jsx', import.meta.url), 'utf8');
  const projectsPanel = await readFile(new URL('../src/components/ProjectsPanel.jsx', import.meta.url), 'utf8');
  const legacyDisabledRule = css.match(
    /\[data-studio-skin='ironwrap'\] :is\(\.btn-primary, \.import-file-btn\.btn-primary\):disabled,\s*\[data-studio-skin='ironwrap'\] :is\(\.btn-primary, \.import-file-btn\.btn-primary\):disabled:hover\s*\{([^}]*)\}/s,
  )?.[1];

  assert.ok(legacyDisabledRule, 'legacy primary disabled and disabled-hover states should share one scoped override');
  assert.match(legacyDisabledRule, /background:\s*var\(--studio-action-disabled-surface\)/);
  assert.match(legacyDisabledRule, /border-color:\s*var\(--studio-action-disabled-border\)/);
  assert.match(legacyDisabledRule, /color:\s*var\(--studio-action-disabled-text\)/);
  assert.match(legacyDisabledRule, /opacity:\s*1/);
  assert.match(settingsPanel, /className="btn-primary"[^>]*disabled=\{busy\}[^>]*>[\s\S]*?Save Settings/);
  assert.match(materialsPanel, /className="btn-primary"[^>]*disabled=\{busy\}[^>]*>Add Profile/);
  assert.match(materialsPanel, /className="btn-primary"[^>]*disabled=\{busy\}[^>]*>Add Color/);
  assert.match(platformConsole, /className="btn-primary"[^>]*disabled=\{busy\}[^>]*>Create user/);
  assert.match(projectsPanel, /className="btn-primary"[^>]*disabled=\{busy \|\| operationBusy \|\| !canSave\}[^>]*>[\s\S]*?Download/);
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

test('authenticated legacy controls are remapped to semantic Studio surfaces and states', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const cssWithoutRootBrandFallback = css.replace(/:root\s*\{[\s\S]*?\n\}/, '');

  assert.match(css, /\[data-studio-skin='ironwrap'\] \.app-nav\s*\{[^}]*background:\s*var\(--studio-surface-frame\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] \.app-nav-tab\.active\s*\{[^}]*background:\s*var\(--studio-action\)[^}]*color:\s*var\(--studio-action-text\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] :is\(\.control-select, \.service-qty, \.adjust-number\)\s*\{[^}]*background:\s*var\(--studio-surface-control\)[^}]*border-color:\s*var\(--studio-border\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] :is\(\.control-block, \.settings-panel, \.platform-card\)\s*\{[^}]*background:\s*var\(--studio-surface-panel\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] :is\(input\[type='checkbox'\], input\[type='radio'\], input\[type='range'\]\)\s*\{[^}]*accent-color:\s*var\(--studio-action\)/s);

  for (const legacyAccent of [
    '#2563eb',
    '#a855f7',
    '#0d9488',
    '#e8541a',
    '#c2410c',
    '#fff4ee',
    '#eef2ff',
    '#c7d2fe',
    '#1e3a8a',
    '#faf5ff',
    '#e9d5ff',
    '#6b21a8',
  ]) {
    assert.doesNotMatch(cssWithoutRootBrandFallback, new RegExp(legacyAccent, 'i'));
  }
});

test('active navigation, Library tabs, and project rows keep semantic red hover states', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(css, /\[data-studio-skin='ironwrap'\] \.app-nav-tab\.active:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--studio-action-hover\)[^}]*border-color:\s*var\(--studio-action-hover\)[^}]*color:\s*var\(--studio-action-text\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] \.library-tabs button\.active:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--studio-action-subtle\)[^}]*border-bottom-color:\s*var\(--studio-action\)[^}]*color:\s*var\(--studio-critical\)/s);
  assert.match(css, /\[data-studio-skin='ironwrap'\] \.project-open-btn-active:hover:not\(:disabled\)\s*\{[^}]*background:\s*var\(--studio-action-subtle\)[^}]*border-color:\s*var\(--studio-action\)[^}]*color:\s*var\(--studio-critical\)/s);
});

test('every Library button uses scoped semantic chrome instead of browser defaults', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  const library = await readFile(new URL('../src/components/LibraryConsole.jsx', import.meta.url), 'utf8');
  const buttonRule = css.match(/\[data-studio-skin='ironwrap'\] \.library-console button\s*\{([^}]*)\}/)?.[1];
  const hoverRule = css.match(/\[data-studio-skin='ironwrap'\] \.library-console button:hover:not\(:disabled\)\s*\{([^}]*)\}/)?.[1];
  const disabledRule = css.match(/\[data-studio-skin='ironwrap'\] \.library-console button:disabled\s*\{([^}]*)\}/)?.[1];

  assert.match(library, /<section className="library-console platform-card">/);
  assert.match(library, /Refresh Library/);
  assert.match(library, /Create record/);
  assert.match(library, /Create relationship/);
  assert.match(library, /Download JSON/);
  assert.match(library, /Commit approved import/);
  assert.match(library, /Run migration/);
  assert.match(buttonRule || '', /appearance:\s*none/);
  assert.match(buttonRule || '', /background:\s*var\(--studio-surface-control\)/);
  assert.match(buttonRule || '', /border:\s*var\(--studio-border-width\) solid var\(--studio-border\)/);
  assert.match(buttonRule || '', /border-radius:\s*var\(--studio-radius-control\)/);
  assert.match(buttonRule || '', /color:\s*var\(--studio-text\)/);
  assert.match(buttonRule || '', /font-weight:\s*var\(--studio-font-weight-control\)/);
  assert.match(hoverRule || '', /background:\s*var\(--studio-surface-panel-muted\)/);
  assert.match(hoverRule || '', /border-color:\s*var\(--studio-border-strong\)/);
  assert.match(disabledRule || '', /background:\s*var\(--studio-surface-panel-muted\)/);
  assert.match(disabledRule || '', /color:\s*var\(--studio-text-muted\)/);
  assert.match(disabledRule || '', /cursor:\s*not-allowed/);
});
