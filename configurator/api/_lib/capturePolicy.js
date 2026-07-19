import { hasCapability } from './superadminPolicy.js';

// IronWrap Capture domain policy — statuses, transitions, and input
// validation shared by the API and tests. Pure module, no I/O, mirroring
// libraryPolicy.js. Client-side sync states (locally queued / syncing /
// ready to submit) are deliberately NOT here: they belong to the offline
// layer and never round-trip to the database (decision D-006).
export const CAPTURE_STATUSES = Object.freeze([
  'draft', 'submitted', 'in_review', 'changes_requested',
  'approved', 'publishing', 'published', 'rejected', 'archived',
]);
export const CAPTURE_TYPES = Object.freeze(['guided_product', 'quick', 'texture', 'color', 'profile', 'label']);
export const CAPTURE_CATEGORIES = Object.freeze([
  'roofing', 'siding', 'soffit', 'fascia', 'gutter', 'downspout', 'trim', 'accessory', 'other',
]);
// Editable = the contributor may still change draft content. Every other
// status is read-only for the contributor until a reviewer hands it back.
export const EDITABLE_STATUSES = Object.freeze(['draft', 'changes_requested']);
// Declared now (and enforced in the schema's CHECK constraints) so Stage 2's
// asset rows and Stage 3+'s machine-suggested fields land on a contract that
// already exists; nothing in Stage 1 writes them yet.
export const ASSET_PURPOSES = Object.freeze([
  'main', 'front', 'back', 'edge', 'surface', 'label', 'packaging', 'profile', 'installed', 'other',
]);
export const FIELD_SOURCES = Object.freeze(['manual', 'barcode', 'ocr', 'ai', 'imported', 'reviewer']);
export const ASSET_CLASSIFICATIONS = Object.freeze(['source', 'derived']);
// Single source of truth for what a capture image may be — api/upload.js
// enforces the same values when issuing the Blob upload token, and the
// finalize route re-checks them server-side (client metadata is a claim,
// not an authority).
export const CAPTURE_IMAGE_TYPES = Object.freeze([
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
]);
export const MAX_CAPTURE_IMAGE_BYTES = 15 * 1024 * 1024;

export class CaptureValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CaptureValidationError';
    this.code = code;
    this.details = details;
  }
}

// The full state machine, defined once. Each transition names the capability
// the actor must hold (ownership/row scoping is the service's job, not the
// policy's), whether a human-entered reason is mandatory, and the audit
// action recorded with it. `publishing -> publishing` is the explicit retry
// path: failed publication re-runs without re-approving unchanged data.
const TRANSITIONS = Object.freeze({
  'draft->submitted': { capability: 'capture.create', audit: 'capture.session.submitted' },
  'changes_requested->submitted': {
    capability: 'capture.create', audit: 'capture.session.submitted', metadata: { resubmission: true },
  },
  'submitted->in_review': { capability: 'capture.review', audit: 'capture.review.started' },
  'in_review->changes_requested': { capability: 'capture.review', requiresReason: true, audit: 'capture.review.changes_requested' },
  'in_review->approved': { capability: 'capture.review', audit: 'capture.review.approved' },
  'in_review->rejected': { capability: 'capture.review', requiresReason: true, audit: 'capture.review.rejected' },
  'approved->publishing': { capability: 'capture.publish.tenant', audit: 'capture.session.publishing' },
  'publishing->publishing': { capability: 'capture.publish.tenant', audit: 'capture.session.publish_retried' },
  'publishing->published': { capability: 'capture.publish.tenant', audit: 'capture.session.published' },
  'draft->archived': { capability: 'capture.create', audit: 'capture.session.archived' },
  'rejected->archived': { capability: 'capture.create', requiresReason: true, audit: 'capture.session.archived' },
  'published->archived': { capability: 'capture.create', requiresReason: true, audit: 'capture.session.archived' },
});

export function allowedTransitions() {
  return Object.keys(TRANSITIONS);
}

export function assertTransition(actorRole, fromStatus, toStatus, reason) {
  const rule = TRANSITIONS[`${fromStatus}->${toStatus}`];
  if (!rule) {
    throw new CaptureValidationError('CAPTURE_TRANSITION_INVALID',
      `Cannot move a capture from ${fromStatus} to ${toStatus}`, { fromStatus, toStatus });
  }
  if (!hasCapability(actorRole, rule.capability)) {
    throw new CaptureValidationError('CAPTURE_NOT_AUTHORIZED',
      'Not authorized for this capture transition', { capability: rule.capability });
  }
  const cleanReason = String(reason || '').trim();
  if (rule.requiresReason && !cleanReason) {
    throw new CaptureValidationError('CAPTURE_REASON_REQUIRED', 'A reason is required for this transition');
  }
  return {
    audit: rule.audit,
    reason: cleanReason || null,
    metadata: { fromStatus, toStatus, ...(rule.metadata || {}) },
  };
}

const clean = (value) => String(value ?? '').trim();

