import { randomUUID as nodeRandomUUID } from 'node:crypto';
import {
  LibraryValidationError,
  normalizeLibraryRecord,
  validateRelationship,
  assertNoCategoryCycle,
  LIFECYCLE_STATUSES,
} from './libraryPolicy.js';
import { toLibraryRecord, toLibraryRelationship, toLibraryDocument } from './libraryDto.js';

const optionValue = (row, snake, camel, fallback = undefined) => row?.[snake] ?? row?.[camel] ?? fallback;
const optionList = (input) => Array.isArray(input) ? input.filter((item) => typeof item === 'string' && item) : [];
const nullableOptionNumber = (input) => {
  if (input == null) return null;
  const number = Number(input);
  return Number.isFinite(number) ? number : null;
};
const OPTION_TRIM_KINDS = new Set(['soffit', 'fascia', 'gutters', 'downspouts', 'garage_doors', 'other_trims']);
const optionTrimKind = (input) => OPTION_TRIM_KINDS.has(input) ? input : null;
const optionActive = (row) => row?.active !== false
  && optionValue(row, 'lifecycle_status', 'lifecycleStatus', 'active') === 'active';
const optionVisible = (row, ownerId) => {
  const scope = optionValue(row, 'scope', 'scope');
  const tenantId = optionValue(row, 'tenant_id', 'tenantId', optionValue(row, 'owner_id', 'ownerId', null));
  return scope === 'global' || (tenantId != null && tenantId === ownerId);
};
const safeOption = ({ id, source, kind, label, unit, unitPrice, colorIds, profileLabel, trimKind }) => ({
  id: String(id),
  source,
  kind,
  label: String(label),
  unit: String(unit || 'each'),
  unitPrice: nullableOptionNumber(unitPrice),
  colorIds: optionList(colorIds),
  profileLabel: typeof profileLabel === 'string' && profileLabel.trim() ? profileLabel : null,
  trimKind: optionTrimKind(trimKind),
  active: true,
});

/** Server-only counterpart to src/lib/libraryOptions.js. */
export function toTenantLibraryOptions({ ownerId, libraryRecords = [], materials = [], customServices = [] } = {}) {
  const libraryOptions = libraryRecords
    .filter((record) => optionActive(record) && optionVisible(record, ownerId))
    .map((record) => {
      const applicationMetadata = optionValue(record, 'application_metadata', 'applicationMetadata', {}) || {};
      const metadata = record.metadata || {};
      const kind = applicationMetadata.kind === 'service' || metadata.kind === 'service' ? 'service' : 'product';
      return safeOption({
        id: record.id, source: 'library', kind, label: record.name,
        unit: optionValue(record, 'unit', 'unit', kind === 'product' ? 'sq ft' : 'each'),
        unitPrice: optionValue(record, 'price', 'price', null),
        colorIds: applicationMetadata.colorIds || metadata.colorIds || record.color_ids || record.colorIds,
        profileLabel: applicationMetadata.profileLabel || metadata.profileLabel || null,
        trimKind: applicationMetadata.trimKind || metadata.trimKind || null,
      });
    });
  const materialOptions = materials
    .filter((record) => optionActive(record) && optionVisible(record, ownerId))
    .map((record) => safeOption({
      id: record.id, source: 'material', kind: 'product', label: record.name, unit: 'sq ft',
      unitPrice: optionValue(record, 'price_per_sqft', 'pricePerSqft', null),
      colorIds: record.color_ids || record.colorIds, profileLabel: optionList(record.profiles)[0] || null,
      trimKind: null,
    }));
  const serviceOptions = customServices
    .filter((record) => optionActive(record) && optionVisible(record, ownerId))
    .map((record) => safeOption({
      id: record.id, source: 'custom-service', kind: 'service', label: record.name,
      unit: record.unit || 'each', unitPrice: record.price ?? record.unit_price ?? record.unitPrice ?? null,
      colorIds: [], profileLabel: null,
      trimKind: null,
    }));
  return {
    products: [...libraryOptions, ...materialOptions].filter((item) => item.kind === 'product'),
    services: [...libraryOptions, ...serviceOptions].filter((item) => item.kind === 'service'),
  };
}

