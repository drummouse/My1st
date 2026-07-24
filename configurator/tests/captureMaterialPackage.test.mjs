import test from 'node:test';
import assert from 'node:assert/strict';
import { buildR2PackageManifest, validateR2PackageDryRun, R2_PACKAGE_SCHEMA_VERSION } from '../api/_lib/captureMaterialPackage.js';

const baseSession = () => ({
  id: 's1', ownerId: 'user-a', title: 'Standing seam 450', status: 'draft',
  materialZoneState: { zones: [{ zoneId: 'main_visible_face', confirmed: true }] },
  textureDirection: 'along_run',
  studioValidation: { status: 'ready', issues: [] },
  createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:05:00Z',
});

const baseEvidence = () => ({
  confidence: 0.9,
  assetQuality: [{ assetId: 'a1', purpose: 'left_end', findings: [{ type: 'sharpness_estimate' }] }],
  qualitySummary: { issueCount: 1, hasPossibleDuplicates: false },
});

test('buildR2PackageManifest assembles the identity namespace with a proposed (not written) review status', () => {
  const manifest = buildR2PackageManifest({
    session: baseSession(), fields: [], assets: [], measurements: [], claudeAnalyses: [],
    evidence: baseEvidence(), actor: { id: 'user-a' },
  });
  assert.equal(manifest.schemaVersion, R2_PACKAGE_SCHEMA_VERSION);
  assert.equal(manifest.identity.packageId, 'capture:s1');
  assert.equal(manifest.identity.scope, 'tenant');
  assert.equal(manifest.identity.tenantId, 'user-a');
  assert.equal(manifest.identity.sourceType, 'capture');
  assert.equal(manifest.identity.proposedReviewStatus, 'pending_review');
  assert.equal(manifest.identity.currentSessionStatus, 'draft', 'the REAL session status is reported separately from the proposed target');
  assert.equal(manifest.identity.captureConfidence, 0.9);
});

test('evidence and calibrationAndMeasurement namespaces reflect user-confirmed facts only', () => {
  const manifest = buildR2PackageManifest({
    session: baseSession(),
    fields: [{ fieldKey: 'calibration', value: { units: 'mm', rulerConfirmed: true, knownMeasurement: { feature: 'width', value: 450, unit: 'mm' } } }],
    assets: [{ id: 'a1', purpose: 'left_end', classification: 'source', checksum: 'c1', captureMetadata: {} }],
    measurements: [{ id: 'm1', feature: 'width', axis: 'width', value: 450, unit: 'mm', method: 'ruler', confirmedBy: 'user-a', confirmedAt: 't' }],
    claudeAnalyses: [],
    evidence: baseEvidence(),
    actor: { id: 'user-a' },
  });
  assert.equal(manifest.evidence.sourceAssets[0].assetId, 'a1');
  assert.equal(manifest.evidence.sourceAssets[0].checksum, 'c1');
  assert.equal(manifest.calibrationAndMeasurement.unitSystem, 'mm');
  assert.equal(manifest.calibrationAndMeasurement.measurements[0].confirmedBy, 'user-a');
  assert.equal(manifest.deterministicAnalysis.assetQuality[0].findings[0].type, 'sharpness_estimate');
});

test('claude analyses land only in claudeAnalysis.attempts, marked advisory, never in deterministicAnalysis or calibrationAndMeasurement', () => {
  const manifest = buildR2PackageManifest({
    session: baseSession(),
    fields: [],
    assets: [],
    measurements: [],
    claudeAnalyses: [{ id: 'ca1', status: 'advisory', model: 'claude-sonnet-5', promptVersion: 'v1', schemaVersion: 1, sourceAssetIds: ['a1'], findings: { confidence: 0.5, shotRequest: null } }],
    evidence: baseEvidence(),
    actor: { id: 'user-a' },
  });
  assert.equal(manifest.claudeAnalysis.attempts.length, 1);
  assert.equal(manifest.claudeAnalysis.attempts[0].advisory, true);
  assert.equal(manifest.claudeAnalysis.attempts[0].analysisId, 'ca1');
  assert.equal(JSON.stringify(manifest.deterministicAnalysis).includes('ca1'), false);
  assert.equal(JSON.stringify(manifest.calibrationAndMeasurement).includes('ca1'), false);
});

test('reviewerDecisions is reserved and always empty in R2 (no review UI reads this manifest yet)', () => {
  const manifest = buildR2PackageManifest({
    session: baseSession(), fields: [], assets: [], measurements: [], claudeAnalyses: [],
    evidence: baseEvidence(), actor: { id: 'user-a' },
  });
  assert.deepEqual(manifest.reviewerDecisions, []);
});

test('materialReadiness carries the honest R2 label and never a geometryUrl', () => {
  const manifest = buildR2PackageManifest({
    session: baseSession(), fields: [], assets: [], measurements: [], claudeAnalyses: [],
    evidence: baseEvidence(), actor: { id: 'user-a' },
  });
  assert.match(manifest.materialReadiness.label, /not reconstructed geometry/i);
  assert.match(manifest.materialReadiness.label, /not fabrication grade/i);
  assert.equal('geometryUrl' in manifest.materialReadiness, false);
  assert.equal('geometryUrl' in manifest, false);
});

test('validateR2PackageDryRun surfaces stable errors from completeness and studio validation, unmodified', () => {
  const invalid = validateR2PackageDryRun({
    completeness: { errors: [{ code: 'CALIBRATION_REQUIRED', message: 'Complete calibration.' }] },
    studioValidation: { status: 'needs_attention', issues: [{ code: 'TEXTURE_DIRECTION_MISSING', message: 'Select a texture direction.' }] },
  });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.errors, [
    { code: 'CALIBRATION_REQUIRED', message: 'Complete calibration.', path: 'evidence' },
    { code: 'TEXTURE_DIRECTION_MISSING', message: 'Select a texture direction.', path: 'materialReadiness' },
  ]);

  const missingValidation = validateR2PackageDryRun({ completeness: { errors: [] }, studioValidation: null });
  assert.equal(missingValidation.valid, false);
  assert.equal(missingValidation.errors[0].code, 'STUDIO_VALIDATION_NOT_RUN');

  const valid = validateR2PackageDryRun({
    completeness: { errors: [] },
    studioValidation: { status: 'ready', issues: [] },
  });
  assert.deepEqual(valid, { valid: true, errors: [] });
});
