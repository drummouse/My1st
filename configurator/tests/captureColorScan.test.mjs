import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCompleteness, CAPTURE_TYPES } from '../api/_lib/capturePolicy.js';
import { normalizeColorSample } from '../api/_lib/captureColor.js';

const scanUrl = new URL('../src/components/CaptureColorScan.jsx', import.meta.url);
const panelUrl = new URL('../src/components/CapturePanel.jsx', import.meta.url);

const mainPhoto = () => [{ id: 'a1', purpose: 'main', classification: 'source' }];
const colorField = (overrides = {}) => ({
  fieldKey: 'color',
  value: normalizeColorSample({ rgb: { r: 51, g: 51, b: 51 }, finish: 'matte', ...overrides }),
});

test('color_finish is a registered capture type', () => {
  assert.ok(CAPTURE_TYPES.includes('color_finish'));
});

test('color_finish completeness requires a title, a source photo, and a sampled color+finish — not category/dimensions', () => {
  const session = { captureType: 'color_finish', title: '', category: null };
  const empty = validateCompleteness({ session, fields: [], assets: [], measurements: [] });
  const codes = empty.errors.map((e) => e.code);
  assert.ok(codes.includes('TITLE_REQUIRED'));
  assert.ok(codes.includes('MAIN_PHOTO_REQUIRED'));
  assert.ok(codes.includes('COLOR_SAMPLE_REQUIRED'));
  assert.ok(!codes.includes('CATEGORY_REQUIRED'), 'flexible classification: no hard category requirement');
  assert.ok(!codes.includes('DIMENSIONS_REQUIRED'), 'a color sample has no dimensions to require');

  const complete = validateCompleteness({
    session: { ...session, title: 'Driftwood sample' },
    fields: [colorField()],
    assets: mainPhoto(),
    measurements: [],
  });
  assert.deepEqual(complete.errors, []);
});

test('color_finish warns (does not block) on a missing manufacturer identity', () => {
  const session = { captureType: 'color_finish', title: 'Sample' };
  const result = validateCompleteness({ session, fields: [colorField()], assets: mainPhoto(), measurements: [] });
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.some((w) => w.code === 'COLOR_IDENTITY_MISSING'));

  const withIdentity = validateCompleteness({
    session,
    fields: [colorField({ manufacturerCode: 'RAL 7024' })],
    assets: mainPhoto(),
    measurements: [],
  });
  assert.ok(!withIdentity.warnings.some((w) => w.code === 'COLOR_IDENTITY_MISSING'));
});

test('CaptureColorScan imports the shared color/policy modules verbatim (D-021)', async () => {
  const scan = await readFile(scanUrl, 'utf8');
  assert.match(scan, /from '\.\.\/\.\.\/api\/_lib\/captureColor\.js'/);
  assert.match(scan, /from '\.\.\/\.\.\/api\/_lib\/capturePolicy\.js'/);
});

test('CaptureColorScan samples rgb client-side via canvas and derives the rest through normalizeColorSample', async () => {
  const scan = await readFile(scanUrl, 'utf8');
  assert.match(scan, /getImageData\(x, y, 1, 1\)/);
  assert.match(scan, /normalizeColorSample\(\{ rgb, finish, manufacturerName, manufacturerCode \}\)/);
});

test('CaptureColorScan disables editing and hides submit once the session is no longer editable', async () => {
  const scan = await readFile(scanUrl, 'utf8');
  assert.match(scan, /session\.status === 'draft' \|\| session\.status === 'changes_requested'/);
  assert.match(scan, /disabled=\{busy \|\| completeness\.errors\.length > 0\}/);
});

test('CapturePanel routes color_finish sessions to CaptureColorScan and offers it in the type chooser', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  assert.match(panel, /import CaptureColorScan from '\.\/CaptureColorScan\.jsx'/);
  assert.match(panel, /open\.session\.captureType === 'color_finish'/);
  assert.match(panel, /\{ id: 'color_finish', label: 'Color & Finish scan' \}/);
});

test('color chip/picker CSS used by the component is actually defined', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  for (const cls of ['.capture-color-sample-photo', '.capture-color-sample-result', '.capture-color-swatch']) {
    assert.ok(css.includes(cls), `missing CSS rule: ${cls}`);
  }
});
