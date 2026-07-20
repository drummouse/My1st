// R2.5 — honest flat-wall technical compatibility preview. Pure,
// deterministic evaluation of whether a session has the minimum material-
// readiness inputs (confirmed dimensions, main_visible_face zone, texture
// direction) for a schematic scale/orientation/zone/direction proof — NOT
// a claim of reconstructed geometry, real mapping validation, or Studio-
// ready output. The actual on-screen preview is a client-side Three.js
// test object built from these same confirmed values; this module only
// decides whether that preview is ready to show and what's missing if not.
//
// Per the R2 authorization's binding corrections: this must never be
// represented as reconstructed profile geometry, fabrication-grade output,
// or a Studio-ready GLB. capturePublish.js's Studio DTO `geometryUrl`
// field is never populated from any of this.

export const STUDIO_VALIDATION_SCHEMA_VERSION = 1;

export const FLAT_WALL_PREVIEW_LABEL = 'Technical compatibility preview — a schematic proof of scale, orientation, material zone, and texture direction. Not reconstructed geometry. Not fabrication grade.';

export function evaluateFlatWallValidation({ measurements = [], materialZoneState = null, textureDirection = null }) {
  const issues = [];
  const width = measurements.find((m) => (m.axis ?? null) === 'width');
  const height = measurements.find((m) => (m.axis ?? null) === 'height' || (m.axis ?? null) === 'depth');
  if (!width || !height) {
    issues.push({ code: 'DIMENSIONS_MISSING', message: 'A confirmed width and height/depth measurement are required.' });
  }
  if (!materialZoneState || materialZoneState.zones?.[0]?.confirmed !== true) {
    issues.push({ code: 'MATERIAL_ZONE_MISSING', message: 'Confirm the main visible face material zone.' });
  }
  if (!textureDirection) {
    issues.push({ code: 'TEXTURE_DIRECTION_MISSING', message: 'Select a texture direction.' });
  }

  return {
    schemaVersion: STUDIO_VALIDATION_SCHEMA_VERSION,
    status: issues.length === 0 ? 'ready' : 'needs_attention',
    issues,
    label: FLAT_WALL_PREVIEW_LABEL,
    scene: 'flat_wall',
    evaluatedAt: new Date().toISOString(),
  };
}
