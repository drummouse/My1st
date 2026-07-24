import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('production keeps generated PWA output while avoiding Workbox Terser worker deadlock', async () => {
  const [config, worker] = await Promise.all([
    readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/sw.js', import.meta.url), 'utf8'),
  ]);

  assert.match(config, /strategies:\s*'injectManifest'/);
  assert.match(config, /injectManifest:\s*\{[\s\S]*?minify:\s*'esbuild'/);
  assert.doesNotMatch(config, /disable:\s*true/);
  assert.match(worker, /precacheAndRoute\(self\.__WB_MANIFEST\)/);
  assert.match(worker, /cleanupOutdatedCaches\(\)/);
  assert.match(worker, /clientsClaim\(\)/);
});