export async function listTenantLibraryOptions(sql, ownerId) {
  const [libraryRecords, materials, materialColors, customServices] = await Promise.all([
    sql`select r.id, r.record_type, r.scope, r.tenant_id, r.name, r.lifecycle_status, r.metadata,
      pd.unit, pd.price, pd.application_metadata
      from library_records r
      left join library_product_details pd on pd.record_id = r.id
      where r.record_type = 'product' and r.lifecycle_status = 'active'
        and (r.scope = 'global' or (r.scope = 'tenant' and r.tenant_id = ${ownerId}))
      order by r.name asc`,
    sql`select * from materials where owner_id = ${ownerId} order by created_at asc`,
    sql`select mc.material_id, mc.color_id from material_colors mc
      join materials m on m.id = mc.material_id where m.owner_id = ${ownerId}`,
    sql`select * from custom_services where owner_id = ${ownerId} order by created_at asc`,
  ]);
  const colorIdsByMaterial = new Map();
  materialColors.forEach((row) => {
    const colorIds = colorIdsByMaterial.get(row.material_id) || [];
    colorIds.push(row.color_id);
    colorIdsByMaterial.set(row.material_id, colorIds);
  });
  return toTenantLibraryOptions({
    ownerId,
    libraryRecords,
    materials: materials.map((row) => ({ ...row, colorIds: colorIdsByMaterial.get(row.id) || [] })),
    customServices,
  });
}

const cleanReason = (reason) => {
  const result = String(reason || '').trim();
  if (!result) throw new LibraryValidationError('LIBRARY_REASON_REQUIRED', 'A reason is required');
  return result;
};
const rowType = (row) => row.record_type ?? row.recordType;
const rowTenant = (row) => row.tenant_id ?? row.tenantId;

function assertVisible(actor, row) {
  if (!row) throw new LibraryValidationError('LIBRARY_RECORD_NOT_FOUND', 'Library record not found');
  if ((row.scope === 'tenant') && actor.tenantId && rowTenant(row) !== actor.tenantId) {
    throw new LibraryValidationError('LIBRARY_RECORD_NOT_FOUND', 'Library record not found');
  }
}

function assertVersion(row, expectedVersion) {
  if (Number(row.version) !== Number(expectedVersion)) {
    throw new LibraryValidationError('LIBRARY_VERSION_CONFLICT', 'Record changed since it was loaded', {
      expectedVersion: Number(expectedVersion), currentVersion: Number(row.version),
    });
  }
}

