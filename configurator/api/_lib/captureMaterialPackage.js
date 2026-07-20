// R2.6 — the R2 material-package manifest subset, and a side-effect-free
// dry-run validator over it. Pure, no I/O — everything it needs is passed
// in by the caller (captureService.js), which does the actual reads.
//
// Namespaces are kept deliberately separate, per the R2 authorization:
// deterministic findings, Claude's advisory guidance, user-confirmed
// facts, and a reserved (empty in R2) reviewer-decision slot never merge
// into one blob. This is the same discipline already enforced inside
// captureEvidence.js (assetQuality vs confidence) and captureService.js
// (capture_claude_analyses vs capture_measurements) — this module just
// assembles what already exists into one exportable shape without
// re-deriving or reinterpreting any of it.
//
// This is explicitly NOT the full Material Package Specification manifest
// (GLB/SVG/DXF, PBR maps, UV/procedural mapping) — that remains R4+. R2's
// subset covers exactly what the authorization's package-subset list asks
// for and nothing more.

export const R2_PACKAGE_SCHEMA_VERSION = 1;

function currentSourceAsset(assets, purpose) {
  return assets.find((a) => a.purpose === purpose && a.classification === 'source' && !a.supersededBy);
}

// Builds the manifest. Read-only by construction — every field here is
// derived from data already passed in; this function never calls out to a
// store, never mutates anything, and has no side effects of its own.
export function buildR2PackageManifest({
  session, fields = [], assets = [], measurements = [], claudeAnalyses = [], evidence, actor,
}) {
  const calibration = fields.find((f) => f.fieldKey === 'calibration')?.value ?? null;
  const sourceAssets = assets.filter((a) => a.classification === 'source');

  return {
    schemaVersion: R2_PACKAGE_SCHEMA_VERSION,

    // --- Identity -----------------------------------------------------
    identity: {
      packageId: `capture:${session.id}`,
      captureSessionId: session.id,
      recordType: 'profile',
      workingName: session.title,
      sourceType: 'capture',
      scope: 'tenant',
      tenantId: session.ownerId,
      // PROPOSED target for a future actual submission — not written
      // anywhere by this manifest; the session's real `status` (draft,
      // submitted, approved, published, …) is the only authoritative
      // lifecycle state, and it is reported separately below.
      proposedReviewStatus: 'pending_review',
      currentSessionStatus: session.status,
      captureConfidence: evidence.confidence,
      attribution: actor?.displayName ?? actor?.id ?? null,
      sourceLineage: { captureSessionId: session.id },
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      idempotencyReference: `capture:${session.id}`,
    },

    // --- Evidence (original source images + lineage) -------------------
    evidence: {
      sourceAssets: sourceAssets.map((a) => ({
        assetId: a.id,
        checksum: a.checksum,
        shotRole: a.purpose,
        requestedPose: a.captureMetadata?.requestedPose ?? null,
        acceptedAt: a.captureMetadata?.acceptedAt ?? a.captureMetadata?.capturedAt ?? null,
        technicalMetadata: { mimeType: a.mimeType, width: a.width, height: a.height, sizeBytes: a.sizeBytes },
        supersededBy: a.supersededBy ?? null,
      })),
    },

    // --- Calibration and measurement (user-confirmed facts) ------------
    calibrationAndMeasurement: {
      unitSystem: calibration?.units ?? null,
      rulerConfirmed: calibration?.rulerConfirmed ?? false,
      knownMeasurement: calibration?.knownMeasurement ?? null,
      scaleConfidence: evidence.confidence,
      measurements: measurements.map((m) => ({
        measurementId: m.id,
        feature: m.feature,
        axis: m.axis,
        value: m.value,
        unit: m.unit,
        method: m.method,
        confidence: m.confidence,
        confirmedBy: m.confirmedBy,
        confirmedAt: m.confirmedAt,
      })),
    },

    // --- Deterministic analysis (own namespace) -------------------------
    deterministicAnalysis: {
      assetQuality: evidence.assetQuality,
      qualitySummary: evidence.qualitySummary,
    },

    // --- Claude analysis (own namespace — strictly advisory) ------------
    claudeAnalysis: {
      attempts: claudeAnalyses.map((a) => ({
        analysisId: a.id,
        status: a.status,
        model: a.model,
        promptVersion: a.promptVersion,
        schemaVersion: a.schemaVersion,
        sourceAssetIds: a.sourceAssetIds,
        findings: a.findings,
        advisory: true,
      })),
    },

    // --- Reviewer decisions (reserved — empty until a real review exists) -
    reviewerDecisions: [],

    // --- Material readiness ---------------------------------------------
    materialReadiness: {
      measuredSchematicAvailable: Boolean(currentSourceAsset(assets, 'left_end') && currentSourceAsset(assets, 'front')),
      geometryConfidence: evidence.confidence,
      materialZoneState: session.materialZoneState,
      textureDirection: session.textureDirection,
      studioValidation: session.studioValidation,
      label: 'R2 technical proof — not reconstructed geometry, not fabrication grade, not a Studio-ready package.',
    },
  };
}

// Side-effect-free validation: never mutates anything, only tells the
// caller what's missing for the PROPOSED submission target. Reuses the
// existing validateCompleteness/evaluateFlatWallValidation results the
// caller already computed (no re-derivation, one source of truth).
export function validateR2PackageDryRun({ completeness, studioValidation }) {
  const errors = [];
  for (const error of completeness?.errors ?? []) {
    errors.push({ code: error.code, message: error.message, path: 'evidence' });
  }
  if (!studioValidation || studioValidation.status !== 'ready') {
    for (const issue of studioValidation?.issues ?? [{ code: 'STUDIO_VALIDATION_NOT_RUN', message: 'Run the flat-wall technical compatibility check.' }]) {
      errors.push({ code: issue.code, message: issue.message, path: 'materialReadiness' });
    }
  }
  return { valid: errors.length === 0, errors };
}
