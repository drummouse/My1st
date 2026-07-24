import { randomUUID as nodeRandomUUID } from 'node:crypto';
import {
  CaptureValidationError,
  EDITABLE_STATUSES,
  assertTransition,
  normalizeAssetInput,
  normalizeCalibration,
  normalizeCreateInput,
  normalizeDraftPatch,
  normalizeMeasurementInput,
  normalizeMaterialZoneState,
  normalizeTextureDirection,
  normalizeTagInput,
  validateCompleteness,
} from './capturePolicy.js';
import { buildLibraryPublication, captureExternalReference, toStudioProduct } from './capturePublish.js';
import { evaluateProfileEvidence } from './captureEvidence.js';
import {
  buildClaudeGuidanceRequest,
  validateClaudeGuidanceResponse,
  CLAUDE_GUIDANCE_PROMPT_VERSION,
  CLAUDE_GUIDANCE_SCHEMA_VERSION,
} from './captureClaudePolicy.js';
import { requestClaudeGuidance as defaultRequestClaudeGuidance } from './captureClaudeClient.js';
import { evaluateFlatWallValidation } from './captureStudioValidation.js';
import { buildR2PackageManifest, validateR2PackageDryRun } from './captureMaterialPackage.js';
import { getPrivateBlob as defaultGetPrivateBlob } from './captureBlobAccess.js';

