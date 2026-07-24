import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rgbToHex, rgbToLab, normalizeColorSample, FINISH_TYPES, COLOR_SCHEMA_VERSION,
} from '../api/_lib/captureColor.js';

test('rgbToHex produces uppercase #RRGGBB and clamps out-of-range channels', () => {
  assert.equal(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000');
  assert.equal(rgbToHex({ r: 255, g: 255, b: 255 }), '#FFFFFF');
  assert.equal(rgbToHex({ r: 51, g: 51, b: 51 }), '#333333');
  assert.equal(rgbToHex({ r: 300, g: -10, b: 128 }), '#FF0080');
});

test('rgbToLab matches known reference points for black/white/mid-gray', () => {
  const white = rgbToLab({ r: 255, g: 255, b: 255 });
  assert.ok(Math.abs(white.l - 100) < 0.1, `white L should be ~100, got ${white.l}`);
  assert.ok(Math.abs(white.a) < 0.1);
  assert.ok(Math.abs(white.b) < 0.1);

  const black = rgbToLab({ r: 0, g: 0, b: 0 });
  assert.ok(Math.abs(black.l) < 0.1, `black L should be ~0, got ${black.l}`);

  // A neutral gray should stay near-neutral on both chroma axes.
  const gray = rgbToLab({ r: 128, g: 128, b: 128 });
  assert.ok(Math.abs(gray.a) < 0.5);
  assert.ok(Math.abs(gray.b) < 0.5);
  assert.ok(gray.l > 40 && gray.l < 60);
});

test('normalizeColorSample requires a valid rgb byte triple and a known finish', () => {
  assert.throws(() => normalizeColorSample({ rgb: { r: 1, g: 2 }, finish: 'matte' }), { code: 'CAPTURE_COLOR_INVALID' });
  assert.throws(() => normalizeColorSample({ rgb: { r: 1, g: 2, b: 300 }, finish: 'matte' }), { code: 'CAPTURE_COLOR_INVALID' });
  assert.throws(() => normalizeColorSample({ rgb: { r: 1, g: 2, b: 3 }, finish: 'shiny' }), { code: 'CAPTURE_COLOR_INVALID' });
  assert.throws(() => normalizeColorSample({ rgb: { r: 1, g: 2, b: 3 } }), { code: 'CAPTURE_COLOR_INVALID' });
});

test('normalizeColorSample derives hex/lab and always grades visual-grade for now', () => {
  const sample = normalizeColorSample({
    rgb: { r: 51, g: 51, b: 51 }, finish: 'Matte', manufacturerName: '  Charcoal  ', manufacturerCode: 'RAL 7024',
  });
  assert.equal(sample.schemaVersion, COLOR_SCHEMA_VERSION);
  assert.equal(sample.hex, '#333333');
  assert.equal(sample.finish, 'matte');
  assert.equal(sample.manufacturerName, 'Charcoal');
  assert.equal(sample.manufacturerCode, 'RAL 7024');
  assert.equal(sample.confidenceGrade, 'visual-grade');
  assert.ok(sample.sampledAt);
  assert.ok(Number.isFinite(sample.lab.l));

  const minimal = normalizeColorSample({ rgb: { r: 0, g: 0, b: 0 }, finish: 'gloss' });
  assert.equal(minimal.manufacturerName, null);
  assert.equal(minimal.manufacturerCode, null);
});

test('every FINISH_TYPES value round-trips through normalizeColorSample', () => {
  for (const finish of FINISH_TYPES) {
    const sample = normalizeColorSample({ rgb: { r: 10, g: 20, b: 30 }, finish });
    assert.equal(sample.finish, finish);
  }
});
