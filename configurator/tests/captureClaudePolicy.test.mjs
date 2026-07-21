import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClaudeGuidanceRequest,
  validateClaudeGuidanceResponse,
  CaptureClaudePolicyError,
  CLAUDE_GUIDANCE_SCHEMA_VERSION,
  CLAUDE_GUIDANCE_PROMPT_VERSION,
} from '../api/_lib/captureClaudePolicy.js';

const validShotRequest = () => ({
  position: 'Move to the lower-left corner',
  angle: 'About 20° below the sample',
  distance: '20-30 cm',
  orientation: 'Sample unchanged on the board',
  requiredFeature: 'The hem where it meets the calibration board',
  rulerVisible: true,
  reason: 'The hem geometry is unclear from the existing views.',
});

const validResponse = (overrides = {}) => ({
  confidence: 0.7,
  unclearFeatures: [{ feature: 'hem', explanation: 'Not visible in any accepted view.' }],
  redundantAssetIds: [],
  reviewerSummary: 'Coverage looks solid except for the hem detail.',
  shotRequest: validShotRequest(),
  ...overrides,
});

test('buildClaudeGuidanceRequest carries only what Claude needs, never authoritative fields', () => {
  const request = buildClaudeGuidanceRequest({
    session: { id: 'sess-1' },
    acceptedAssets: [
      { id: 'a1', purpose: 'left_end', captureMetadata: { requestedPose: { position: 'x' }, deterministicQuality: { findings: [{ type: 'sharpness_estimate' }] } } },
    ],
    calibration: { units: 'mm', knownMeasurement: { feature: 'overall width', value: 450 } },
    measurementCount: 2,
  });
  assert.equal(request.schemaVersion, CLAUDE_GUIDANCE_SCHEMA_VERSION);
  assert.equal(request.promptVersion, CLAUDE_GUIDANCE_PROMPT_VERSION);
  assert.equal(request.sessionId, 'sess-1');
  assert.equal(request.calibration.units, 'mm');
  assert.equal(request.calibration.knownFeature, 'overall width');
  assert.equal(request.calibration.value, undefined, 'the known VALUE is never sent — only the feature name');
  assert.equal(request.acceptedAssets[0].assetId, 'a1');
  assert.deepEqual(request.acceptedAssets[0].deterministicFindings, [{ type: 'sharpness_estimate' }]);
  assert.equal(request.measurementCount, 2);
});

test('a well-formed response validates and normalizes cleanly', () => {
  const result = validateClaudeGuidanceResponse(validResponse());
  assert.equal(result.confidence, 0.7);
  assert.equal(result.unclearFeatures.length, 1);
  assert.deepEqual(result.shotRequest, validShotRequest());
});

test('rejects a non-object response', () => {
  assert.throws(() => validateClaudeGuidanceResponse(null), { code: 'CLAUDE_RESPONSE_INVALID' });
  assert.throws(() => validateClaudeGuidanceResponse('a string'), { code: 'CLAUDE_RESPONSE_INVALID' });
  assert.throws(() => validateClaudeGuidanceResponse([1, 2]), { code: 'CLAUDE_RESPONSE_INVALID' });
});

test('rejects unsupported top-level keys', () => {
  assert.throws(
    () => validateClaudeGuidanceResponse(validResponse({ extraField: 'anything' })),
    { code: 'CLAUDE_RESPONSE_UNSUPPORTED_KEYS' },
  );
});

test('rejects and never persists measurement-like or authoritative claims, at any nesting depth', () => {
  for (const forbidden of [
    { measurement: { value: 450, unit: 'mm' } },
    { value: 450 },
    { scale: 1.2 },
    { geometry: { points: [] } },
    { approved: true },
    { reviewStatus: 'approved' },
    { tenantId: 'x' },
    { itemType: 'profile' },
    { tags: ['roofing'] },
  ]) {
    assert.throws(
      () => validateClaudeGuidanceResponse(validResponse(forbidden)),
      (err) => err instanceof CaptureClaudePolicyError
        && ['CLAUDE_RESPONSE_FORBIDDEN_FIELD', 'CLAUDE_RESPONSE_UNSUPPORTED_KEYS'].includes(err.code),
      `expected ${JSON.stringify(forbidden)} to be rejected`,
    );
  }

  // Nested inside an otherwise-valid field.
  assert.throws(
    () => validateClaudeGuidanceResponse(validResponse({
      shotRequest: { ...validShotRequest(), geometry: { x: 1 } },
    })),
    { code: 'CLAUDE_RESPONSE_FORBIDDEN_FIELD' },
  );
});

test('rejects invalid confidence', () => {
  assert.throws(() => validateClaudeGuidanceResponse(validResponse({ confidence: 1.5 })), { code: 'CLAUDE_CONFIDENCE_INVALID' });
  assert.throws(() => validateClaudeGuidanceResponse(validResponse({ confidence: -0.1 })), { code: 'CLAUDE_CONFIDENCE_INVALID' });
  assert.throws(() => validateClaudeGuidanceResponse(validResponse({ confidence: 'high' })), { code: 'CLAUDE_CONFIDENCE_INVALID' });
});

test('a shot request must include every required field or is rejected outright', () => {
  for (const field of ['position', 'angle', 'distance', 'orientation', 'requiredFeature', 'reason']) {
    const incomplete = validShotRequest();
    delete incomplete[field];
    assert.throws(
      () => validateClaudeGuidanceResponse(validResponse({ shotRequest: incomplete })),
      { code: 'CLAUDE_SHOT_REQUEST_INCOMPLETE' },
      `missing ${field} must be rejected`,
    );
  }
  const missingRuler = validShotRequest();
  delete missingRuler.rulerVisible;
  assert.throws(
    () => validateClaudeGuidanceResponse(validResponse({ shotRequest: missingRuler })),
    { code: 'CLAUDE_SHOT_REQUEST_INCOMPLETE' },
  );
});

test('shotRequest may be null (no additional shot recommended) — a valid, common response', () => {
  const result = validateClaudeGuidanceResponse(validResponse({ shotRequest: null }));
  assert.equal(result.shotRequest, null);
});

test('missing source references (empty unclearFeatures/redundantAssetIds) degrade to empty arrays, not errors', () => {
  const result = validateClaudeGuidanceResponse({ confidence: 0.5 });
  assert.deepEqual(result.unclearFeatures, []);
  assert.deepEqual(result.redundantAssetIds, []);
  assert.equal(result.reviewerSummary, null);
  assert.equal(result.shotRequest, null);
});

test('bounded text: absurdly long strings are truncated, not rejected outright', () => {
  const result = validateClaudeGuidanceResponse(validResponse({ reviewerSummary: 'x'.repeat(5000) }));
  assert.ok(result.reviewerSummary.length <= 400);
});

test('a malformed shotRequest type is rejected', () => {
  assert.throws(
    () => validateClaudeGuidanceResponse(validResponse({ shotRequest: 'not an object' })),
    { code: 'CLAUDE_SHOT_REQUEST_INVALID' },
  );
  assert.throws(
    () => validateClaudeGuidanceResponse(validResponse({ shotRequest: ['array'] })),
    { code: 'CLAUDE_SHOT_REQUEST_INVALID' },
  );
});
