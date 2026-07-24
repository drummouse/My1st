import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCompleteness, CAPTURE_TYPES, normalizeMaterialZoneState } from '../api/_lib/capturePolicy.js';

const scanUrl = new URL('../src/components/CaptureTextureScan.jsx', import.meta.url);
const panelUrl = new URL('../src/components/CapturePanel.jsx', import.meta.url);

const mainPhoto = () => [{ id: 'a1', purpose: 'main', classification: 'source' }];
const calibrationField = () => ({
  fieldKey: 'calibration',
  value: { schemaVersion: 1, units: 'mm', knownMeasurement: { feature: 'overall width', value: 450, unit: 'mm' }, rulerConfirmed: true },
});
const confirmedZone = () => normalizeMaterialZoneState({ mainVisibleFaceConfirmed: true });

test('texture is a registered capture type', () => {
  assert.ok(CAPTURE_TYPES.includes('texture'));
});

test('texture completeness requires title, source photo, calibration, material zone, and direction — not category/dimensions', () => {
  const session = { captureType: 'texture', title: '', category: null };
  const empty = validateCompleteness({ session, fields: [], assets: [], measurements: [] });
  const codes = empty.errors.map((e) => e.code);
  assert.ok(codes.includes('TITLE_REQUIRED'));
  assert.ok(codes.includes('MAIN_PHOTO_REQUIRED'));
  assert.ok(codes.includes('CALIBRATION_REQUIRED'));
  assert.ok(codes.includes('MATERIAL_ZONE_REQUIRED'));
  assert.ok(codes.includes('TEXTURE_DIRECTION_REQUIRED'));
  assert.ok(!codes.includes('CATEGORY_REQUIRED'), 'flexible classification: no hard category requirement');
  assert.ok(!codes.includes('DIMENSIONS_REQUIRED'), 'a texture sample has no product dimensions to require');

  const complete = validateCompleteness({
    session: {
      ...session, title: 'Woodgrain texture', materialZoneState: confirmedZone(), textureDirection: 'along_run',
    },
    fields: [calibrationField()],
    assets: mainPhoto(),
    measurements: [],
  });
  assert.deepEqual(complete.errors, []);
});

test('texture completeness reads materialZoneState/textureDirection from either camelCase or snake_case session shape', () => {
  const session = {
    captureType: 'texture', title: 'Sample', material_zone_state: confirmedZone(), texture_direction: 'across_coverage',
  };
  const result = validateCompleteness({ session, fields: [calibrationField()], assets: mainPhoto(), measurements: [] });
  assert.ok(!result.errors.some((e) => e.code === 'MATERIAL_ZONE_REQUIRED'));
  assert.ok(!result.errors.some((e) => e.code === 'TEXTURE_DIRECTION_REQUIRED'));
});

test('CaptureTextureScan reuses the shared calibration/material-zone/texture-direction/preview modules verbatim (D-021)', async () => {
  const scan = await readFile(scanUrl, 'utf8');
  assert.match(scan, /from '\.\.\/\.\.\/api\/_lib\/capturePolicy\.js'/);
  assert.match(scan, /captureApi\.saveCalibration/);
  assert.match(scan, /captureApi\.saveMaterialZone/);
  assert.match(scan, /captureApi\.saveTextureDirection/);
  assert.match(scan, /captureApi\.evaluateStudioValidation/);
  assert.match(scan, /from '\.\/CaptureFlatWallPreview\.jsx'/);
});

test('CaptureTextureScan disables editing and gates submit on completeness', async () => {
  const scan = await readFile(scanUrl, 'utf8');
  assert.match(scan, /session\.status === 'draft' \|\| session\.status === 'changes_requested'/);
  assert.match(scan, /disabled=\{busy \|\| completeness\.errors\.length > 0\}/);
});

test('CapturePanel routes texture sessions to CaptureTextureScan and offers it in the type chooser', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  assert.match(panel, /import CaptureTextureScan from '\.\/CaptureTextureScan\.jsx'/);
  assert.match(panel, /open\.session\.captureType === 'texture'/);
  assert.match(panel, /\{ id: 'texture', label: 'Texture scan' \}/);
});
