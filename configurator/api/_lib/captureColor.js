import { CaptureValidationError } from './capturePolicy.js';

// Color & Finish scan (first vertical slice, mirroring Slice R1's
// precedent): a sampled RGB value plus its deterministically-derived HEX/LAB
// values, a finish classification, and optional manufacturer identity. Pure
// module shared verbatim by client and server (D-021), same pattern as
// captureEvidence.js — the color a contributor sees on their phone is
// exactly the color the submit gate validates. No color-calibration-board
// detection exists yet (deferred CV, mirrors the Profile Geometry scan's
// honest "deterministic, not CV" framing): every sample is 'visual-grade'
// confidence until a real reference card is read, per the confidence-grade
// ladder in the material-package spec (visual-grade -> estimating-grade ->
// fabrication-grade).
export const COLOR_SCHEMA_VERSION = 1;
export const FINISH_TYPES = Object.freeze(['matte', 'satin', 'gloss', 'semi_gloss', 'metallic', 'textured']);
export const CONFIDENCE_GRADES = Object.freeze(['visual-grade', 'estimating-grade', 'fabrication-grade']);
export const MANUFACTURER_TEXT_MAX = 120;

function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// #RRGGBB, uppercase — the same shape the existing manual color picker
// (CapturePanel's guided_product `color.hex` field) already stores.
export function rgbToHex({ r, g, b }) {
  const byte = (n) => clamp255(n).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`.toUpperCase();
}

function srgbChannelToLinear(channel) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

// Standard sRGB -> CIE XYZ (D65) -> CIE L*a*b* conversion. Deterministic,
// no external dependency — this is well-defined math, not a CV estimate;
// "visual-grade" refers to the *sample itself* (a phone photo, no
// calibration reference), not to this conversion's accuracy.
export function rgbToLab({ r, g, b }) {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);
  const x = (rl * 0.4124 + gl * 0.3576 + bl * 0.1805) / 0.95047;
  const y = (rl * 0.2126 + gl * 0.7152 + bl * 0.0722) / 1.0;
  const z = (rl * 0.0193 + gl * 0.1192 + bl * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    l: round2(116 * fy - 16),
    a: round2(500 * (fx - fy)),
    b: round2(200 * (fy - fz)),
  };
}

function isByte(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 255;
}

const cleanText = (value, max) => {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
};

// Builds the full 'color' capture_fields value from a raw sample: the
// contributor supplies the sampled rgb + finish + optional manufacturer
// identity; hex/lab/confidenceGrade/schemaVersion are always derived here,
// never accepted as client input, so they can never disagree with the
// server's own re-validation of the same object.
export function normalizeColorSample(input = {}) {
  const rgb = input.rgb || {};
  if (!isByte(rgb.r) || !isByte(rgb.g) || !isByte(rgb.b)) {
    throw new CaptureValidationError('CAPTURE_COLOR_INVALID', 'A sampled RGB color (0-255 per channel) is required');
  }
  const normalizedRgb = { r: Number(rgb.r), g: Number(rgb.g), b: Number(rgb.b) };
  const finish = String(input.finish ?? '').trim().toLowerCase();
  if (!FINISH_TYPES.includes(finish)) {
    throw new CaptureValidationError('CAPTURE_COLOR_INVALID', `finish must be one of: ${FINISH_TYPES.join(', ')}`);
  }
  return {
    schemaVersion: COLOR_SCHEMA_VERSION,
    rgb: normalizedRgb,
    hex: rgbToHex(normalizedRgb),
    lab: rgbToLab(normalizedRgb),
    finish,
    manufacturerName: cleanText(input.manufacturerName, MANUFACTURER_TEXT_MAX),
    manufacturerCode: cleanText(input.manufacturerCode, MANUFACTURER_TEXT_MAX),
    confidenceGrade: 'visual-grade',
    sampledAt: new Date().toISOString(),
  };
}
