const value = (row, snake, camel, fallback = null) => row?.[snake] ?? row?.[camel] ?? fallback;
const json = (input, fallback = {}) => input && typeof input === 'object' ? input : fallback;

export function toLibraryRecord(row = {}) {
  return {
    id: value(row, 'id', 'id'),
    recordType: value(row, 'record_type', 'recordType'),
    scope: value(row, 'scope', 'scope'),
    tenantId: value(row, 'tenant_id', 'tenantId'),
    name: value(row, 'name', 'name'),
    code: value(row, 'code', 'code'),
    description: value(row, 'description', 'description'),
    lifecycleStatus: value(row, 'lifecycle_status', 'lifecycleStatus', 'active'),
    reviewStatus: value(row, 'review_status', 'reviewStatus', 'draft'),
    qualityLevel: value(row, 'quality_level', 'qualityLevel', 'test'),
    version: Number(value(row, 'version', 'version', 1)),
    sourceType: value(row, 'source_type', 'sourceType', 'manual'),
    externalReference: value(row, 'external_reference', 'externalReference'),
    sourceUrl: value(row, 'source_url', 'sourceUrl'),
    attribution: value(row, 'attribution', 'attribution'),
    thumbnailUrl: value(row, 'thumbnail_url', 'thumbnailUrl'),
    textureUrl: value(row, 'texture_url', 'textureUrl'),
    geometryUrl: value(row, 'geometry_url', 'geometryUrl'),
    knowledgeSpaceId: value(row, 'knowledge_space_id', 'knowledgeSpaceId'),
    communityTopicIds: [],
    metadata: json(value(row, 'metadata', 'metadata', {})),
    createdAt: value(row, 'created_at', 'createdAt'),
    updatedAt: value(row, 'updated_at', 'updatedAt'),
  };
}

export function toLibraryRelationship(row = {}) {
  return {
    id: value(row, 'id', 'id'),
    sourceRecordId: value(row, 'source_record_id', 'sourceRecordId'),
    targetRecordId: value(row, 'target_record_id', 'targetRecordId'),
    relationshipType: value(row, 'relationship_type', 'relationshipType'),
    lifecycleStatus: value(row, 'lifecycle_status', 'lifecycleStatus', 'active'),
    version: Number(value(row, 'version', 'version', 1)),
    attribution: value(row, 'attribution', 'attribution'),
    metadata: json(value(row, 'metadata', 'metadata', {})),
    createdAt: value(row, 'created_at', 'createdAt'),
    updatedAt: value(row, 'updated_at', 'updatedAt'),
  };
}

export function toLibraryDocument(row = {}) {
  return {
    id: value(row, 'id', 'id'), title: value(row, 'title', 'title'),
    documentType: value(row, 'document_type', 'documentType'), url: value(row, 'url', 'url'),
    publisher: value(row, 'publisher', 'publisher'), jurisdiction: value(row, 'jurisdiction', 'jurisdiction'),
    effectiveDate: value(row, 'effective_date', 'effectiveDate'), expiryDate: value(row, 'expiry_date', 'expiryDate'),
    language: value(row, 'language', 'language'), checksum: value(row, 'checksum', 'checksum'),
    reviewStatus: value(row, 'review_status', 'reviewStatus', 'draft'),
    isOfficial: Boolean(value(row, 'is_official', 'isOfficial', false)),
    metadata: json(value(row, 'metadata', 'metadata', {})),
    createdAt: value(row, 'created_at', 'createdAt'), updatedAt: value(row, 'updated_at', 'updatedAt'),
  };
}

export function toLibraryImportBatch(row = {}) {
  return {
    id: value(row, 'id', 'id'), scope: value(row, 'scope', 'scope'), tenantId: value(row, 'tenant_id', 'tenantId'),
    schemaVersion: Number(value(row, 'schema_version', 'schemaVersion', 1)), sourceFormat: value(row, 'source_format', 'sourceFormat'),
    status: value(row, 'status', 'status'), supportReference: value(row, 'support_reference', 'supportReference'),
    summary: json(value(row, 'summary', 'summary', {})), decisions: json(value(row, 'decisions', 'decisions', {})),
    createdAt: value(row, 'created_at', 'createdAt'), committedAt: value(row, 'committed_at', 'committedAt'),
  };
}

export function toLibraryMigration(row = {}) {
  return {
    id: value(row, 'id', 'id'), migrationKey: value(row, 'migration_key', 'migrationKey'),
    tenantId: value(row, 'tenant_id', 'tenantId'), version: Number(value(row, 'version', 'version', 1)),
    status: value(row, 'status', 'status'), summary: json(value(row, 'summary', 'summary', {})),
    errorCode: value(row, 'error_code', 'errorCode'), startedAt: value(row, 'started_at', 'startedAt'),
    completedAt: value(row, 'completed_at', 'completedAt'),
  };
}