export function toCaptureSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id ?? row.ownerId ?? null,
    clientRef: row.client_ref ?? row.clientRef ?? null,
    captureType: row.capture_type ?? row.captureType,
    category: row.category ?? null,
    title: row.title ?? null,
    status: row.status,
    currentStep: row.current_step ?? row.currentStep ?? null,
    completeness: Number(row.completeness ?? 0),
    submittedAt: row.submitted_at ?? row.submittedAt ?? null,
    publishedRecordId: row.published_record_id ?? row.publishedRecordId ?? null,
    publishedVersion: row.published_version ?? row.publishedVersion ?? null,
    // R2.5 — material-ready schematic proof (not reconstructed geometry).
    materialZoneState: row.material_zone_state ?? row.materialZoneState ?? null,
    textureDirection: row.texture_direction ?? row.textureDirection ?? null,
    studioValidation: row.studio_validation ?? row.studioValidation ?? null,
    tags: row.tags ?? [],
    itemType: row.item_type ?? row.itemType ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function toCaptureField(row) {
  return {
    fieldKey: row.field_key ?? row.fieldKey,
    value: row.value ?? null,
    source: row.source || 'manual',
    confidence: row.confidence == null ? null : Number(row.confidence),
    confirmedBy: row.confirmed_by ?? row.confirmedBy ?? null,
    confirmedAt: row.confirmed_at ?? row.confirmedAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function toCaptureAsset(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    purpose: row.purpose,
    classification: row.classification || 'source',
    sourceAssetId: row.source_asset_id ?? row.sourceAssetId ?? null,
    url: row.url,
    checksum: row.checksum ?? null,
    mimeType: row.mime_type ?? row.mimeType ?? null,
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? 0),
    width: row.width ?? null,
    height: row.height ?? null,
    captureMetadata: row.capture_metadata ?? row.captureMetadata ?? {},
    uploadStatus: row.upload_status ?? row.uploadStatus ?? 'complete',
    // Set once, by replaceAsset, when a later accepted photo supersedes
    // this one. Never null-to-set-back — supersession is permanent (R2.2).
    supersededBy: row.superseded_by ?? row.supersededBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function toCaptureMeasurement(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    feature: row.feature,
    axis: row.axis ?? null,
    value: Number(row.value),
    unit: row.unit,
    method: row.method || 'manual',
    confidence: row.confidence == null ? null : Number(row.confidence),
    sourceAssetId: row.source_asset_id ?? row.sourceAssetId ?? null,
    confirmedBy: row.confirmed_by ?? row.confirmedBy ?? null,
    confirmedAt: row.confirmed_at ?? row.confirmedAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function toCaptureTag(row) {
  return {
    id: row.id,
    ownerId: row.owner_id ?? row.ownerId,
    tag: row.tag,
    createdBy: row.created_by ?? row.createdBy ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

export function toCaptureComment(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    authorId: row.author_id ?? row.authorId,
    authorLabel: row.author_label ?? row.authorLabel ?? null,
    body: row.body,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

// One Claude adaptive-guidance attempt (R2.4) — advisory, versioned,
// provenance-tagged, and kept in its own namespace: `findings` is only ever
// populated when `status === 'advisory'` (a validated, policy-passed Claude
// response); every other status carries a non-sensitive `diagnostic`
// instead, never the raw response or any image data.
export function toCaptureClaudeAnalysis(row) {
  return {
    id: row.id,
    sessionId: row.session_id ?? row.sessionId,
    status: row.status,
    model: row.model ?? null,
    promptVersion: row.prompt_version ?? row.promptVersion ?? null,
    schemaVersion: row.schema_version ?? row.schemaVersion ?? null,
    sourceAssetIds: row.source_asset_ids ?? row.sourceAssetIds ?? [],
    findings: row.findings ?? null,
    diagnostic: row.diagnostic ?? {},
    fulfilledAssetId: row.fulfilled_asset_id ?? row.fulfilledAssetId ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

// The statuses a reviewer's queue cares about (everything past draft that
// is not archived). Draft content is private to the contributor until they
// submit — it never appears in a queue.
export const REVIEW_QUEUE_STATUSES = Object.freeze([
  'submitted', 'in_review', 'changes_requested', 'approved', 'publishing', 'published', 'rejected',
]);

const REVIEW_DECISIONS = Object.freeze({
  approve: 'approved',
  request_changes: 'changes_requested',
  reject: 'rejected',
});

const rowOwner = (row) => row.owner_id ?? row.ownerId;

// Ownership is enforced here (the policy module checks capabilities only).
// A row outside the actor's tenant is reported as not-found, never as
// forbidden — same information-hiding stance as Library Core.
function assertOwned(actor, row, code, message) {
  if (!row || (actor.role !== 'superadmin' && rowOwner(row) !== actor.id)) {
    throw new CaptureValidationError(code, message);
  }
}

function assertVisible(actor, row) {
  assertOwned(actor, row, 'CAPTURE_SESSION_NOT_FOUND', 'Capture session not found');
}

export function createCaptureService({
  store, randomUUID = nodeRandomUUID, requestClaudeGuidance = defaultRequestClaudeGuidance,
  getPrivateBlob = defaultGetPrivateBlob,
}) {
  const audit = (actor, action, targetId, reason, metadata = {}) => ({
    actorId: actor.id, action, targetType: 'capture_session', targetId, reason: reason || null, metadata,
  });

  return {
    async listSessions(actor, filters = {}) {
      const rows = await store.listSessions({
        ownerId: actor.id,
        includeAllOwners: actor.role === 'superadmin',
        status: filters.status || null,
        limit: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
      });
      return rows.map(toCaptureSession);
    },

    async getSession(actor, id) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const [fields, assets, comments, measurements, claudeAnalyses] = await Promise.all([
        store.listFields(id), store.listAssets(id), store.listComments(id), store.listMeasurements(id),
        store.listClaudeAnalyses(id),
      ]);
      return {
        session: toCaptureSession(row),
        fields: fields.map(toCaptureField),
        assets: assets.map(toCaptureAsset),
        comments: comments.map(toCaptureComment),
        measurements: measurements.map(toCaptureMeasurement),
        claudeAnalyses: claudeAnalyses.map(toCaptureClaudeAnalysis),
      };
    },

    // Streams a Capture asset's bytes server-side (D-051): the connected
    // Blob store is private-only, so a stored asset URL is no longer
    // directly fetchable by anyone holding it — every read is gated by the
    // same owner-or-superadmin visibility rule every other Capture route
    // already uses, then fetched with the platform's own credentials.
    async getAssetBlob(actor, sessionId, assetId) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      const asset = await store.getAsset(assetId);
      if (!asset || (asset.session_id ?? asset.sessionId) !== sessionId) {
        throw new CaptureValidationError('CAPTURE_ASSET_NOT_FOUND', 'Asset not found');
      }
      const blob = await getPrivateBlob(asset.url);
      if (!blob) throw new CaptureValidationError('CAPTURE_ASSET_NOT_FOUND', 'Asset not found');
      return { stream: blob.stream, contentType: blob.blob.contentType };
    },

    // Calibration setup (Slice R1): validated evidence saved as the
    // 'calibration' field, and the known reference measurement recorded as
    // a confirmed measurement row in the same step.
    async saveCalibration(actor, id, input) {
      const calibration = normalizeCalibration(input);
      const row = await store.getSession(id);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot change calibration`, { status: row.status });
      }
      return store.transaction(async () => {
        await store.upsertField(id, 'calibration', calibration);
        await store.insertMeasurement({
          id: randomUUID(),
          sessionId: id,
          ownerId: rowOwner(row),
          feature: calibration.knownMeasurement.feature,
          axis: null,
          value: calibration.knownMeasurement.value,
          unit: calibration.units,
          method: 'ruler',
          confidence: 1,
          sourceAssetId: null,
          confirmedBy: actor.id,
        });
        return { calibration };
      });
    },

    async addMeasurement(actor, id, input) {
      const normalized = normalizeMeasurementInput(input);
      const row = await store.getSession(id);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot record measurements`, { status: row.status });
      }
      const change = {
        id: randomUUID(), sessionId: id, ownerId: rowOwner(row),
        // User-entered values are confirmed by the person entering them.
        confirmedBy: actor.id, ...normalized,
      };
      const created = await store.insertMeasurement(change);
      return { measurement: toCaptureMeasurement(created ?? { ...change, confirmed_at: new Date().toISOString() }) };
    },

    async removeMeasurement(actor, id, measurementId) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture's measurements cannot change`, { status: row.status });
      }
      const measurement = await store.getMeasurement(measurementId);
      if (!measurement || (measurement.session_id ?? measurement.sessionId) !== id) {
        throw new CaptureValidationError('CAPTURE_MEASUREMENT_NOT_FOUND', 'Measurement not found');
      }
      await store.deleteMeasurement(measurementId);
      return { removed: true };
    },

    // Tenant-scoped tag vocabulary (flexible-tags slice, deferred by
    // D-035). Listing follows the same row-scoping as everything else
    // (superadmin sees every tenant's vocabulary); creation and removal are
    // always scoped to the actor's own tenant.
    async listTags(actor) {
      const rows = await store.listTags({ ownerId: actor.id, includeAllOwners: actor.role === 'superadmin' });
      return rows.map(toCaptureTag);
    },

    // Idempotent by (owner, tag): re-adding an existing vocabulary entry
    // returns it instead of erroring, mirroring createSession's clientRef
    // reuse.
    async createTag(actor, input) {
      const { tag } = normalizeTagInput(input);
      const change = { id: randomUUID(), ownerId: actor.id, tag, createdBy: actor.id };
      const created = await store.insertTag(change);
      if (created) return { tag: toCaptureTag(created), created: true };
      const existing = await store.getTagByValue(actor.id, tag);
      return { tag: toCaptureTag(existing), created: false };
    },

    async removeTag(actor, tagId) {
      const row = await store.getTag(tagId);
      assertOwned(actor, row, 'CAPTURE_TAG_NOT_FOUND', 'Capture tag not found');
      await store.deleteTag(tagId);
      return { removed: true };
    },

    // Adaptive evidence for a profile_geometry session — same module the
    // client runs, served here as the enforceable truth.
    async evaluateEvidence(actor, id) {
      const detail = await this.getSession(actor, id);
      return evaluateProfileEvidence(detail);
    },

    // Idempotent by (owner, clientRef): retrying a create — flaky mobile
    // network, refresh mid-request — returns the already-created session
    // instead of a duplicate. A race between two identical creates is caught
    // by the partial unique index; the loser's retry lands here and finds
    // the winner.
    async createSession(actor, input) {
      const normalized = normalizeCreateInput(input);
      if (normalized.clientRef) {
        const existing = await store.getSessionByClientRef(actor.id, normalized.clientRef);
        if (existing) return { session: toCaptureSession(existing), created: false };
      }
      const change = {
        id: randomUUID(),
        ownerId: actor.id,
        status: 'draft',
        completeness: 0,
        ...normalized,
      };
      return store.transaction(async () => {
        const row = await store.createSession(change);
        await store.appendAudit(audit(actor, 'capture.session.created', change.id, null, {
          captureType: normalized.captureType, category: normalized.category,
        }));
        return { session: toCaptureSession(row), created: true };
      });
    },

    // Draft-content saves are deliberately NOT audited (decision D-012):
    // state changes, reviews, and archives are; keystroke-level saves would
    // only bury those. Content is only editable while the contributor still
    // owns the ball (draft / changes_requested).
    async updateDraft(actor, id, input) {
      const patch = normalizeDraftPatch(input);
      const row = await store.getSession(id);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot be edited`, { status: row.status });
      }
      return store.transaction(async () => {
        const updated = await store.updateSessionContent(id, patch);
        for (const field of patch.fields || []) {
          await store.upsertField(id, field.fieldKey, field.value);
        }
        return { session: toCaptureSession(updated ?? { ...row, ...patch }) };
      });
    },

    // Finalizes one direct-to-Blob upload as an asset row. Like other draft
    // content it is only writable while the contributor holds the ball and
    // is not audited per-save (D-012). Derived assets (thumbnails, crops)
    // must point at a source asset in the same session — originals are
    // never replaced, only referenced.
    //
    // Checksum idempotency (R2.2): a finalize retry (flaky network — the
    // client never learned the first attempt succeeded) for the same
    // session + checksum returns the existing source asset instead of
    // inserting a duplicate row.
    async addAsset(actor, sessionId, input) {
      const normalized = normalizeAssetInput(input);
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot receive new images`, { status: row.status });
      }
      if (normalized.sourceAssetId) {
        const source = await store.getAsset(normalized.sourceAssetId);
        if (!source || (source.session_id ?? source.sessionId) !== sessionId) {
          throw new CaptureValidationError('CAPTURE_ASSET_SOURCE_INVALID',
            'The source asset does not belong to this capture session');
        }
      }
      if (normalized.classification === 'source' && normalized.checksum) {
        const existing = await store.listAssets(sessionId);
        const duplicate = existing.find((a) => (a.classification || 'source') === 'source'
          && a.checksum === normalized.checksum
          && !(a.superseded_by ?? a.supersededBy));
        if (duplicate) {
          return { asset: toCaptureAsset(duplicate), duplicate: true };
        }
      }
      const change = { id: randomUUID(), sessionId, ownerId: rowOwner(row), ...normalized };
      const created = await store.insertAsset(change);
      return { asset: toCaptureAsset(created ?? change), duplicate: false };
    },

    // Delete-before-submit: allowed only while editable. Removing a source
    // asset removes its derivatives with it (a thumbnail without its
    // original is meaningless); a locked session's assets are immutable.
    // This remains for genuinely unwanted shots (wrong session, mistaken
    // purpose); replaceAsset below is the path for "this view needs a
    // better photo," which preserves rather than deletes the original.
    async removeAsset(actor, sessionId, assetId) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture's images cannot be removed`, { status: row.status });
      }
      const asset = await store.getAsset(assetId);
      if (!asset || (asset.session_id ?? asset.sessionId) !== sessionId) {
        throw new CaptureValidationError('CAPTURE_ASSET_NOT_FOUND', 'Capture asset not found');
      }
      await store.deleteAssetWithDerivatives(assetId);
      return { removed: true };
    },

    // Replace an already-accepted source image for the same shot (R2.2,
    // decision D-039): the prior asset is never overwritten or deleted —
    // its url/checksum/capture_metadata/timestamps are preserved exactly as
    // originally accepted, and it is linked forward via superseded_by. The
    // new asset is inserted as an ordinary immutable source asset, forced
    // onto the SAME purpose as the one it replaces (a replacement cannot
    // smuggle in a different view), with capture_metadata.supersedesAssetId
    // recording the reverse link for the new row.
    async replaceAsset(actor, sessionId, oldAssetId, input) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture's images cannot be replaced`, { status: row.status });
      }
      const oldAsset = await store.getAsset(oldAssetId);
      if (!oldAsset || (oldAsset.session_id ?? oldAsset.sessionId) !== sessionId) {
        throw new CaptureValidationError('CAPTURE_ASSET_NOT_FOUND', 'Capture asset not found');
      }
      if ((oldAsset.classification ?? 'source') !== 'source') {
        throw new CaptureValidationError('CAPTURE_ASSET_NOT_REPLACEABLE', 'Only an accepted source image can be replaced');
      }
      if (oldAsset.superseded_by ?? oldAsset.supersededBy) {
        throw new CaptureValidationError('CAPTURE_ASSET_ALREADY_SUPERSEDED', 'This image was already replaced');
      }
      const normalized = normalizeAssetInput({ ...input, classification: 'source', purpose: oldAsset.purpose });
      const change = {
        id: randomUUID(),
        sessionId,
        ownerId: rowOwner(row),
        ...normalized,
        captureMetadata: { ...normalized.captureMetadata, supersedesAssetId: oldAssetId },
      };
      const created = await store.insertAsset(change);
      await store.markSuperseded(oldAssetId, change.id);
      return { asset: toCaptureAsset(created ?? change), supersededAssetId: oldAssetId };
    },

    // Claude semantic adaptive guidance (R2.4). Advisory only — see §16 of
    // the R2 authorization and docs/CAPTURE_R2_CLAUDE_PRIVACY_DECISION.md.
    // Every attempt is recorded as its own immutable capture_claude_analyses
    // row, whether it succeeds, is disabled/unavailable, times out, errors,
    // or fails policy validation — this method NEVER throws on a Claude
    // failure; deterministic guidance (captureEvidence.js) is completely
    // unaffected either way, so a Claude outage can never block capture.
    async requestGuidance(actor, sessionId) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot request guidance`, { status: row.status });
      }
      const [fields, assets, measurements] = await Promise.all([
        store.listFields(sessionId), store.listAssets(sessionId), store.listMeasurements(sessionId),
      ]);
      const calibration = fields.find((f) => (f.field_key ?? f.fieldKey) === 'calibration')?.value ?? null;
      const acceptedAssets = assets
        .filter((a) => (a.classification || 'source') === 'source' && !(a.superseded_by ?? a.supersededBy))
        .map(toCaptureAsset);
      const sourceAssetIds = acceptedAssets.map((a) => a.id);

      const claudeRequest = buildClaudeGuidanceRequest({
        session: { id: sessionId }, acceptedAssets, calibration, measurementCount: measurements.length,
      });
      // Only ever sends the existing derived thumbnail, never the original
      // (privacy decision §2-3) — an asset with no thumbnail is simply
      // excluded, not substituted with the original.
      const assetThumbnails = acceptedAssets.map((sourceAsset) => {
        const thumb = assets.find((a) => (a.classification || 'source') === 'derived'
          && (a.source_asset_id ?? a.sourceAssetId) === sourceAsset.id);
        return thumb ? { assetId: sourceAsset.id, url: thumb.url, mediaType: thumb.mime_type ?? thumb.mimeType } : null;
      }).filter(Boolean);

      const outcome = await requestClaudeGuidance(claudeRequest, { assetThumbnails });

      let status;
      let model = null;
      let findings = null;
      let diagnostic = {};
      if (!outcome.ok) {
        status = outcome.reason;
        diagnostic = outcome.error ? { error: String(outcome.error).slice(0, 300) } : {};
      } else {
        model = outcome.model;
        try {
          findings = validateClaudeGuidanceResponse(outcome.raw);
          status = 'advisory';
          diagnostic = { imageCount: outcome.imageCount };
        } catch (err) {
          // Policy-rejected — never persisted as findings, only the fact
          // that it was rejected and why (§17: "Do not persist unvalidated
          // Claude output").
          status = 'invalid';
          diagnostic = { code: err.code, message: String(err.message).slice(0, 300) };
        }
      }

      const record = {
        id: randomUUID(),
        sessionId,
        ownerId: rowOwner(row),
        status,
        model,
        promptVersion: CLAUDE_GUIDANCE_PROMPT_VERSION,
        schemaVersion: CLAUDE_GUIDANCE_SCHEMA_VERSION,
        sourceAssetIds,
        findings,
        diagnostic,
      };
      const created = await store.insertClaudeAnalysis(record);
      return { analysis: toCaptureClaudeAnalysis(created ?? record) };
    },

    // R2.5 — confirm the one material zone R2 requires. Does not implement
    // backside/cut-edge zones or geometry-behavior modeling (R4+).
    async saveMaterialZone(actor, sessionId, input) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot update material zone`, { status: row.status });
      }
      const materialZoneState = normalizeMaterialZoneState(input);
      const updated = await store.updateMaterialReadiness(sessionId, { materialZoneState });
      return { session: toCaptureSession(updated ?? { ...row, material_zone_state: materialZoneState }) };
    },

    async saveTextureDirection(actor, sessionId, input) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (!EDITABLE_STATUSES.includes(row.status)) {
        throw new CaptureValidationError('CAPTURE_SESSION_LOCKED',
          `A ${row.status} capture cannot update texture direction`, { status: row.status });
      }
      const textureDirection = normalizeTextureDirection(input?.textureDirection);
      const updated = await store.updateMaterialReadiness(sessionId, { textureDirection });
      return { session: toCaptureSession(updated ?? { ...row, texture_direction: textureDirection }) };
    },

    // Deterministic evaluation only — the actual on-screen preview is a
    // client-side Three.js schematic built from these same confirmed
    // values (D-046). Never populates the Studio DTO's geometryUrl.
    async evaluateStudioValidation(actor, sessionId) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      const measurements = await store.listMeasurements(sessionId);
      const result = evaluateFlatWallValidation({
        measurements: measurements.map(toCaptureMeasurement),
        materialZoneState: row.material_zone_state ?? row.materialZoneState ?? null,
        textureDirection: row.texture_direction ?? row.textureDirection ?? null,
      });
      const updated = await store.updateMaterialReadiness(sessionId, { studioValidation: result });
      return { validation: result, session: toCaptureSession(updated ?? { ...row, studio_validation: result }) };
    },

    // R2.6 — side-effect-free dry-run over the R2 material-package
    // manifest subset. Read-only by construction: every store call below
    // is a list/get, never an insert/update/delete. Does not create a
    // Library record, does not change capture session status, does not
    // transition review status, does not publish anything, and does not
    // touch the existing approved->publishing->published flow
    // (capturePublish.js is not imported by this method at all).
    // `identity.proposedReviewStatus` is always the literal string
    // 'pending_review' — describing the PROPOSED target of a future real
    // submission, never something this call writes anywhere.
    async dryRunMaterialPackage(actor, sessionId) {
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      const [fields, assets, measurements, claudeAnalyses] = await Promise.all([
        store.listFields(sessionId), store.listAssets(sessionId), store.listMeasurements(sessionId),
        store.listClaudeAnalyses(sessionId),
      ]);
      const session = toCaptureSession(row);
      const fieldDtos = fields.map(toCaptureField);
      const assetDtos = assets.map(toCaptureAsset);
      const measurementDtos = measurements.map(toCaptureMeasurement);
      const claudeDtos = claudeAnalyses.map(toCaptureClaudeAnalysis);

      const evidence = evaluateProfileEvidence({ fields: fieldDtos, assets: assetDtos, measurements: measurementDtos });
      const completeness = validateCompleteness({ session, fields: fieldDtos, assets: assetDtos, measurements: measurementDtos });

      const manifest = buildR2PackageManifest({
        session, fields: fieldDtos, assets: assetDtos, measurements: measurementDtos,
        claudeAnalyses: claudeDtos, evidence, actor,
      });
      const validation = validateR2PackageDryRun({ completeness, studioValidation: session.studioValidation });

      return { manifest, validation };
    },

    // Server-truth completeness for a session — the client runs the same
    // validateCompleteness locally, this endpoint answers with what the
    // submit gate will actually enforce.
    async validateSession(actor, id) {
      const detail = await this.getSession(actor, id);
      return validateCompleteness(detail);
    },

    // Submit (and resubmit, from changes_requested): completeness errors
    // block; success freezes an immutable snapshot of exactly what was
    // submitted — session content, fields, assets, and the completeness
    // result — so review always sees what the contributor sent even if
    // later stages evolve the live records.
    async submitSession(actor, id) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const outcome = assertTransition(actor.role, row.status, 'submitted');
      const [fields, assets, measurements] = await Promise.all([
        store.listFields(id), store.listAssets(id), store.listMeasurements(id),
      ]);
      const detail = {
        session: toCaptureSession(row),
        fields: fields.map(toCaptureField),
        assets: assets.map(toCaptureAsset),
        measurements: measurements.map(toCaptureMeasurement),
      };
      const completeness = validateCompleteness(detail);
      if (completeness.errors.length) {
        throw new CaptureValidationError('CAPTURE_INCOMPLETE', 'The capture is not complete enough to submit', {
          errors: completeness.errors, warnings: completeness.warnings,
        });
      }
      const snapshot = { ...detail, completeness, submittedBy: actor.id, snapshotAt: new Date().toISOString() };
      return store.transaction(async () => {
        const updated = await store.applySubmission(id, row.status, snapshot, completeness.score);
        await store.appendAudit(audit(actor, outcome.audit, id, null, {
          ...outcome.metadata, completenessScore: completeness.score, warningCount: completeness.warnings.length,
        }));
        return {
          session: toCaptureSession(updated ?? { ...row, status: 'submitted', completeness: completeness.score }),
          completeness,
        };
      });
    },

    // Review queue: submitted-and-beyond sessions the actor may review.
    // Same row scoping as everything else — an owner reviews its own
    // tenant's submissions (single-seat tenancy, D-003), superadmin sees
    // all tenants. Capability enforcement happens at the route.
    async listReviewQueue(actor, filters = {}) {
      const status = filters.status && REVIEW_QUEUE_STATUSES.includes(filters.status) ? filters.status : null;
      const rows = await store.listReviewQueue({
        ownerId: actor.id,
        includeAllOwners: actor.role === 'superadmin',
        status,
        limit: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
      });
      return rows.map(toCaptureSession);
    },

    async startReview(actor, id) {
      return this.transitionSession(actor, id, 'in_review');
    },

    // approve | request_changes | reject. The state machine supplies the
    // capability check, reason requirements, and audit action; this just
    // maps the reviewer's verb onto the target status.
    async decideReview(actor, id, decision, reason) {
      const toStatus = REVIEW_DECISIONS[decision];
      if (!toStatus) {
        throw new CaptureValidationError('CAPTURE_DECISION_INVALID',
          'Decision must be approve, request_changes, or reject', { decision });
      }
      return this.transitionSession(actor, id, toStatus, reason);
    },

    async addComment(actor, sessionId, body) {
      const text = String(body || '').trim();
      if (!text || text.length > 4000) {
        throw new CaptureValidationError('CAPTURE_COMMENT_INVALID', 'A comment needs 1-4000 characters');
      }
      const row = await store.getSession(sessionId);
      assertVisible(actor, row);
      if (row.status === 'draft' || row.status === 'archived') {
        throw new CaptureValidationError('CAPTURE_COMMENT_INVALID',
          `Comments are not available on a ${row.status} capture`, { status: row.status });
      }
      const change = { id: randomUUID(), sessionId, authorId: actor.id, body: text };
      const created = await store.insertComment(change);
      return { comment: toCaptureComment(created ?? change) };
    },

    async transitionSession(actor, id, toStatus, reason) {
      const row = await store.getSession(id);
      assertVisible(actor, row);
      const outcome = assertTransition(actor.role, row.status, toStatus, reason);
      return store.transaction(async () => {
        const updated = await store.updateSessionStatus(id, row.status, toStatus);
        await store.appendAudit(audit(actor, outcome.audit, id, outcome.reason, outcome.metadata));
        return { session: toCaptureSession(updated ?? { ...row, status: toStatus }) };
      });
    },

    // Publish an approved capture as a tenant-private Library product.
    // Deliberately two steps so a failed Library write retries without
    // re-review: approved -> publishing (audited claim), then the record
    // insert + publishing -> published atomically. Idempotent throughout —
    // an existing record for this session (external_reference) is reused,
    // and publishing a published session returns the stored result.
    async publishSession(actor, id) {
      let row = await store.getSession(id);
      assertVisible(actor, row);

      if (row.status === 'published') {
        const existing = await store.findLibraryRecordByReference(captureExternalReference(id));
        return {
          session: toCaptureSession(row),
          product: existing ? toStudioProduct(existing, existing.details || {}) : null,
          alreadyPublished: true,
        };
      }

      // Claim (or re-claim for retry) — both transitions are audited and
      // capability-checked by the state machine.
      const claim = assertTransition(actor.role, row.status, 'publishing');
      await store.transaction(async () => {
        const updated = await store.updateSessionStatus(id, row.status, 'publishing');
        await store.appendAudit(audit(actor, claim.audit, id, null, claim.metadata));
        row = updated ?? { ...row, status: 'publishing' };
      });

      const [fields, assets] = await Promise.all([store.listFields(id), store.listAssets(id)]);
      const detail = {
        session: toCaptureSession(row),
        fields: fields.map(toCaptureField),
        assets: assets.map(toCaptureAsset),
      };

      let record = await store.findLibraryRecordByReference(captureExternalReference(id));
      const finish = assertTransition(actor.role, 'publishing', 'published');
      let attemptedCode = null;
      let result;
      try {
        result = await store.transaction(async () => {
          if (!record) {
            const publication = buildLibraryPublication(detail);
            attemptedCode = publication.record.code;
            record = await store.insertLibraryPublication({
              id: randomUUID(),
              version: 1,
              createdBy: actor.id,
              ...publication.record,
            }, publication.details);
          }
          const recordVersion = Number(record.version || 1);
          const updated = await store.updateSessionPublished(id, record.id, recordVersion);
          await store.appendAudit(audit(actor, finish.audit, id, null, {
            ...finish.metadata, recordId: record.id, recordVersion,
          }));
          return {
            session: toCaptureSession(updated ?? { ...row, status: 'published', published_record_id: record.id, published_version: recordVersion }),
            product: toStudioProduct(record, record.details || {}),
            alreadyPublished: false,
          };
        });
      } catch (error) {
        // A color/product record's code (manufacturer color code / SKU) is
        // unique per tenant+record type (library_record_code_scope_unique).
        // Two independent scans can plausibly share the same manufacturer
        // code (e.g. re-scanning the same nominal color) — surface that as
        // a clear, actionable validation error instead of letting the raw
        // Postgres constraint violation propagate as an opaque 500.
        if (error?.code === '23505' && error?.constraint === 'library_record_code_scope_unique') {
          throw new CaptureValidationError('CAPTURE_PUBLISH_DUPLICATE_CODE',
            `A Library record with the code "${attemptedCode}" already exists for your account. Use a different code, or edit the existing record instead of publishing a new one.`,
            { code: attemptedCode });
        }
        throw error;
      }
      return result;
    },

    // Studio-readable published products: approved, active, tenant-scoped
    // Library records (any source, not only capture) as the Studio DTO.
    async listPublishedProducts(actor, filters = {}) {
      const rows = await store.listPublishedLibraryProducts({
        tenantId: actor.id,
        includeAllTenants: actor.role === 'superadmin',
        limit: Math.min(100, Math.max(1, Number(filters.limit) || 50)),
      });
      return rows.map((row) => toStudioProduct(row, row.details || {}));
    },

    async archiveSession(actor, id, reason) {
      return this.transitionSession(actor, id, 'archived', reason);
    },
  };
}

