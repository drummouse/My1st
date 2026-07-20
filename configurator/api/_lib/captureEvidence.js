import {
  PROFILE_INITIAL_VIEWS,
  PROFILE_ADAPTIVE_VIEW,
} from './capturePolicy.js';

// Adaptive-shot decision model for Profile Geometry scans (Slice R1).
// Pure module shared by client and server (same pattern as
// validateCompleteness, D-021): the guidance the user sees is the guidance
// the submit gate enforces.
//
// R1 is deliberately deterministic — a checklist evidence ledger, not
// computer vision: calibration gate first, then the guided initial views,
// then exactly one adaptive follow-up ('back') once the initial set exists.
// Later CV passes (blur/glare/marker detection, coverage analysis) plug in
// as additional evidence sources without changing the shot-request
// contract below.

// Every shot request carries the full prompt contract from the UX spec §9:
// position, angle, distance, orientation, required feature, ruler
// visibility, and why the image is needed.
export const SHOT_GUIDES = Object.freeze({
  left_end: {
    view: 'left_end',
    title: 'Left end, straight on',
    position: 'Stand at the left end of the sample',
    angle: 'Camera level, pointing straight along the profile axis',
    distance: '30–50 cm from the end',
    orientation: 'Sample resting on the calibration board, cross-section facing you',
    requiredFeature: 'The full cross-section outline, every bend visible',
    rulerVisible: true,
    reason: 'The end-on view defines the cross-section geometry.',
  },
  right_end: {
    view: 'right_end',
    title: 'Right end, straight on',
    position: 'Stand at the right end of the sample',
    angle: 'Camera level, pointing straight along the profile axis',
    distance: '30–50 cm from the end',
    orientation: 'Sample unchanged on the board',
    requiredFeature: 'The full cross-section outline from the opposite end',
    rulerVisible: true,
    reason: 'Both ends are compared to confirm the section is consistent.',
  },
  front: {
    view: 'front',
    title: 'Front face',
    position: 'Stand in front of the long face',
    angle: 'Camera level, square to the face',
    distance: 'Far enough that the whole sample fits the frame',
    orientation: 'Long axis horizontal in the frame',
    requiredFeature: 'The full length of the visible face, ribs and seams',
    rulerVisible: true,
    reason: 'The front view ties the cross-section to the run direction.',
  },
  iso_front_left: {
    view: 'iso_front_left',
    title: 'Front-left isometric',
    position: 'Move to the front-left corner',
    angle: 'About 45° around and slightly above the sample',
    distance: 'Whole sample visible with some board around it',
    orientation: 'Sample unchanged on the board',
    requiredFeature: 'Face and left end visible together',
    rulerVisible: false,
    reason: 'An angled view gives depth cues the straight views cannot.',
  },
  back: {
    view: 'back',
    title: 'Back of the profile',
    position: 'Move behind the sample, or rotate it 180° on the board',
    angle: 'Camera level, square to the back face',
    distance: '30–50 cm, whole back visible',
    orientation: 'If rotated, keep it flat on the calibration board',
    requiredFeature: 'Back face, locks, hems, and any hidden bends',
    rulerVisible: false,
    reason: 'Back geometry (locks/hems) is invisible in every front view.',
  },
});

// A superseded (replaced) source asset no longer counts as satisfying its
// view — only the current, non-superseded accepted photo does (R2.2).
const hasView = (assets, view) => assets.some((a) => a.purpose === view
  && (a.classification || 'source') === 'source'
  && !(a.supersededBy ?? a.superseded_by));

const calibrationComplete = (fields) => {
  const calibration = fields.find((f) => (f.fieldKey ?? f.field_key) === 'calibration')?.value;
  return Boolean(calibration
    && calibration.rulerConfirmed === true
    && Number(calibration.knownMeasurement?.value) > 0);
};

// Evidence evaluation for one profile_geometry session. Returns:
//   phase: 'calibration' | 'initial_views' | 'adaptive' | 'complete'
//   complete: boolean
//   shotRequests: ordered SHOT_GUIDES entries still needed (empty when none)
//   needsCalibration: boolean
//   confidence: 0..1 deterministic evidence score
export function evaluateProfileEvidence({ fields = [], assets = [], measurements = [] }) {
  const calibrated = calibrationComplete(fields);
  const missingInitial = PROFILE_INITIAL_VIEWS.filter((view) => !hasView(assets, view));
  const needsAdaptive = missingInitial.length === 0 && !hasView(assets, PROFILE_ADAPTIVE_VIEW);

  let phase = 'complete';
  let shotRequests = [];
  if (!calibrated) {
    phase = 'calibration';
  } else if (missingInitial.length) {
    phase = 'initial_views';
    shotRequests = missingInitial.map((view) => SHOT_GUIDES[view]);
  } else if (needsAdaptive) {
    phase = 'adaptive';
    shotRequests = [SHOT_GUIDES[PROFILE_ADAPTIVE_VIEW]];
  }

  const complete = phase === 'complete';
  // Deterministic evidence score: calibration 0.3, each of the five views
  // 0.1, confirmed measurements up to 0.2.
  const viewsPresent = [...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW]
    .filter((view) => hasView(assets, view)).length;
  const confirmedMeasurements = measurements.filter((m) => m.confirmedAt ?? m.confirmed_at).length;
  const confidence = Math.min(1, Number((
    (calibrated ? 0.3 : 0)
    + viewsPresent * 0.1
    + Math.min(confirmedMeasurements, 2) * 0.1
  ).toFixed(2)));

  return { phase, complete, shotRequests, needsCalibration: !calibrated, confidence };
}

// Deterministic measured cross-section preview (Slice R1): a labelled SVG
// built purely from confirmed measurements — an honest schematic (outline
// with real dimensions), not a reconstruction. Returns null until both an
// overall width and a height/depth measurement exist.
export function buildProfilePreviewSvg(measurements = []) {
  const byAxis = (axis) => measurements.find((m) => (m.axis ?? null) === axis);
  const width = byAxis('width');
  const height = byAxis('height') || byAxis('depth');
  if (!width || !height) return null;
  const ratio = Number(height.value) / Number(width.value);
  const w = 360;
  const h = Math.max(24, Math.min(300, Math.round(w * ratio)));
  const label = (m) => `${m.value} ${m.unit}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w + 80} ${h + 60}" role="img" aria-label="Measured profile cross-section schematic">`,
    `<rect x="40" y="20" width="${w}" height="${h}" fill="none" stroke="#1c1f24" stroke-width="2"/>`,
    `<line x1="40" y1="${h + 40}" x2="${w + 40}" y2="${h + 40}" stroke="#E8541A" stroke-width="1.5"/>`,
    `<text x="${40 + w / 2}" y="${h + 56}" text-anchor="middle" font-size="14" fill="#1c1f24">${label(width)}</text>`,
    `<line x1="${w + 56}" y1="20" x2="${w + 56}" y2="${h + 20}" stroke="#E8541A" stroke-width="1.5"/>`,
    `<text x="${w + 64}" y="${20 + h / 2}" font-size="14" fill="#1c1f24">${label(height)}</text>`,
    '</svg>',
  ].join('');
}
