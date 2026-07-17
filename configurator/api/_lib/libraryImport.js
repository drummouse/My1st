import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { normalizeLibraryRecord, LibraryValidationError } from './libraryPolicy.js';
import { LIBRARY_SCHEMA_VERSION } from './libraryExchange.js';

const decisionsAllowed = new Set(['skip', 'update', 'create_separate']);
const comparableFields = [
  'recordType', 'scope', 'tenantId', 'name', 'code', 'description', 'lifecycleStatus',
  'reviewStatus', 'qualityLevel', 'sourceType', 'externalReference', 'sourceUrl',
  'attribution', 'thumbnailUrl', 'textureUrl', 'geometryUrl', 'knowledgeSpaceId', 'metadata',
];

function comparable(record) {
  return Object.fromEntries(comparableFields.map((field) => [field, record[field] ?? null]));
}
const sameRecord = (left, right) => JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
const summaryOf = (items) => ({
  new: items.filter((item) => item.classification === 'new').length,
  matching: items.filter((item) => item.classification === 'matching').length,
  conflicting: items.filter((item) => item.classification === 'conflicting').length,
  invalid: items.filter((item) => item.classification === 'invalid').length,
});

export async function dryRunLibraryImport(actor, packageData, repository, deps = {}) {
  if (packageData?.schemaVersion !== LIBRARY_SCHEMA_VERSION) {
    throw new LibraryValidationError('LIBRARY_SCHEMA_UNSUPPORTED', `Only schema version ${LIBRARY_SCHEMA_VERSION} is supported`);
  }
  const items = [];
  for (let index = 0; index < (packageData.records || []).length; index += 1) {
    const source = packageData.records[index];
    const itemId = source.id || `row-${index + 1}`;
    try {
      const normalized = normalizeLibraryRecord(source, source.scope === 'global' ? null : actor.tenantId);
      const record = { ...source, ...normalized, id: itemId };
      const existing = record.code ? await repository.findByIdentity(record) : null;
      const normalizedExisting = existing
        ? { ...existing, ...normalizeLibraryRecord(existing, existing.scope === 'global' ? null : actor.tenantId) }
        : null;
      const classification = !existing ? 'new' : sameRecord(record, normalizedExisting) ? 'matching' : 'conflicting';
      items.push({ id: itemId, classification, record, existingId: existing?.id || null });
    } catch (error) {
      items.push({ id: itemId, classification: 'invalid', code: error.code || 'LIBRARY_IMPORT_INVALID', message: error.message });
    }
  }
  const randomUUID = deps.randomUUID || nodeRandomUUID;
  const supportReference = deps.supportReference || (() => `LIB-${randomUUID().slice(0, 8).toUpperCase()}`);
  const batch = {
    id: randomUUID(), actorId: actor.id, tenantId: actor.tenantId || null,
    schemaVersion: LIBRARY_SCHEMA_VERSION, sourceFormat: packageData.sourceFormat || 'json',
    status: 'dry_run', supportReference: supportReference(), items,
    details: packageData.details || [], documents: packageData.documents || [],
    documentRecords: packageData.documentRecords || [], relationships: packageData.relationships || [],
  };
  batch.summary = summaryOf(items);
  await repository.saveDryRun(batch);
  return { batchId: batch.id, supportReference: batch.supportReference, summary: batch.summary, items };
}

export async function commitLibraryImport(actor, batchId, decisions, repository) {
  const batch = await repository.getBatch(batchId);
  if (!batch || batch.actorId !== actor.id || batch.status !== 'dry_run') {
    throw new LibraryValidationError('LIBRARY_IMPORT_BATCH_INVALID', 'Dry-run batch is unavailable or already committed');
  }
  if (batch.summary.invalid > 0) {
    throw new LibraryValidationError('LIBRARY_IMPORT_INVALID_ROWS', 'Invalid rows must be corrected in a new dry run');
  }
  const conflicts = batch.items.filter((item) => item.classification === 'conflicting');
  if (conflicts.some((item) => !decisionsAllowed.has(decisions?.[item.id]))) {
    throw new LibraryValidationError('LIBRARY_IMPORT_DECISIONS_REQUIRED', 'Every conflict requires skip, update, or create_separate');
  }

  const applied = [];
  for (const item of batch.items) {
    if (item.classification === 'matching') continue;
    const current = item.record.code ? await repository.findByIdentity(item.record) : null;
    if (item.classification === 'new' && current) {
      throw new LibraryValidationError('LIBRARY_IMPORT_STALE', 'Library changed after dry run; run validation again', { id: item.id });
    }
    if (item.classification === 'conflicting' && current?.id !== item.existingId) {
      throw new LibraryValidationError('LIBRARY_IMPORT_STALE', 'Conflict target changed after dry run', { id: item.id });
    }
    const decision = item.classification === 'new' ? 'create' : decisions[item.id];
    if (decision === 'skip') continue;
    const record = decision === 'update'
      ? { ...item.record, id: item.existingId }
      : decision === 'create_separate'
        ? { ...item.record, id: nodeRandomUUID(), code: item.record.code ? `${item.record.code}-copy-${item.id.slice(0, 6)}` : null }
        : item.record;
    applied.push({ decision, record });
  }

  return repository.transaction(async () => {
    await repository.applyImport(applied, {
      details: batch.details, documents: batch.documents,
      documentRecords: batch.documentRecords, relationships: batch.relationships,
    });
    await repository.appendAudit({
      actorId: actor.id, action: 'library.import.committed', targetType: 'library_import_batch',
      targetId: batch.id, reason: 'Approved Library import', supportReference: batch.supportReference,
      metadata: { applied: applied.length, skipped: batch.items.length - applied.length, decisions },
    });
    await repository.completeBatch(batch.id, decisions, applied.length);
    return { batchId: batch.id, supportReference: batch.supportReference, applied: applied.length };
  });
}
