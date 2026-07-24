// Dependency-free, browser-native deterministic quality/similarity checks
// for an accepted capture photo. Operates on plain {width, height, data}
// pixel buffers — the same shape a browser hands back from
// CanvasRenderingContext2D#getImageData — so the math here is unit-testable
// in Node without a real canvas. The canvas-touching code that reads a File
// into this shape belongs in captureUpload.js, matching the existing
// makeThumbnail/imageDimensions split there (canvas glue untested, pure
// math tested).
//
// These are deliberately narrow, honest checks (R2 authorization §18): a
// sharpness ESTIMATE, an exposure/clipping ESTIMATE, a basic glare/
// overexposure INDICATION, a crop/visibility sanity check, and a perceptual
// duplicate INDICATION. This module does not implement and must not be
// described as implementing: fiducial detection, ruler detection,
// perspective correction, segmentation, precise overlap, scale derivation,
// or geometry reconstruction.

function toGrayscale({ width, height, data }) {
  const gray = new Float64Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

// Laplacian-variance sharpness estimate: a sharp, in-focus image has high
// local contrast (high variance of the Laplacian); a blurred one is smooth
// (low variance). Reported as a relative score, not an absolute/calibrated
// measurement.
export function estimateSharpness({ width, height, data }) {
  const gray = toGrayscale({ width, height, data });
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      const laplacian = (4 * gray[idx]) - gray[idx - 1] - gray[idx + 1] - gray[idx - width] - gray[idx + width];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count += 1;
    }
  }
  if (count === 0) return { variance: 0, sampleCount: 0 };
  const mean = sum / count;
  return { variance: Math.max(0, (sumSq / count) - (mean * mean)), sampleCount: count };
}

// Exposure/clipping estimate: mean luminance plus the fraction of pixels
// clipped near black or near white. A high clip fraction is an indication
// of lost detail (under/overexposure or glare), not a proven finding.
export function estimateExposure({ width, height, data }) {
  const gray = toGrayscale({ width, height, data });
  let sum = 0;
  let blackClipped = 0;
  let whiteClipped = 0;
  for (let i = 0; i < gray.length; i += 1) {
    sum += gray[i];
    if (gray[i] <= 8) blackClipped += 1;
    else if (gray[i] >= 247) whiteClipped += 1;
  }
  const count = gray.length || 1;
  return {
    meanLuminance: sum / count,
    blackClipFraction: blackClipped / count,
    whiteClipFraction: whiteClipped / count,
  };
}

// Crop/sample-visibility sanity check: an almost-uniform frame (very low
// overall pixel variance) usually means the sample isn't actually framed
// (lens cap, blank wall, extreme close-up on a plain surface) — a coarse
// sanity check, not segmentation or sample detection.
export function estimateFrameVariance({ width, height, data }) {
  const gray = toGrayscale({ width, height, data });
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) sum += gray[i];
  const count = gray.length || 1;
  const mean = sum / count;
  let sumSq = 0;
  for (let i = 0; i < gray.length; i += 1) sumSq += (gray[i] - mean) ** 2;
  return sumSq / count;
}

// 8x8 average-hash for near-duplicate detection between photos accepted in
// the same session. Two hashes with a small Hamming distance likely show
// very similar framing — an indication of redundant coverage, not proof.
export function averageHash({ width, height, data }, size = 8) {
  const gray = toGrayscale({ width, height, data });
  const cell = new Float64Array(size * size);
  const cellCount = new Int32Array(size * size);
  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(size - 1, Math.floor((y / height) * size));
    for (let x = 0; x < width; x += 1) {
      const cx = Math.min(size - 1, Math.floor((x / width) * size));
      const cellIdx = (cy * size) + cx;
      cell[cellIdx] += gray[(y * width) + x];
      cellCount[cellIdx] += 1;
    }
  }
  const values = Array.from(cell, (v, i) => v / (cellCount[i] || 1));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return values.map((v) => (v >= avg ? 1 : 0));
}

export function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Infinity;
  let distance = 0;
  for (let i = 0; i < hashA.length; i += 1) {
    if (hashA[i] !== hashB[i]) distance += 1;
  }
  return distance;
}

// Thresholds are a conservative heuristic, not a certified measurement —
// every finding below carries an "_estimate"/"_indication" type name so
// nothing here is ever presented as a definite technical result.
const THRESHOLDS = {
  lowSharpnessVariance: 40,
  highClipFraction: 0.35,
  lowFrameVariance: 25,
  nearDuplicateHammingBits: 6,
};

export const DETERMINISTIC_QUALITY_PIPELINE_VERSION = 1;

// Orchestrates the checks above into a findings list for one accepted
// photo, comparing its perceptual hash against previously accepted photos
// in the same session. pipelineVersion is recorded on every result so
// findings stay attributable if these heuristics change later.
export function evaluateAcceptedPhotoQuality(pixels, { priorHashes = [] } = {}) {
  const findings = [];
  const sharpness = estimateSharpness(pixels);
  if (sharpness.sampleCount > 0 && sharpness.variance < THRESHOLDS.lowSharpnessVariance) {
    findings.push({ type: 'sharpness_estimate', severity: 'warning', value: sharpness.variance });
  }
  const exposure = estimateExposure(pixels);
  if (exposure.whiteClipFraction >= THRESHOLDS.highClipFraction) {
    findings.push({ type: 'glare_or_overexposure_indication', severity: 'warning', value: exposure.whiteClipFraction });
  }
  if (exposure.blackClipFraction >= THRESHOLDS.highClipFraction) {
    findings.push({ type: 'underexposure_indication', severity: 'warning', value: exposure.blackClipFraction });
  }
  const frameVariance = estimateFrameVariance(pixels);
  if (frameVariance < THRESHOLDS.lowFrameVariance) {
    findings.push({ type: 'crop_or_visibility_sanity', severity: 'warning', value: frameVariance });
  }
  const hash = averageHash(pixels);
  const nearestPrior = priorHashes
    .map((prior) => hammingDistance(hash, prior.hash))
    .reduce((min, d) => Math.min(min, d), Infinity);
  if (nearestPrior <= THRESHOLDS.nearDuplicateHammingBits) {
    findings.push({ type: 'possible_duplicate_indication', severity: 'info', value: nearestPrior });
  }
  return { pipelineVersion: DETERMINISTIC_QUALITY_PIPELINE_VERSION, hash, findings };
}
