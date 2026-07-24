import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateSharpness,
  estimateExposure,
  estimateFrameVariance,
  averageHash,
  hammingDistance,
  evaluateAcceptedPhotoQuality,
  DETERMINISTIC_QUALITY_PIPELINE_VERSION,
} from '../src/lib/captureImageQuality.js';

function makePixels(width, height, pixelFn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixelFn(x, y);
      const idx = ((y * width) + x) * 4;
      data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

const uniformGray = () => makePixels(16, 16, () => [128, 128, 128]);
const checkerboard = () => makePixels(16, 16, (x, y) => (((x + y) % 2 === 0) ? [255, 255, 255] : [0, 0, 0]));
const allWhite = () => makePixels(16, 16, () => [255, 255, 255]);
const allBlack = () => makePixels(16, 16, () => [0, 0, 0]);
const verticalSplit = () => makePixels(16, 16, (x) => (x < 8 ? [255, 255, 255] : [0, 0, 0]));
const horizontalSplit = () => makePixels(16, 16, (_x, y) => (y < 8 ? [255, 255, 255] : [0, 0, 0]));

test('sharpness estimate is higher for a high-contrast image than a flat one', () => {
  const flat = estimateSharpness(uniformGray());
  const sharp = estimateSharpness(checkerboard());
  assert.equal(flat.variance, 0, 'a perfectly uniform image has zero local contrast');
  assert.ok(sharp.variance > flat.variance, 'checkerboard edges must read sharper than a flat field');
  assert.ok(flat.sampleCount > 0 && sharp.sampleCount > 0);
});

test('exposure estimate flags clipping at the extremes and not in the middle', () => {
  const mid = estimateExposure(uniformGray());
  assert.equal(mid.blackClipFraction, 0);
  assert.equal(mid.whiteClipFraction, 0);
  assert.ok(mid.meanLuminance > 100 && mid.meanLuminance < 156);

  const white = estimateExposure(allWhite());
  assert.equal(white.whiteClipFraction, 1);
  assert.equal(white.blackClipFraction, 0);

  const black = estimateExposure(allBlack());
  assert.equal(black.blackClipFraction, 1);
  assert.equal(black.whiteClipFraction, 0);
});

test('frame variance is near zero for a blank/uniform frame and high for a busy one', () => {
  assert.equal(estimateFrameVariance(uniformGray()), 0);
  assert.ok(estimateFrameVariance(checkerboard()) > 1000);
});

test('average hash: identical images hash identically; very different images differ substantially', () => {
  const hashA1 = averageHash(verticalSplit());
  const hashA2 = averageHash(verticalSplit());
  assert.equal(hammingDistance(hashA1, hashA2), 0, 'the same image must hash identically');

  const hashB = averageHash(horizontalSplit());
  const distance = hammingDistance(hashA1, hashB);
  assert.ok(distance > 20, `expected a large Hamming distance between distinct patterns, got ${distance}`);
});

test('hammingDistance is Infinity for mismatched or missing hashes (never a false "duplicate")', () => {
  assert.equal(hammingDistance(null, [1, 0]), Infinity);
  assert.equal(hammingDistance([1, 0, 1], [1, 0]), Infinity);
});

test('evaluateAcceptedPhotoQuality: a blank/flat photo is flagged for both sharpness and framing', () => {
  const result = evaluateAcceptedPhotoQuality(uniformGray());
  assert.equal(result.pipelineVersion, DETERMINISTIC_QUALITY_PIPELINE_VERSION);
  const types = result.findings.map((f) => f.type);
  assert.ok(types.includes('sharpness_estimate'));
  assert.ok(types.includes('crop_or_visibility_sanity'));
  assert.ok(!types.includes('glare_or_overexposure_indication'));
});

test('evaluateAcceptedPhotoQuality: an overexposed photo is flagged for glare, a sharp busy one is not flagged for sharpness', () => {
  const overexposed = evaluateAcceptedPhotoQuality(allWhite());
  assert.ok(overexposed.findings.some((f) => f.type === 'glare_or_overexposure_indication'));

  const busy = evaluateAcceptedPhotoQuality(checkerboard());
  assert.ok(!busy.findings.some((f) => f.type === 'sharpness_estimate'));
});

test('evaluateAcceptedPhotoQuality: flags a near-duplicate against prior accepted photos in the session', () => {
  const first = evaluateAcceptedPhotoQuality(verticalSplit());
  const second = evaluateAcceptedPhotoQuality(verticalSplit(), { priorHashes: [{ hash: first.hash }] });
  assert.ok(second.findings.some((f) => f.type === 'possible_duplicate_indication'));

  const distinct = evaluateAcceptedPhotoQuality(horizontalSplit(), { priorHashes: [{ hash: first.hash }] });
  assert.ok(!distinct.findings.some((f) => f.type === 'possible_duplicate_indication'));
});
