import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// V1 Slice 2 — "not SimCity" realism fix. A tenant color that carries an
// uploaded surface photo must render as a real material map, not a flat hex
// block. These source-contract tests lock the wiring end to end: the upload
// route accepts the swatch, the admin form uploads it, and the client mapping
// turns the stored URL into the 3D render-map that setMeshColor consumes.

const read = (rel) => readFile(new URL(rel, import.meta.url), 'utf8');

test('upload route defines a swatch kind limited to image types', async () => {
  const upload = await read('../api/upload.js');
  assert.match(upload, /swatch:\s*\{/, 'upload.js must define a `swatch` upload kind');
  // The swatch block must constrain to raster image content types.
  const block = upload.slice(upload.indexOf('swatch:'));
  assert.match(block, /allowedContentTypes:\s*\[[^\]]*'image\/jpeg'[^\]]*\]/);
  assert.match(block, /maximumSizeInBytes:\s*\d+\s*\*\s*1024\s*\*\s*1024/);
});

test('toColorEntry maps a stored swatch URL to the 3D texture (render-map)', async () => {
  const app = await read('../src/App.jsx');
  const start = app.indexOf('function toColorEntry');
  assert.ok(start >= 0, 'App.jsx must define toColorEntry');
  const fn = app.slice(start, start + 400);
  // The uploaded swatch (thumbnail_url) must feed BOTH the picker thumbnail
  // and the scene texture, so setMeshColor sets material.map.
  assert.match(fn, /thumbnail_url/);
  assert.match(fn, /thumbnail:\s*swatch/);
  assert.match(fn, /texture:\s*swatch/);
});

test('setMeshColor applies the texture as material.map when present', async () => {
  const scene = await read('../src/lib/buildScene.js');
  assert.match(scene, /if\s*\(colorEntry\.texture\)/);
  assert.match(scene, /material\.map\s*=\s*loadTexture\(colorEntry\.texture\)/);
});

test('Add-a-color form uploads a surface swatch via the swatch kind', async () => {
  const panel = await read('../src/components/MaterialsPanel.jsx');
  assert.match(panel, /import \{ upload \} from '@vercel\/blob\/client'/);
  assert.match(panel, /blankColorForm = \(\) => \(\{[^}]*thumbnailUrl: ''/);
  assert.match(panel, /kind: 'swatch'/);
  assert.match(panel, /handleUploadUrl: '\/api\/upload'/);
  // The uploaded URL is stored on the form so handleAddColor's `...colorForm`
  // spread sends it to the colors API as thumbnailUrl.
  assert.match(panel, /setColorForm\(\(f\) => \(\{ \.\.\.f, thumbnailUrl: blob\.url \}\)\)/);
});
