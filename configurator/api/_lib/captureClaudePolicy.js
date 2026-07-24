// Claude semantic adaptive-guidance contract (R2.4) — pure, no I/O, no
// network. Builds the structured request the server sends and validates
// the structured response before anything from it is ever persisted or
// shown to a user (§17: "Do not persist unvalidated Claude output").
//
// Claude's authorized role here is strictly advisory (§16): identify
// visible/hidden/ambiguous features, explain why another shot would help,
// and recommend one additional-shot request in the exact §9 prompt-contract
// shape already used by the deterministic SHOT_GUIDES. Claude is never
// authoritative for scale, measurements, coordinates, geometry, mapping,
// mandatory-evidence completion, permissions, review, or publication — this
// module enforces that boundary structurally, not just by convention.

export const CLAUDE_GUIDANCE_SCHEMA_VERSION = 1;
export const CLAUDE_GUIDANCE_PROMPT_VERSION = 'capture-adaptive-shot-v1';

const TEXT_MAX = 400;
const FEATURE_MAX = 150;
const FEATURE_LIST_MAX = 6;
const REDUNDANT_LIST_MAX = 20;
const SHOT_REQUEST_TEXT_MAX = 200;
const SHOT_REQUEST_FIELDS = ['position', 'angle', 'distance', 'orientation', 'requiredFeature', 'reason'];

// Everything Claude's response is allowed to contain. Anything else is an
// unsupported key (§17: "Reject unsupported keys").
const ALLOWED_TOP_KEYS = new Set(['unclearFeatures', 'shotRequest', 'redundantAssetIds', 'reviewerSummary', 'confidence']);

// Fields that must NEVER appear anywhere in Claude's output — their mere
// presence (at any nesting depth) means the response is asserting
// something Claude has no authority over, so the WHOLE response is
// rejected rather than sanitized field-by-field. This is defense in depth:
// the API call itself is constrained to ALLOWED_TOP_KEYS via a tool schema,
// but a malformed or unexpected response must never be silently trusted.
const FORBIDDEN_KEYS = [
  'measurement', 'measurements', 'value', 'unit', 'scale', 'coordinates',
  'geometry', 'mesh', 'uv', 'mapping', 'coverageWidth', 'repeatWidth',
  'bendAngle', 'approval', 'approved', 'permission', 'permissions',
  'publish', 'published', 'reviewStatus', 'tenantId', 'itemType', 'tags',
  'applications', 'classification', 'complete', 'completeness',
];

export class CaptureClaudePolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'CaptureClaudePolicyError';
    this.code = code;
    this.details = details;
  }
}

function boundedText(value, max = TEXT_MAX) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function findForbiddenKey(value, path = '') {
  if (!value || typeof value !== 'object') return null;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) return `${path}${key}`;
    const nested = findForbiddenKey(value[key], `${path}${key}.`);
    if (nested) return nested;
  }
  return null;
}

function normalizeShotRequest(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new CaptureClaudePolicyError('CLAUDE_SHOT_REQUEST_INVALID', 'shotRequest must be an object');
  }
  const normalized = {};
  for (const field of SHOT_REQUEST_FIELDS) {
    const text = boundedText(input[field], SHOT_REQUEST_TEXT_MAX);
    if (!text) {
      throw new CaptureClaudePolicyError('CLAUDE_SHOT_REQUEST_INCOMPLETE',
        `shotRequest is missing required field: ${field}`, { field });
    }
    normalized[field] = text;
  }
  if (typeof input.rulerVisible !== 'boolean') {
    throw new CaptureClaudePolicyError('CLAUDE_SHOT_REQUEST_INCOMPLETE',
      'shotRequest.rulerVisible must be a boolean (ruler/calibration visibility requirement)');
  }
  normalized.rulerVisible = input.rulerVisible;
  return normalized;
}

// Server-built — never trusts the client for anything beyond which session
// to build it for. Only sends what Claude needs to do its authorized job:
// which shots exist, their requested pose, and the deterministic findings
// already computed for them (so Claude isn't asked to re-derive blur/glare
// itself). Calibration is included only as units/known-feature name — never
// as something Claude is asked to validate or restate authoritatively.
export function buildClaudeGuidanceRequest({ session, acceptedAssets = [], calibration = null, measurementCount = 0 }) {
  return {
    schemaVersion: CLAUDE_GUIDANCE_SCHEMA_VERSION,
    promptVersion: CLAUDE_GUIDANCE_PROMPT_VERSION,
    sessionId: session.id,
    calibration: calibration ? {
      units: calibration.units,
      knownFeature: calibration.knownMeasurement?.feature ?? null,
    } : null,
    acceptedAssets: acceptedAssets.map((asset) => ({
      assetId: asset.id,
      purpose: asset.purpose,
      requestedPose: asset.captureMetadata?.requestedPose ?? asset.capture_metadata?.requestedPose ?? null,
      deterministicFindings: (asset.captureMetadata?.deterministicQuality ?? asset.capture_metadata?.deterministicQuality)?.findings ?? [],
    })),
    measurementCount,
  };
}