// Neon store. Same queued-transaction idiom as libraryService.js's store:
// inside store.transaction(work), writes are queued and committed atomically
// via sql.transaction(); reads outside a transaction run immediately.
export function createNeonCaptureStore(sql) {
  let pendingQueries = null;
  const execute = async (query, optimisticValue) => {
    if (pendingQueries) {
      pendingQueries.push(query);
      return optimisticValue;
    }
    const rows = await query;
    return rows[0] ?? optimisticValue;
  };

  return {
    async transaction(work) {
      if (pendingQueries) throw new Error('Nested Capture transactions are not supported');
      pendingQueries = [];
      try {
        const value = await work();
        const queries = pendingQueries;
        pendingQueries = null;
        await sql.transaction(queries);
        return value;
      } catch (error) {
        pendingQueries = null;
        throw error;
      }
    },
    async listSessions({ ownerId, includeAllOwners, status, limit }) {
      return sql`select * from capture_sessions
        where (${Boolean(includeAllOwners)} or owner_id = ${ownerId})
          and (${status || null}::text is null or status = ${status || null})
          and status <> 'archived'
        order by updated_at desc limit ${limit}`;
    },
    async getSession(id) {
      const [row] = await sql`select * from capture_sessions where id = ${id}`;
      return row || null;
    },
    async getSessionByClientRef(ownerId, clientRef) {
      const [row] = await sql`select * from capture_sessions
        where owner_id = ${ownerId} and client_ref = ${clientRef}`;
      return row || null;
    },
    async createSession(change) {
      const query = sql`insert into capture_sessions
        (id, owner_id, client_ref, capture_type, category, title, status, current_step, completeness)
        values (${change.id}, ${change.ownerId}, ${change.clientRef}, ${change.captureType},
                ${change.category}, ${change.title}, ${change.status}, ${change.currentStep}, ${change.completeness})
        on conflict (owner_id, client_ref) where client_ref is not null do nothing
        returning *`;
      return execute(query, change);
    },
    async updateSessionContent(id, patch) {
      const query = sql`update capture_sessions set
          title = case when ${'title' in patch} then ${patch.title ?? null} else title end,
          category = case when ${'category' in patch} then ${patch.category ?? null} else category end,
          current_step = case when ${'currentStep' in patch} then ${patch.currentStep ?? null} else current_step end,
          item_type = case when ${'itemType' in patch} then ${patch.itemType ?? null} else item_type end,
          tags = case when ${'tags' in patch} then ${JSON.stringify(patch.tags ?? [])}::jsonb else tags end,
          updated_at = now()
        where id = ${id} returning *`;
      return execute(query, null);
    },
    async applySubmission(id, fromStatus, snapshot, completeness) {
      const query = sql`update capture_sessions set status = 'submitted',
          submitted_snapshot = ${JSON.stringify(snapshot)}::jsonb,
          completeness = ${completeness},
          submitted_at = now(),
          updated_at = now()
        where id = ${id} and status = ${fromStatus} returning *`;
      return execute(query, null);
    },
    // Guarded by the current status so a concurrent transition can't be
    // silently overwritten — the stale write updates zero rows.
    async updateSessionStatus(id, fromStatus, toStatus) {
      const query = sql`update capture_sessions set status = ${toStatus},
          submitted_at = case when ${toStatus === 'submitted'} then now() else submitted_at end,
          updated_at = now()
        where id = ${id} and status = ${fromStatus} returning *`;
      return execute(query, null);
    },
    async listFields(sessionId) {
      return sql`select * from capture_fields where session_id = ${sessionId} order by field_key`;
    },
    async listReviewQueue({ ownerId, includeAllOwners, status, limit }) {
      return sql`select * from capture_sessions
        where (${Boolean(includeAllOwners)} or owner_id = ${ownerId})
          and (${status || null}::text is null or status = ${status || null})
          and status in ('submitted','in_review','changes_requested','approved','publishing','published','rejected')
        order by submitted_at desc nulls last, updated_at desc limit ${limit}`;
    },
    async listMeasurements(sessionId) {
      return sql`select * from capture_measurements where session_id = ${sessionId} order by created_at`;
    },
    async getMeasurement(id) {
      const [row] = await sql`select * from capture_measurements where id = ${id}`;
      return row || null;
    },
    async insertMeasurement(change) {
      const query = sql`insert into capture_measurements
        (id, session_id, owner_id, feature, axis, value, unit, method, confidence, source_asset_id, confirmed_by, confirmed_at)
        values (${change.id}, ${change.sessionId}, ${change.ownerId}, ${change.feature}, ${change.axis},
                ${change.value}, ${change.unit}, ${change.method}, ${change.confidence},
                ${change.sourceAssetId}, ${change.confirmedBy}, now())
        returning *`;
      return execute(query, change);
    },
    async deleteMeasurement(id) {
      await sql`delete from capture_measurements where id = ${id}`;
    },
    async listTags({ ownerId, includeAllOwners }) {
      return sql`select * from capture_tags
        where (${Boolean(includeAllOwners)} or owner_id = ${ownerId})
        order by tag`;
    },
    async getTag(id) {
      const [row] = await sql`select * from capture_tags where id = ${id}`;
      return row || null;
    },
    async getTagByValue(ownerId, tag) {
      const [row] = await sql`select * from capture_tags where owner_id = ${ownerId} and tag = ${tag}`;
      return row || null;
    },
    async insertTag(change) {
      const query = sql`insert into capture_tags (id, owner_id, tag, created_by)
        values (${change.id}, ${change.ownerId}, ${change.tag}, ${change.createdBy})
        on conflict (owner_id, tag) do nothing
        returning *`;
      return execute(query, null);
    },
    async deleteTag(id) {
      await sql`delete from capture_tags where id = ${id}`;
    },
    async listComments(sessionId) {
      return sql`select c.*, coalesce(u.business_name, u.company_name, u.email) as author_label
        from capture_review_comments c
        left join users u on u.id = c.author_id
        where c.session_id = ${sessionId}
        order by c.created_at`;
    },
    async insertComment(change) {
      const query = sql`insert into capture_review_comments (id, session_id, author_id, body)
        values (${change.id}, ${change.sessionId}, ${change.authorId}, ${change.body})
        returning *`;
      return execute(query, change);
    },
    async findLibraryRecordByReference(externalReference) {
      const [row] = await sql`select r.*,
          coalesce(
            (select row_to_json(d) from library_product_details d where d.record_id = r.id),
            (select row_to_json(d) from library_color_details d where d.record_id = r.id)
          ) as details
        from library_records r where r.external_reference = ${externalReference}`;
      return row || null;
    },
    // Asset-graph mapping (D-076): which details table a record gets is
    // decided by its record_type — 'product' keeps the original
    // library_product_details insert; 'color' writes library_color_details
    // (mirroring libraryService.js's queueTypedDetails for manually-created
    // Library records); 'texture' has no dedicated details table yet, so
    // nothing is written beyond library_records itself (its fields all live
    // in metadata.captureTexture).
    async insertLibraryPublication(change, details) {
      const query = sql`insert into library_records
        (id, record_type, scope, tenant_id, name, code, description, lifecycle_status, review_status,
         quality_level, version, source_type, external_reference, thumbnail_url, metadata, created_by, updated_by)
        values (${change.id}, ${change.recordType}, ${change.scope}, ${change.tenantId}, ${change.name},
                ${change.code}, ${change.description}, ${change.lifecycleStatus}, ${change.reviewStatus},
                ${change.qualityLevel}, ${change.version}, ${change.sourceType}, ${change.externalReference},
                ${change.thumbnailUrl}, ${JSON.stringify(change.metadata || {})}::jsonb, ${change.createdBy}, ${change.createdBy})
        returning *`;
      const detailsQuery = change.recordType === 'color'
        ? sql`insert into library_color_details (record_id, color_code, hex, series, legacy_color_id)
            values (${change.id}, ${details.colorCode ?? null}, ${details.hex ?? null}, ${details.series ?? null}, ${details.legacyColorId ?? null})
            on conflict (record_id) do nothing`
        : change.recordType === 'product'
          ? sql`insert into library_product_details (record_id, unit, price, application_metadata)
              values (${change.id}, ${details.unit}, ${details.price}, ${JSON.stringify(details.applicationMetadata || {})}::jsonb)
              on conflict (record_id) do nothing`
          : null;
      if (pendingQueries) {
        pendingQueries.push(query);
        if (detailsQuery) pendingQueries.push(detailsQuery);
        return { ...change, details };
      }
      const row = await query;
      if (detailsQuery) await detailsQuery;
      return { ...(row[0] || change), details };
    },
    async updateSessionPublished(id, recordId, recordVersion) {
      const query = sql`update capture_sessions set status = 'published',
          published_record_id = ${recordId}, published_version = ${recordVersion}, updated_at = now()
        where id = ${id} and status = 'publishing' returning *`;
      return execute(query, null);
    },
    async listPublishedLibraryProducts({ tenantId, includeAllTenants, limit }) {
      return sql`select r.*,
          (select row_to_json(d) from library_product_details d where d.record_id = r.id) as details
        from library_records r
        where r.record_type = 'product' and r.review_status = 'approved' and r.lifecycle_status = 'active'
          and (r.scope = 'global' or ${Boolean(includeAllTenants)} or r.tenant_id = ${tenantId})
        order by r.updated_at desc limit ${limit}`;
    },
    async listAssets(sessionId) {
      return sql`select * from capture_assets where session_id = ${sessionId} order by created_at`;
    },
    async getAsset(id) {
      const [row] = await sql`select * from capture_assets where id = ${id}`;
      return row || null;
    },
    async insertAsset(change) {
      const query = sql`insert into capture_assets
        (id, session_id, owner_id, purpose, classification, source_asset_id, url, checksum,
         mime_type, size_bytes, width, height, capture_metadata, upload_status)
        values (${change.id}, ${change.sessionId}, ${change.ownerId}, ${change.purpose},
                ${change.classification}, ${change.sourceAssetId}, ${change.url}, ${change.checksum},
                ${change.mimeType}, ${change.sizeBytes}, ${change.width}, ${change.height},
                ${JSON.stringify(change.captureMetadata || {})}::jsonb, 'complete')
        returning *`;
      return execute(query, change);
    },
    async deleteAssetWithDerivatives(id) {
      await sql`delete from capture_assets where source_asset_id = ${id}`;
      await sql`delete from capture_assets where id = ${id}`;
    },
    // The ONLY write replaceAsset makes to the superseded row — touches
    // superseded_by alone, leaving url/checksum/capture_metadata/timestamps
    // exactly as originally accepted (D-039).
    async markSuperseded(assetId, supersededByAssetId) {
      await sql`update capture_assets set superseded_by = ${supersededByAssetId} where id = ${assetId}`;
    },
    // One immutable row per Claude guidance attempt (D-044) — append-only,
    // no update path. `findings` is only ever populated for status
    // 'advisory'; every other status stores a non-sensitive `diagnostic`
    // instead, never the raw response or any image bytes.
    async insertClaudeAnalysis(change) {
      const query = sql`insert into capture_claude_analyses
        (id, session_id, owner_id, status, model, prompt_version, schema_version, source_asset_ids, findings, diagnostic)
        values (${change.id}, ${change.sessionId}, ${change.ownerId}, ${change.status}, ${change.model},
                ${change.promptVersion}, ${change.schemaVersion}, ${JSON.stringify(change.sourceAssetIds || [])}::jsonb,
                ${change.findings ? JSON.stringify(change.findings) : null}::jsonb,
                ${JSON.stringify(change.diagnostic || {})}::jsonb)
        returning *`;
      return execute(query, change);
    },
    async listClaudeAnalyses(sessionId) {
      return sql`select * from capture_claude_analyses where session_id = ${sessionId} order by created_at desc`;
    },
    // R2.5 — one targeted UPDATE per call; only the field(s) actually
    // passed change, everything else on the row is untouched.
    async updateMaterialReadiness(id, patch) {
      const query = sql`update capture_sessions set
          material_zone_state = coalesce(${patch.materialZoneState ? JSON.stringify(patch.materialZoneState) : null}::jsonb, material_zone_state),
          texture_direction = coalesce(${patch.textureDirection ?? null}, texture_direction),
          studio_validation = coalesce(${patch.studioValidation ? JSON.stringify(patch.studioValidation) : null}::jsonb, studio_validation),
          updated_at = now()
        where id = ${id}
        returning *`;
      return execute(query, null);
    },
    async upsertField(sessionId, fieldKey, value) {
      const query = sql`insert into capture_fields (session_id, field_key, value)
        values (${sessionId}, ${fieldKey}, ${JSON.stringify(value)}::jsonb)
        on conflict (session_id, field_key)
        do update set value = excluded.value, updated_at = now()`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
    async appendAudit(event) {
      const query = sql`insert into superadmin_audit_events (actor_id, action, target_type, target_id, reason, metadata)
        values (${event.actorId}, ${event.action}, ${event.targetType}, ${event.targetId},
                ${event.reason}, ${JSON.stringify(event.metadata || {})}::jsonb)`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
  };
}