export function createLibraryService({ store, randomUUID = nodeRandomUUID }) {
  const audit = (actor, action, targetType, targetId, reason, metadata = {}) => ({
    actorId: actor.id, action, targetType, targetId, reason, metadata,
  });

  return {
    async listRecords(actor, filters = {}) {
      return (await store.listRecords({
        ...filters,
        actorTenantId: actor.tenantId || null,
        includeAllTenants: actor.role === 'superadmin' && !actor.tenantId,
      })).map(toLibraryRecord);
    },
    async getRecord(actor, id) {
      const row = await store.getRecord(id);
      assertVisible(actor, row);
      return toLibraryRecord(row);
    },
    async createRecord(actor, input, reason) {
      const why = cleanReason(reason);
      const normalized = normalizeLibraryRecord(input, input.scope === 'global' ? null : actor.tenantId);
      const change = { id: input.id || randomUUID(), ...normalized, version: 1, createdBy: actor.id, updatedBy: actor.id };
      return store.transaction(async () => {
        const created = await store.createRecord(change, input.details || {});
        await store.appendAudit(audit(actor, 'library.record.created', normalized.recordType, change.id, why, { version: 1, scope: normalized.scope }));
        return toLibraryRecord(created);
      });
    },
    async updateRecord(actor, id, expectedVersion, input, reason) {
      const why = cleanReason(reason);
      const current = await store.getRecord(id);
      assertVisible(actor, current);
      assertVersion(current, expectedVersion);
      const normalized = normalizeLibraryRecord({ ...toLibraryRecord(current), ...input, recordType: input.recordType || rowType(current) }, rowTenant(current));
      const change = { id, ...normalized, version: Number(current.version) + 1, updatedBy: actor.id };
      return store.transaction(async () => {
        const updated = await store.updateRecord(change, input.details || {});
        await store.appendAudit(audit(actor, 'library.record.updated', normalized.recordType, id, why, { fromVersion: Number(current.version), version: change.version }));
        return toLibraryRecord(updated);
      });
    },
    async setRecordLifecycle(actor, id, expectedVersion, lifecycleStatus, reason) {
      const why = cleanReason(reason);
      if (!LIFECYCLE_STATUSES.includes(lifecycleStatus)) throw new LibraryValidationError('LIBRARY_LIFECYCLE_INVALID', 'Lifecycle must be active or archived');
      const current = await store.getRecord(id);
      assertVisible(actor, current);
      assertVersion(current, expectedVersion);
      const change = {
        ...toLibraryRecord(current), id, recordType: rowType(current), tenantId: rowTenant(current),
        lifecycleStatus, version: Number(current.version) + 1, updatedBy: actor.id,
      };
      return store.transaction(async () => {
        const updated = await store.updateRecord(change, {});
        const action = lifecycleStatus === 'archived' ? 'library.record.archived' : 'library.record.restored';
        await store.appendAudit(audit(actor, action, rowType(current), id, why, { version: change.version }));
        return toLibraryRecord(updated);
      });
    },
    async createRelationship(actor, input, reason) {
      const why = cleanReason(reason);
      const [source, target] = await Promise.all([store.getRecord(input.sourceRecordId), store.getRecord(input.targetRecordId)]);
      assertVisible(actor, source); assertVisible(actor, target);
      if (input.sourceRecordId === input.targetRecordId) throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'A record cannot relate to itself');
      validateRelationship(rowType(source), rowType(target), input.relationshipType);
      if (input.relationshipType === 'categorized_as' && rowType(source) === 'category') {
        assertNoCategoryCycle(await store.listCategoryEdges(), input.sourceRecordId, input.targetRecordId);
      }
      const change = { id: input.id || randomUUID(), ...input, lifecycleStatus: 'active', version: 1, createdBy: actor.id, updatedBy: actor.id };
      return store.transaction(async () => {
        const created = await store.createRelationship(change);
        await store.appendAudit(audit(actor, 'library.relationship.created', 'library_relationship', change.id, why, { sourceRecordId: input.sourceRecordId, targetRecordId: input.targetRecordId, relationshipType: input.relationshipType }));
        return toLibraryRelationship(created);
      });
    },
    async upsertDocument(actor, input, reason) {
      const why = cleanReason(reason);
      let url;
      try { url = new URL(input.url); } catch { throw new LibraryValidationError('LIBRARY_URL_INVALID', 'Document URL must be valid'); }
      if (!['http:', 'https:'].includes(url.protocol)) throw new LibraryValidationError('LIBRARY_URL_INVALID', 'Document URL must be HTTP(S)');
      const change = { ...input, id: input.id || randomUUID(), url: url.toString(), updatedBy: actor.id, createdBy: actor.id };
      const recordIds = [...new Set(input.recordIds || [])];
      for (const recordId of recordIds) assertVisible(actor, await store.getRecord(recordId));
      return store.transaction(async () => {
        const saved = await store.upsertDocument(change);
        await store.setDocumentRecords(change.id, recordIds);
        await store.appendAudit(audit(actor, input.id ? 'library.document.updated' : 'library.document.created', 'library_document', change.id, why));
        return toLibraryDocument(saved);
      });
    },
  };
}

