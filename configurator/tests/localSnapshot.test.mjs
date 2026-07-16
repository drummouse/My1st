import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('local development prepares the Share Design template before Vite starts', async () => {
  const pkg = await readJson('../package.json');

  assert.equal(
    pkg.scripts['prepare:snapshot:local'],
    'vite build --config vite.artifact.config.js && node scripts/build-snapshot-template.mjs .local/snapshot-template.html'
  );
  assert.match(pkg.scripts.dev, /^npm run prepare:snapshot:local && vite$/);
});

test('Vercel Dev uses the package development command', async () => {
  const vercel = await readJson('../vercel.json');
  assert.equal(vercel.devCommand, 'npm run dev -- --port $PORT');
});

test('snapshot generator accepts an output path and Vite serves ignored local output', async () => {
  const generator = await readText('../scripts/build-snapshot-template.mjs');
  const gitignore = await readText('../.gitignore');
  const viteConfig = await readText('../vite.config.js');

  assert.match(generator, /process\.argv\[2\]/);
  assert.match(gitignore, /^\.local$/m);
  assert.match(viteConfig, /localSnapshotTemplate/);
  assert.match(viteConfig, /\.local\/snapshot-template\.html/);
});