// Validates and normalizes ONE raw Claude response. Throws
// CaptureClaudePolicyError on any violation; the caller (captureService)
// catches this and falls back to deterministic guidance — an unvalidated
// response is never persisted or shown (§17).
export function validateClaudeGuidanceResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CaptureClaudePolicyError('CLAUDE_RESPONSE_INVALID', 'Response must be an object');
  }

  const forbidden = findForbiddenKey(raw);
  if (forbidden) {
    throw new CaptureClaudePolicyError('CLAUDE_RESPONSE_FORBIDDEN_FIELD',
      `Response asserts a field Claude is not authorized for: ${forbidden}`, { field: forbidden });
  }

  const unsupported = Object.keys(raw).filter((key) => !ALLOWED_TOP_KEYS.has(key));
  if (unsupported.length) {
    throw new CaptureClaudePolicyError('CLAUDE_RESPONSE_UNSUPPORTED_KEYS',
      `Response contains unsupported keys: ${unsupported.join(', ')}`, { keys: unsupported });
  }

  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new CaptureClaudePolicyError('CLAUDE_CONFIDENCE_INVALID', 'confidence must be a number between 0 and 1');
  }

  const unclearFeaturesRaw = Array.isArray(raw.unclearFeatures) ? raw.unclearFeatures : [];
  const unclearFeatures = unclearFeaturesRaw.slice(0, FEATURE_LIST_MAX).map((item) => ({
    feature: boundedText(item?.feature, FEATURE_MAX),
    explanation: boundedText(item?.explanation, TEXT_MAX),
  })).filter((item) => item.feature && item.explanation);

  const redundantAssetIds = Array.isArray(raw.redundantAssetIds)
    ? raw.redundantAssetIds.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 100).slice(0, REDUNDANT_LIST_MAX)
    : [];

  const reviewerSummary = boundedText(raw.reviewerSummary, TEXT_MAX);
  const shotRequest = normalizeShotRequest(raw.shotRequest);

  return {
    schemaVersion: CLAUDE_GUIDANCE_SCHEMA_VERSION,
    confidence,
    unclearFeatures,
    redundantAssetIds,
    reviewerSummary,
    shotRequest,
  };
}

// The exact tool/structured-output schema sent to the Anthropic API so the
// model is constrained to ALLOWED_TOP_KEYS at the API layer too — this is
// belt-and-suspenders with validateClaudeGuidanceResponse, not a substitute
// for it (a tool schema constrains generation; it doesn't guarantee the
// SDK/network layer hands back exactly what was asked for).
export const CLAUDE_GUIDANCE_TOOL_SCHEMA = Object.freeze({
  name: 'capture_adaptive_guidance',
  description: 'Structured, advisory semantic guidance for one IronWrap Capture profile-geometry scan. Never authoritative for scale, measurement, geometry, or evidence completion.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['confidence'],
    properties: {
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      unclearFeatures: {
        type: 'array',
        maxItems: FEATURE_LIST_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['feature', 'explanation'],
          properties: {
            feature: { type: 'string', maxLength: FEATURE_MAX },
            explanation: { type: 'string', maxLength: TEXT_MAX },
          },
        },
      },
      redundantAssetIds: { type: 'array', maxItems: REDUNDANT_LIST_MAX, items: { type: 'string', maxLength: 100 } },
      reviewerSummary: { type: 'string', maxLength: TEXT_MAX },
      shotRequest: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          position: { type: 'string', maxLength: SHOT_REQUEST_TEXT_MAX },
          angle: { type: 'string', maxLength: SHOT_REQUEST_TEXT_MAX },
          distance: { type: 'string', maxLength: SHOT_REQUEST_TEXT_MAX },
          orientation: { type: 'string', maxLength: SHOT_REQUEST_TEXT_MAX },
          requiredFeature: { type: 'string', maxLength: SHOT_REQUEST_TEXT_MAX },
          rulerVisible: { type: 'boolean' },
          reason: { type: 'string', maxLength: SHOT_REQUEST_TEXT_MAX },
        },
      },
    },
  },
});