export function createNeonLibraryStore(sql) {
  let pendingQueries = null;
  const execute = async (query, optimisticValue) => {
    if (pendingQueries) {
      pendingQueries.push(query);
      return optimisticValue;
    }
    const rows = await query;
    return rows[0] ?? optimisticValue;
  };
  const mapRecordValues = (change) => [
    change.id, change.recordType, change.scope, change.tenantId, change.name, change.code,
    change.description, change.lifecycleStatus, change.reviewStatus, change.qualityLevel,
    change.version, change.sourceType, change.externalReference, change.sourceUrl,
    change.attribution, change.thumbnailUrl, change.textureUrl, change.geometryUrl,
    change.knowledgeSpaceId, JSON.stringify(change.metadata || {}), change.createdBy, change.updatedBy,
  ];
  const queueTypedDetails = async (recordId, recordType, details = {}) => {
    if (recordType === 'product') {
      const query = sql`insert into library_product_details (record_id,unit,price,application_metadata,legacy_material_id) values (${recordId},${details.unit || null},${details.price ?? null},${JSON.stringify(details.applicationMetadata || {})}::jsonb,${details.legacyMaterialId || null}) on conflict (record_id) do update set unit=excluded.unit,price=excluded.price,application_metadata=excluded.application_metadata`;
      if (pendingQueries) pendingQueries.push(query); else await query;
    }
    if (recordType === 'profile') {
      const query = sql`insert into library_profile_details (record_id,profile_family,geometry_metadata,legacy_profile_label) values (${recordId},${details.profileFamily || null},${JSON.stringify(details.geometryMetadata || {})}::jsonb,${details.legacyProfileLabel || null}) on conflict (record_id) do update set profile_family=excluded.profile_family,geometry_metadata=excluded.geometry_metadata`;
      if (pendingQueries) pendingQueries.push(query); else await query;
    }
    if (recordType === 'color') {
      const query = sql`insert into library_color_details (record_id,color_code,hex,series,legacy_color_id) values (${recordId},${details.colorCode || null},${details.hex || null},${details.series || null},${details.legacyColorId || null}) on conflict (record_id) do update set color_code=excluded.color_code,hex=excluded.hex,series=excluded.series`;
      if (pendingQueries) pendingQueries.push(query); else await query;
    }
  };
  return {
    async transaction(work) {
      if (pendingQueries) throw new Error('Nested Library transactions are not supported');
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
    async listRecords(filters) {
      const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
      const search = String(filters.search || '').trim();
      return sql`select * from library_records
        where (${filters.recordType || null}::text is null or record_type = ${filters.recordType || null})
          and (${filters.scope || null}::text is null or scope = ${filters.scope || null})
          and (${filters.lifecycleStatus || null}::text is null or lifecycle_status = ${filters.lifecycleStatus || null})
          and (${filters.reviewStatus || null}::text is null or review_status = ${filters.reviewStatus || null})
          and (${filters.qualityLevel || null}::text is null or quality_level = ${filters.qualityLevel || null})
          and (${search} = '' or name ilike ${`%${search}%`} or code ilike ${`%${search}%`})
          and (scope = 'global' or ${Boolean(filters.includeAllTenants)} or tenant_id = ${filters.actorTenantId || null})
        order by updated_at desc limit ${limit}`;
    },
    async getRecord(id) { const [row] = await sql`select * from library_records where id = ${id}`; return row || null; },
    async createRecord(change, details) {
      const v = mapRecordValues(change);
      const query = sql`insert into library_records
        (id,record_type,scope,tenant_id,name,code,description,lifecycle_status,review_status,quality_level,version,source_type,external_reference,source_url,attribution,thumbnail_url,texture_url,geometry_url,knowledge_space_id,metadata,created_by,updated_by)
        values (${v[0]},${v[1]},${v[2]},${v[3]},${v[4]},${v[5]},${v[6]},${v[7]},${v[8]},${v[9]},${v[10]},${v[11]},${v[12]},${v[13]},${v[14]},${v[15]},${v[16]},${v[17]},${v[18]},${v[19]}::jsonb,${v[20]},${v[21]}) returning *`;
      const result = await execute(query, change); await queueTypedDetails(change.id, change.recordType, details); return result;
    },
    async updateRecord(change, details) {
      const query = sql`update library_records set name=${change.name}, code=${change.code}, description=${change.description}, lifecycle_status=${change.lifecycleStatus}, review_status=${change.reviewStatus}, quality_level=${change.qualityLevel}, version=${change.version}, source_type=${change.sourceType}, external_reference=${change.externalReference}, source_url=${change.sourceUrl}, attribution=${change.attribution}, thumbnail_url=${change.thumbnailUrl}, texture_url=${change.textureUrl}, geometry_url=${change.geometryUrl}, knowledge_space_id=${change.knowledgeSpaceId}, metadata=${JSON.stringify(change.metadata || {})}::jsonb, updated_by=${change.updatedBy}, updated_at=now() where id=${change.id} and version=${change.version - 1} returning *`;
      if (pendingQueries) { const result = await execute(query, change); await queueTypedDetails(change.id, change.recordType, details); return result; }
      const row = await execute(query, null);
      if (!row) throw new LibraryValidationError('LIBRARY_VERSION_CONFLICT', 'Record changed during update');
      await queueTypedDetails(change.id, change.recordType, details);
      return row;
    },
    async listCategoryEdges() {
      const rows = await sql`select source_record_id,target_record_id from library_relationships where relationship_type='categorized_as' and lifecycle_status='active'`;
      return rows.map((row) => ({ sourceId: row.source_record_id, targetId: row.target_record_id }));
    },
    async createRelationship(change) {
      const query = sql`insert into library_relationships (id,source_record_id,target_record_id,relationship_type,lifecycle_status,version,attribution,metadata,created_by,updated_by) values (${change.id},${change.sourceRecordId},${change.targetRecordId},${change.relationshipType},${change.lifecycleStatus},${change.version},${change.attribution || null},${JSON.stringify(change.metadata || {})}::jsonb,${change.createdBy},${change.updatedBy}) returning *`;
      return execute(query, change);
    },
    async upsertDocument(change) {
      const query = sql`insert into library_documents (id,title,document_type,url,publisher,jurisdiction,effective_date,expiry_date,language,checksum,review_status,is_official,metadata,created_by,updated_by) values (${change.id},${change.title},${change.documentType},${change.url},${change.publisher || null},${change.jurisdiction || null},${change.effectiveDate || null},${change.expiryDate || null},${change.language || null},${change.checksum || null},${change.reviewStatus || 'draft'},${Boolean(change.isOfficial)},${JSON.stringify(change.metadata || {})}::jsonb,${change.createdBy},${change.updatedBy}) on conflict (id) do update set title=excluded.title, document_type=excluded.document_type, url=excluded.url, publisher=excluded.publisher, jurisdiction=excluded.jurisdiction, effective_date=excluded.effective_date, expiry_date=excluded.expiry_date, language=excluded.language, checksum=excluded.checksum, review_status=excluded.review_status, is_official=excluded.is_official, metadata=excluded.metadata, updated_by=excluded.updated_by, updated_at=now() returning *`;
      return execute(query, change);
    },
    async setDocumentRecords(documentId, recordIds) {
      const queries = [sql`delete from library_document_records where document_id=${documentId}`, ...recordIds.map((recordId) => sql`insert into library_document_records (document_id,record_id) values (${documentId},${recordId})`)];
      if (pendingQueries) { pendingQueries.push(...queries); return; }
      await sql.transaction(queries);
    },
    async appendAudit(event) {
      const query = sql`insert into superadmin_audit_events (actor_id,action,target_type,target_id,reason,metadata) values (${event.actorId},${event.action},${event.targetType},${event.targetId},${event.reason},${JSON.stringify(event.metadata || {})}::jsonb)`;
      if (pendingQueries) { pendingQueries.push(query); return; }
      await query;
    },
  };
}
