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
// 'profile_geometry' and 'color_finish' are the revised Scanner scan types
// (Slice R1); the earlier values stay valid so existing rows never violate
// the widened CHECK constraint.
export const CAPTURE_TYPES = Object.freeze([
  'guided_product', 'quick', 'texture', 'color', 'profile', 'label',
  'profile_geometry', 'color_finish',
]);
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
  // Profile Geometry shot views (Slice R1) — adaptive capture stores each
  // guided view under its position label.
  'left_end', 'right_end', 'top', 'bottom', 'iso_front_left', 'iso_front_right',
]);
export const MEASUREMENT_METHODS = Object.freeze(['manual', 'ruler', 'marker', 'inferred']);
export const MEASUREMENT_FEATURES_MAX = 60;
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
export const DIMENSION_UNITS = Object.freeze(['mm', 'cm', 'in', 'ft']);
// Categories where a repeating panel's coverage/exposure is part of the
// product's identity — a roofing or siding panel without its exposure
// cannot be estimated against, so it blocks submission for those
// categories only.
export const EXPOSURE_CATEGORIES = Object.freeze(['roofing', 'siding']);

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

// Profile Geometry guided shot plan (Slice R1): the initial guided set,
// plus one deterministic adaptive follow-up view. The adaptive request
// machinery (positions, distances, reasons) lives in captureEvidence.js;
// these constants are the single source of truth both it and the
// completeness gate read.
export const PROFILE_INITIAL_VIEWS = Object.freeze(['left_end', 'right_end', 'front', 'iso_front_left']);
export const PROFILE_ADAPTIVE_VIEW = 'back';

// Completeness validation, shared verbatim by client and server: this
// module is pure ESM, so CapturePanel bundles the exact function the
// submit endpoint runs — the two can never disagree (D-021). Errors block
// submission; warnings ride along so the reviewer sees what's thin. A
// `quick` capture only hard-requires the base identity (it exists to be
// visibly incomplete); a `guided_product` capture must be reviewable.
export function validateCompleteness({ session = {}, fields = [], assets = [], measurements = [] }) {
  const errors = [];
  const warnings = [];
  const field = (key) => fields.find((f) => (f.fieldKey ?? f.field_key) === key)?.value ?? null;
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
  // A superseded (replaced) source asset no longer counts as "the" photo
  // for its view — only the current, non-superseded one does (R2.2).
  const hasPhoto = (purpose) => assets.some((a) => a.purpose === purpose
    && (a.classification || 'source') === 'source'
    && !(a.supersededBy ?? a.superseded_by));
  const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
  const add = (list, code, message) => list.push({ code, message });
  const captureType = session.captureType ?? session.capture_type;

  // Profile Geometry scan (Slice R1): evidence-driven, no category or fixed
  // product-photo requirements — calibration, the guided view set, the
  // adaptive follow-up, and at least one confirmed real-world measurement.
  if (captureType === 'profile_geometry') {
    if (!hasText(session.title)) add(errors, 'TITLE_REQUIRED', 'Name the profile.');
    const calibration = field('calibration');
    if (!calibration || calibration.rulerConfirmed !== true || !positive(calibration.knownMeasurement?.value)) {
      add(errors, 'CALIBRATION_REQUIRED', 'Complete calibration: units, ruler placement, and one known measurement.');
    }
    const missingViews = [...PROFILE_INITIAL_VIEWS, PROFILE_ADAPTIVE_VIEW].filter((view) => !hasPhoto(view));
    if (missingViews.length) {
      add(errors, 'SHOT_COVERAGE_INCOMPLETE', `Capture the remaining views: ${missingViews.join(', ')}.`);
    }
    if (!measurements.length) {
      add(errors, 'MEASUREMENT_REQUIRED', 'Record at least one confirmed measurement.');
    }
    if (!hasText(field('description'))) add(warnings, 'DESCRIPTION_MISSING', 'A short description helps the reviewer.');
    const totalChecks = 5;
    const failed = errors.length + warnings.length;
    return { errors, warnings, score: Math.max(0, Math.round(100 * (totalChecks - Math.min(failed, totalChecks)) / totalChecks)) };
  }

  const guided = captureType !== 'quick';
  const category = session.category || null;

  if (!hasText(session.title)) add(errors, 'TITLE_REQUIRED', 'Give the product a name.');
  if (!category) add(errors, 'CATEGORY_REQUIRED', 'Choose a product category.');
  if (!hasPhoto('main')) add(errors, 'MAIN_PHOTO_REQUIRED', 'Add a main photo of the product.');

  const identity = hasText(field('manufacturer')) || hasText(field('sku'));
  if (!identity) {
    add(guided ? errors : warnings, 'IDENTITY_REQUIRED', 'Enter a manufacturer or a SKU so the product can be identified.');
  }

  const dimensions = field('dimensions') || {};
  const anyDimension = ['width', 'length', 'thickness'].some((key) => positive(dimensions[key]));
  if (!DIMENSION_UNITS.includes(dimensions.unit) || !anyDimension) {
    add(guided ? errors : warnings, 'DIMENSIONS_REQUIRED', 'Enter at least one measured dimension with its unit.');
  }

  if (category && EXPOSURE_CATEGORIES.includes(category)) {
    const coverage = field('coverage') || {};
    if (!positive(coverage.exposure)) {
      add(guided ? errors : warnings, 'EXPOSURE_REQUIRED',
        'Roofing and siding panels need their exposure (visible width per course).');
    }
  }

  if (!hasPhoto('surface')) add(warnings, 'SURFACE_PHOTO_MISSING', 'A surface close-up helps texture review.');
  if (!hasPhoto('label')) add(warnings, 'LABEL_PHOTO_MISSING', 'A label/packaging photo speeds up identification.');
  if (!hasText(field('description'))) add(warnings, 'DESCRIPTION_MISSING', 'A short description helps the reviewer.');
  const color = field('color') || {};
  if (!hasText(color.hex) && !hasText(color.name)) {
    add(warnings, 'COLOR_MISSING', 'Add an approximate color sample or color name.');
  }

  const totalChecks = 9;
  const failed = errors.length + warnings.length;
  return {
    errors,
    warnings,
    score: Math.max(0, Math.round(100 * (totalChecks - Math.min(failed, totalChecks)) / totalChecks)),
  };
}

