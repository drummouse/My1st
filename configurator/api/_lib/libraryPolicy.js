export const RECORD_TYPES = Object.freeze(['product', 'profile', 'color', 'texture', 'category', 'manufacturer', 'supplier', 'collection', 'catalog']);
export const SCOPES = Object.freeze(['global', 'tenant']);
export const LIFECYCLE_STATUSES = Object.freeze(['active', 'archived']);
export const REVIEW_STATUSES = Object.freeze(['draft', 'pending_review', 'approved', 'rejected']);
export const QUALITY_LEVELS = Object.freeze(['test', 'low', 'standard', 'verified']);
export const SOURCE_TYPES = Object.freeze(['manual', 'legacy_migration', 'import', 'manufacturer', 'supplier', 'capture']);
export const RELATIONSHIP_TYPES = Object.freeze([
  'categorized_as', 'manufactured_by', 'supplied_by', 'included_in_collection',
  'included_in_catalog', 'compatible_with', 'replaces', 'related_to',
]);

export class LibraryValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'LibraryValidationError';
    this.code = code;
    this.details = details;
  }
}

const allowedCompatibility = new Set([
  'product:profile', 'profile:product', 'product:color',
  'color:product', 'profile:color', 'color:profile',
]);
const relationTargets = {
  categorized_as: new Set(['category']),
  manufactured_by: new Set(['manufacturer']),
  supplied_by: new Set(['supplier']),
  included_in_collection: new Set(['collection']),
  included_in_catalog: new Set(['catalog']),
};
const clean = (value) => String(value ?? '').trim();

function enumValue(value, allowed, fallback, code) {
  const result = clean(value || fallback);
  if (!allowed.includes(result)) {
    throw new LibraryValidationError(code, `Unsupported value: ${result}`, { value: result });
  }
  return result;
}

function externalUrl(value, field) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
    return parsed.toString();
  } catch {
    throw new LibraryValidationError('LIBRARY_URL_INVALID', `${field} must be an HTTP(S) URL`, { field });
  }
}

export function normalizeLibraryRecord(input = {}, actorTenantId = null) {
  const scope = enumValue(input.scope, SCOPES, 'tenant', 'LIBRARY_SCOPE_INVALID');
  const suppliedTenantId = clean(input.tenantId);
  const tenantId = scope === 'tenant' ? suppliedTenantId || clean(actorTenantId) : null;
  if ((scope === 'tenant' && !tenantId) || (scope === 'global' && suppliedTenantId)) {
    throw new LibraryValidationError(
      'LIBRARY_SCOPE_INVALID',
      'Tenant scope requires one matching tenant; global scope forbids one',
    );
  }
  if (scope === 'tenant' && actorTenantId && tenantId !== clean(actorTenantId)) {
    throw new LibraryValidationError('LIBRARY_SCOPE_INVALID', 'Tenant does not match actor scope');
  }
  const name = clean(input.name);
  if (!name) throw new LibraryValidationError('LIBRARY_NAME_REQUIRED', 'Name is required');
  return {
    recordType: enumValue(input.recordType, RECORD_TYPES, '', 'LIBRARY_TYPE_INVALID'),
    scope,
    tenantId,
    name,
    code: clean(input.code) || null,
    description: clean(input.description) || null,
    lifecycleStatus: enumValue(input.lifecycleStatus, LIFECYCLE_STATUSES, 'active', 'LIBRARY_LIFECYCLE_INVALID'),
    reviewStatus: enumValue(input.reviewStatus, REVIEW_STATUSES, 'draft', 'LIBRARY_REVIEW_INVALID'),
    qualityLevel: enumValue(input.qualityLevel, QUALITY_LEVELS, 'test', 'LIBRARY_QUALITY_INVALID'),
    sourceType: enumValue(input.sourceType, SOURCE_TYPES, 'manual', 'LIBRARY_SOURCE_INVALID'),
    externalReference: clean(input.externalReference) || null,
    sourceUrl: externalUrl(input.sourceUrl, 'sourceUrl'),
    attribution: clean(input.attribution) || null,
    thumbnailUrl: externalUrl(input.thumbnailUrl, 'thumbnailUrl'),
    textureUrl: externalUrl(input.textureUrl, 'textureUrl'),
    geometryUrl: externalUrl(input.geometryUrl, 'geometryUrl'),
    knowledgeSpaceId: input.knowledgeSpaceId || null,
    metadata: input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata : {},
  };
}

export function validateRelationship(sourceType, targetType, relationshipType) {
  if (!RECORD_TYPES.includes(sourceType)
    || !RECORD_TYPES.includes(targetType)
    || !RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'Unknown relationship contract');
  }
  if (relationshipType === 'compatible_with'
    && !allowedCompatibility.has(`${sourceType}:${targetType}`)) {
    throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'Unsupported compatibility pair');
  }
  if (relationTargets[relationshipType] && !relationTargets[relationshipType].has(targetType)) {
    throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'Unsupported relationship target');
  }
}

export function assertNoCategoryCycle(edges, sourceId, targetId) {
  if (sourceId === targetId) {
    throw new LibraryValidationError('LIBRARY_CATEGORY_CYCLE', 'A category cannot be its own parent');
  }
  const parents = new Map(edges.map((edge) => [edge.sourceId, edge.targetId]));
  parents.set(sourceId, targetId);
  const seen = new Set([sourceId]);
  for (let cursor = targetId; cursor; cursor = parents.get(cursor)) {
    if (seen.has(cursor)) {
      throw new LibraryValidationError('LIBRARY_CATEGORY_CYCLE', 'Category parent would create a cycle');
    }
    seen.add(cursor);
  }
}