function enumValue(value, allowed, fallback, code) {
  const result = clean(value) || fallback;
  if (result !== null && !allowed.includes(result)) {
    throw new CaptureValidationError(code, `Unsupported value: ${result}`, { value: result });
  }
  return result;
}

export function normalizeCreateInput(input = {}) {
  return {
    captureType: enumValue(input.captureType, CAPTURE_TYPES, 'guided_product', 'CAPTURE_TYPE_INVALID'),
    category: enumValue(input.category, CAPTURE_CATEGORIES, null, 'CAPTURE_CATEGORY_INVALID'),
    title: clean(input.title).slice(0, 200) || null,
    clientRef: clean(input.clientRef).slice(0, 100) || null,
    currentStep: clean(input.currentStep).slice(0, 60) || null,
  };
}

// Finalize-upload input for one capture asset. The image itself already
// went straight to Blob storage via the signed direct-upload flow — this
// validates the metadata row we are about to trust. The URL must point at
// Vercel Blob (never an arbitrary external host), and a derived asset
// (thumbnail, crop) must name the source it came from so originals are
// never silently replaced.
export function normalizeAssetInput(input = {}) {
  const purpose = enumValue(input.purpose, ASSET_PURPOSES, '', 'CAPTURE_ASSET_PURPOSE_INVALID');
  const classification = enumValue(input.classification, ASSET_CLASSIFICATIONS, 'source', 'CAPTURE_ASSET_CLASSIFICATION_INVALID');
  const sourceAssetId = clean(input.sourceAssetId) || null;
  if (classification === 'derived' && !sourceAssetId) {
    throw new CaptureValidationError('CAPTURE_ASSET_SOURCE_REQUIRED', 'A derived asset must reference its source asset');
  }
  if (classification === 'source' && sourceAssetId) {
    throw new CaptureValidationError('CAPTURE_ASSET_SOURCE_INVALID', 'A source asset cannot reference another source');
  }
  let url;
  try {
    url = new URL(clean(input.url));
  } catch {
    throw new CaptureValidationError('CAPTURE_ASSET_URL_INVALID', 'Asset URL must be a valid URL');
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.blob.vercel-storage.com')) {
    throw new CaptureValidationError('CAPTURE_ASSET_URL_INVALID', 'Asset URL must be a Vercel Blob URL', { host: url.hostname });
  }
  const mimeType = clean(input.mimeType).toLowerCase();
  if (!CAPTURE_IMAGE_TYPES.includes(mimeType)) {
    throw new CaptureValidationError('CAPTURE_ASSET_TYPE_INVALID', `Unsupported image type: ${mimeType || '(none)'}`);
  }
  const sizeBytes = Number(input.sizeBytes);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_CAPTURE_IMAGE_BYTES) {
    throw new CaptureValidationError('CAPTURE_ASSET_SIZE_INVALID',
      `Image size must be between 1 byte and ${MAX_CAPTURE_IMAGE_BYTES} bytes`);
  }
  const dimension = (value, field) => {
    if (value == null || value === '') return null;
    const result = Number(value);
    if (!Number.isInteger(result) || result <= 0 || result > 50000) {
      throw new CaptureValidationError('CAPTURE_ASSET_DIMENSION_INVALID', `${field} must be a positive integer`);
    }
    return result;
  };
  return {
    purpose,
    classification,
    sourceAssetId,
    url: url.toString(),
    checksum: clean(input.checksum).slice(0, 128) || null,
    mimeType,
    sizeBytes,
    width: dimension(input.width, 'width'),
    height: dimension(input.height, 'height'),
    captureMetadata: input.captureMetadata && typeof input.captureMetadata === 'object' && !Array.isArray(input.captureMetadata)
      ? input.captureMetadata : {},
  };
}

// Draft-content patch (title/category/step plus free-form field values).
// Only keys present in the patch are touched; `fields` upserts by key.
export function normalizeDraftPatch(input = {}) {
  const patch = {};
  if ('title' in input) patch.title = clean(input.title).slice(0, 200) || null;
  if ('category' in input) patch.category = enumValue(input.category, CAPTURE_CATEGORIES, null, 'CAPTURE_CATEGORY_INVALID');
  if ('currentStep' in input) patch.currentStep = clean(input.currentStep).slice(0, 60) || null;
  if ('fields' in input) {
    const fields = input.fields;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new CaptureValidationError('CAPTURE_FIELDS_INVALID', 'fields must be an object of key/value pairs');
    }
    const entries = Object.entries(fields);
    if (entries.length > 100) {
      throw new CaptureValidationError('CAPTURE_FIELDS_INVALID', 'Too many fields in one update');
    }
    patch.fields = entries.map(([key, value]) => {
      const fieldKey = clean(key);
      if (!fieldKey || fieldKey.length > 100) {
        throw new CaptureValidationError('CAPTURE_FIELDS_INVALID', 'Field keys must be 1-100 characters');
      }
      return { fieldKey, value: value === undefined ? null : value };
    });
  }
  if (!Object.keys(patch).length) {
    throw new CaptureValidationError('CAPTURE_PATCH_EMPTY', 'Nothing to update');
  }
  return patch;
}