// Calibration evidence (Slice R1): units, one user-confirmed known
// measurement, and ruler-adjacency confirmation, versioned so later
// marker/CV evidence extends rather than replaces it. Stored as the
// 'calibration' capture field.
export const CALIBRATION_SCHEMA_VERSION = 1;
export function normalizeCalibration(input = {}) {
  const unit = clean(input.units);
  if (!DIMENSION_UNITS.includes(unit)) {
    throw new CaptureValidationError('CAPTURE_CALIBRATION_INVALID', 'Choose measurement units (mm, cm, in, ft)');
  }
  const known = input.knownMeasurement || {};
  const value = Number(known.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CaptureValidationError('CAPTURE_CALIBRATION_INVALID', 'Enter one known measurement of the sample');
  }
  const feature = clean(known.feature).slice(0, MEASUREMENT_FEATURES_MAX);
  if (!feature) {
    throw new CaptureValidationError('CAPTURE_CALIBRATION_INVALID', 'Name the feature the known measurement refers to');
  }
  if (input.rulerConfirmed !== true) {
    throw new CaptureValidationError('CAPTURE_CALIBRATION_INVALID',
      'Confirm the ruler is placed beside or touching the sample');
  }
  return {
    schemaVersion: CALIBRATION_SCHEMA_VERSION,
    units: unit,
    knownMeasurement: { feature, value, unit },
    rulerConfirmed: true,
    confirmedAt: new Date().toISOString(),
  };
}

// One real-world measurement row (supersedes the D-010 JSON-blob approach
// for scan sessions; the guided_product 'dimensions' field keeps working).
export function normalizeMeasurementInput(input = {}) {
  const feature = clean(input.feature).slice(0, MEASUREMENT_FEATURES_MAX);
  if (!feature) throw new CaptureValidationError('CAPTURE_MEASUREMENT_INVALID', 'Name the measured feature');
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new CaptureValidationError('CAPTURE_MEASUREMENT_INVALID', 'Measurement value must be a positive number');
  }
  const unit = clean(input.unit);
  if (!DIMENSION_UNITS.includes(unit)) {
    throw new CaptureValidationError('CAPTURE_MEASUREMENT_INVALID', 'Measurement unit must be mm, cm, in, or ft');
  }
  const method = clean(input.method) || 'manual';
  if (!MEASUREMENT_METHODS.includes(method)) {
    throw new CaptureValidationError('CAPTURE_MEASUREMENT_INVALID', `Unsupported method: ${method}`);
  }
  const axis = clean(input.axis) || null;
  if (axis && !['width', 'height', 'depth', 'length'].includes(axis)) {
    throw new CaptureValidationError('CAPTURE_MEASUREMENT_INVALID', `Unsupported axis: ${axis}`);
  }
  return {
    feature,
    axis,
    value,
    unit,
    method,
    confidence: input.confidence == null ? null : Math.max(0, Math.min(1, Number(input.confidence))),
    sourceAssetId: clean(input.sourceAssetId) || null,
  };
}

const REQUESTED_POSE_TEXT_MAX = 300;

// Bounded, best-effort normalization of the requested-pose contract (§9:
// position/angle/distance/orientation/requiredFeature/rulerVisible/reason)
// recorded alongside an accepted photo, so an asset's lineage always shows
// what shot was actually asked for — not just what was uploaded (R2.2).
// Deliberately not validated against SHOT_GUIDES verbatim so both the
// deterministic guide and a future Claude-sourced request populate it the
// same way.
function normalizeRequestedPose(pose) {
  if (!pose || typeof pose !== 'object') return null;
  const text = (value) => clean(value).slice(0, REQUESTED_POSE_TEXT_MAX) || null;
  const normalized = {
    position: text(pose.position),
    angle: text(pose.angle),
    distance: text(pose.distance),
    orientation: text(pose.orientation),
    requiredFeature: text(pose.requiredFeature),
    rulerVisible: pose.rulerVisible == null ? null : Boolean(pose.rulerVisible),
    reason: text(pose.reason),
  };
  return Object.values(normalized).some((value) => value !== null) ? normalized : null;
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
  const captureMetadata = input.captureMetadata && typeof input.captureMetadata === 'object' && !Array.isArray(input.captureMetadata)
    ? { ...input.captureMetadata } : {};
  const requestedPose = normalizeRequestedPose(input.requestedPose ?? captureMetadata.requestedPose);
  if (requestedPose) captureMetadata.requestedPose = requestedPose;
  else delete captureMetadata.requestedPose;

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
    captureMetadata,
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
