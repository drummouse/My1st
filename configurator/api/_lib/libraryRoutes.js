import { randomUUID } from 'node:crypto';
import { sql } from './db.js';
import { createLibraryService, createNeonLibraryStore } from './libraryService.js';
import { toLibraryDocument, toLibraryRelationship, toLibraryMigration, toLibraryRecord } from './libraryDto.js';
import { buildJsonPackage, serializeCsvBundle, parseJsonPackage, parseCsvBundle } from './libraryExchange.js';
import { dryRunLibraryImport, commitLibraryImport } from './libraryImport.js';
import { runLegacyLibraryMigration, legacyMigrationKey } from './libraryMigration.js';
import { LibraryValidationError } from './libraryPolicy.js';
import { createSupportReference } from './accountAdministration.js';

const limitOf = (value) => Math.min(100, Math.max(1, Number(value) || 50));
const requireMethod = (req, allowed) => {
  if (!allowed.includes(req.method)) throw new LibraryValidationError('LIBRARY_METHOD_INVALID', `Use ${allowed.join(' or ')}`);
};
const actorContext = (actor, req) => ({ ...actor, tenantId: req.body?.tenantId || req.query?.tenantId || null });

function createImportRepository(actor) {
  let pending = null;
  const queue = (query) => pending ? pending.push(query) : query;
  return {
    async findByIdentity(record) {
      const [row] = await sql`select * from library_records where record_type=${record.recordType} and scope=${record.scope}
        and tenant_id is not distinct from ${record.tenantId || null} and lower(code)=lower(${record.code})`;
      if (!row) return null;
      return { ...row, recordType: row.record_type, tenantId: row.tenant_id, lifecycleStatus: row.lifecycle_status, reviewStatus: row.review_status, qualityLevel: row.quality_level, sourceType: row.source_type, externalReference: row.external_reference, sourceUrl: row.source_url, thumbnailUrl: row.thumbnail_url, textureUrl: row.texture_url, geometryUrl: row.geometry_url, knowledgeSpaceId: row.knowledge_space_id };
    },
    async saveDryRun(batch) {
      await sql`insert into library_import_batches (id,actor_id,scope,tenant_id,schema_version,source_format,status,support_reference,summary)
        values (${batch.id},${actor.id},${batch.tenantId ? 'tenant' : 'global'},${batch.tenantId},${batch.schemaVersion},${batch.sourceFormat},'dry_run',${batch.supportReference},${JSON.stringify(batch)}::jsonb)`;
    },
    async getBatch(id) {
      const [row] = await sql`select * from library_import_batches where id=${id} and actor_id=${actor.id}`;
      return row ? { ...row.summary, id: row.id, actorId: row.actor_id, status: row.status, supportReference: row.support_reference } : null;
    },
    async transaction(work) {
      pending = [];
      try {
        const result = await work(); const queries = pending; pending = null;
        await sql.transaction(queries); return result;
      } catch (error) { pending = null; throw error; }
    },
    async applyImport(items) {
      for (const { decision, record } of items) {
        const query = decision === 'update'
          ? sql`update library_records set name=${record.name},description=${record.description},lifecycle_status=${record.lifecycleStatus},review_status=${record.reviewStatus},quality_level=${record.qualityLevel},version=version+1,source_type=${record.sourceType},external_reference=${record.externalReference},source_url=${record.sourceUrl},attribution=${record.attribution},thumbnail_url=${record.thumbnailUrl},texture_url=${record.textureUrl},geometry_url=${record.geometryUrl},metadata=${JSON.stringify(record.metadata || {})}::jsonb,updated_by=${actor.id},updated_at=now() where id=${record.id}`
          : sql`insert into library_records (id,record_type,scope,tenant_id,name,code,description,lifecycle_status,review_status,quality_level,version,source_type,external_reference,source_url,attribution,thumbnail_url,texture_url,geometry_url,knowledge_space_id,metadata,created_by,updated_by) values (${record.id || randomUUID()},${record.recordType},${record.scope},${record.tenantId},${record.name},${record.code},${record.description},${record.lifecycleStatus},${record.reviewStatus},${record.qualityLevel},1,'import',${record.externalReference},${record.sourceUrl},${record.attribution},${record.thumbnailUrl},${record.textureUrl},${record.geometryUrl},${record.knowledgeSpaceId},${JSON.stringify(record.metadata || {})}::jsonb,${actor.id},${actor.id})`;
        queue(query);
      }
    },
    async appendAudit(event) { queue(sql`insert into superadmin_audit_events (actor_id,action,target_type,target_id,reason,support_reference,metadata) values (${actor.id},${event.action},${event.targetType},${event.targetId},${event.reason},${event.supportReference || null},${JSON.stringify(event.metadata || {})}::jsonb)`); },
    async completeBatch(id, decisions) { queue(sql`update library_import_batches set status='committed',decisions=${JSON.stringify(decisions)}::jsonb,committed_at=now() where id=${id}`); },
  };
}

function createMigrationRepository(actor) {
  let pending = null;
  const queue = (query) => pending ? pending.push(query) : query;
  return {
    async loadLegacyData(tenantId) {
      const [materials, colors, folders, links] = await Promise.all([
        sql`select m.*, coalesce(array_agg(mc.color_id) filter (where mc.color_id is not null), '{}') as color_ids from materials m left join material_colors mc on mc.material_id=m.id where m.owner_id=${tenantId} group by m.id`,
        sql`select c.*, coalesce(array_agg(cf.folder_id) filter (where cf.folder_id is not null), '{}') as folder_ids from colors c left join color_folders cf on cf.color_id=c.id where c.owner_id=${tenantId} group by c.id`,
        sql`select * from folders where owner_id=${tenantId}`,
        Promise.resolve([]),
      ]);
      return { materials, colors, folders, links };
    },
    async loadMigrationState(tenantId) {
      const [ids, migrations] = await Promise.all([sql`select id from library_records`, sql`select migration_key from library_migrations where tenant_id=${tenantId} and status='completed'`]);
      return { ids: new Set(ids.map((row) => row.id)), migrationKeys: new Set(migrations.map((row) => row.migration_key)) };
    },
    async transaction(work) { pending = []; try { const result = await work(); const queries = pending; pending = null; await sql.transaction(queries); return result; } catch (error) { pending = null; throw error; } },
    async claimMigration(key, tenantId, version) { queue(sql`insert into library_migrations (id,migration_key,tenant_id,version,status) values (${randomUUID()},${key},${tenantId},${version},'running')`); },
    async applyMigration(plan) {
      for (const record of plan.records) queue(sql`insert into library_records (id,record_type,scope,tenant_id,name,code,lifecycle_status,review_status,quality_level,version,source_type,attribution,thumbnail_url,metadata,created_by,updated_by) values (${record.id},${record.recordType},'tenant',${record.tenantId},${record.name},${record.code},'active','draft','test',1,'legacy_migration',${record.attribution},${record.thumbnailUrl},${JSON.stringify(record.metadata)}::jsonb,${actor.id},${actor.id})`);
      for (const detail of plan.details) {
        if (detail.recordType === 'product') queue(sql`insert into library_product_details (record_id,unit,price,application_metadata,legacy_material_id) values (${detail.recordId},${detail.unit},${detail.price},${JSON.stringify(detail.applicationMetadata)}::jsonb,${detail.legacyMaterialId})`);
        if (detail.recordType === 'profile') queue(sql`insert into library_profile_details (record_id,profile_family,geometry_metadata,legacy_profile_label) values (${detail.recordId},${detail.profileFamily},${JSON.stringify(detail.geometryMetadata)}::jsonb,${detail.legacyProfileLabel})`);
        if (detail.recordType === 'color') queue(sql`insert into library_color_details (record_id,color_code,hex,series,legacy_color_id) values (${detail.recordId},${detail.colorCode},${detail.hex},${detail.series},${detail.legacyColorId})`);
      }
      for (const relation of plan.relationships) queue(sql`insert into library_relationships (id,source_record_id,target_record_id,relationship_type,created_by,updated_by) values (${relation.id},${relation.sourceRecordId},${relation.targetRecordId},${relation.relationshipType},${actor.id},${actor.id}) on conflict do nothing`);
    },
    async appendAudit(event) { queue(sql`insert into superadmin_audit_events (actor_id,action,target_type,target_id,reason,metadata) values (${actor.id},${event.action},${event.targetType},${event.targetId},${event.reason},${JSON.stringify(event.metadata)}::jsonb)`); },
    async completeMigration(key, summary) { queue(sql`update library_migrations set status='completed',summary=${JSON.stringify(summary)}::jsonb,completed_at=now() where migration_key=${key}`); },
  };
}

export async function handleLibraryAction({ req, res, actor, action }) {
  const scopedActor = actorContext(actor, req);
  const store = createNeonLibraryStore(sql);
  const service = createLibraryService({ store });
  if (action === 'library.records') {
    requireMethod(req, ['GET']);
    const records = await service.listRecords(scopedActor, { ...req.query, limit: limitOf(req.query.limit) });
    return res.status(200).json({ records, nextCursor: records.length === limitOf(req.query.limit) ? records.at(-1)?.id : null });
  }
  if (action === 'library.record') {
    if (req.method === 'GET') return res.status(200).json({ record: await service.getRecord(scopedActor, String(req.query.id || '')) });
    requireMethod(req, ['POST', 'PATCH']);
    const reason = req.body?.reason;
    if (req.method === 'POST') return res.status(201).json({ record: await service.createRecord(scopedActor, req.body?.record || {}, reason) });
    const record = req.body?.lifecycleStatus
      ? await service.setRecordLifecycle(scopedActor, String(req.query.id), req.body.expectedVersion, req.body.lifecycleStatus, reason)
      : await service.updateRecord(scopedActor, String(req.query.id), req.body.expectedVersion, req.body.record || {}, reason);
    return res.status(200).json({ record });
  }
  if (action === 'library.relationships') {
    if (req.method === 'GET') { const rows = await sql`select * from library_relationships order by updated_at desc limit ${limitOf(req.query.limit)}`; return res.status(200).json({ relationships: rows.map(toLibraryRelationship) }); }
    requireMethod(req, ['POST']);
    return res.status(201).json({ relationship: await service.createRelationship(scopedActor, req.body?.relationship || {}, req.body?.reason) });
  }
  if (action === 'library.documents') {
    if (req.method === 'GET') { const rows = await sql`select * from library_documents order by updated_at desc limit ${limitOf(req.query.limit)}`; return res.status(200).json({ documents: rows.map(toLibraryDocument) }); }
    requireMethod(req, ['POST']);
    return res.status(201).json({ document: await service.upsertDocument(scopedActor, req.body?.document || {}, req.body?.reason) });
  }
  if (action === 'library.export') {
    requireMethod(req, ['GET']);
    const tenantId = req.query.tenantId || null;
    const [recordRows, productDetails, profileDetails, colorDetails, documents, documentRecords, relationships] = await Promise.all([
      sql`select * from library_records where scope='global' or (${tenantId}::uuid is not null and scope='tenant' and tenant_id=${tenantId}) order by updated_at desc`,
      sql`select d.* from library_product_details d join library_records r on r.id=d.record_id where r.scope='global' or (${tenantId}::uuid is not null and r.scope='tenant' and r.tenant_id=${tenantId})`,
      sql`select d.* from library_profile_details d join library_records r on r.id=d.record_id where r.scope='global' or (${tenantId}::uuid is not null and r.scope='tenant' and r.tenant_id=${tenantId})`,
      sql`select d.* from library_color_details d join library_records r on r.id=d.record_id where r.scope='global' or (${tenantId}::uuid is not null and r.scope='tenant' and r.tenant_id=${tenantId})`,
      sql`select distinct d.* from library_documents d join library_document_records dr on dr.document_id=d.id join library_records r on r.id=dr.record_id where r.scope='global' or (${tenantId}::uuid is not null and r.scope='tenant' and r.tenant_id=${tenantId})`,
      sql`select dr.* from library_document_records dr join library_records r on r.id=dr.record_id where r.scope='global' or (${tenantId}::uuid is not null and r.scope='tenant' and r.tenant_id=${tenantId})`,
      sql`select lr.* from library_relationships lr join library_records source on source.id=lr.source_record_id join library_records target on target.id=lr.target_record_id where (source.scope='global' or (${tenantId}::uuid is not null and source.scope='tenant' and source.tenant_id=${tenantId})) and (target.scope='global' or (${tenantId}::uuid is not null and target.scope='tenant' and target.tenant_id=${tenantId}))`,
    ]);
    const records = recordRows.map(toLibraryRecord);
    const details = [
      ...productDetails.map((row) => ({ recordId: row.record_id, recordType: 'product', unit: row.unit, price: row.price == null ? null : Number(row.price), applicationMetadata: row.application_metadata, legacyMaterialId: row.legacy_material_id })),
      ...profileDetails.map((row) => ({ recordId: row.record_id, recordType: 'profile', profileFamily: row.profile_family, geometryMetadata: row.geometry_metadata, legacyProfileLabel: row.legacy_profile_label })),
      ...colorDetails.map((row) => ({ recordId: row.record_id, recordType: 'color', colorCode: row.color_code, hex: row.hex, series: row.series, legacyColorId: row.legacy_color_id })),
    ];
    const data = { records, details, documents: documents.map(toLibraryDocument), documentRecords: documentRecords.map((row) => ({ documentId: row.document_id, recordId: row.record_id })), relationships: relationships.map(toLibraryRelationship) };
    return res.status(200).json(req.query.format === 'csv' ? { schemaVersion: 1, files: serializeCsvBundle(data) } : buildJsonPackage(data, { exportedBy: actor.id }));
  }
  if (action === 'library.import.dry-run') {
    requireMethod(req, ['POST']);
    const packageData = req.body?.format === 'csv' ? { schemaVersion: 1, sourceFormat: 'csv', ...parseCsvBundle(req.body.files) } : parseJsonPackage(req.body?.package);
    return res.status(200).json(await dryRunLibraryImport(scopedActor, packageData, createImportRepository(actor), { supportReference: createSupportReference }));
  }
  if (action === 'library.import.commit') {
    requireMethod(req, ['POST']);
    return res.status(200).json(await commitLibraryImport(scopedActor, req.body?.batchId, req.body?.decisions || {}, createImportRepository(actor)));
  }
  if (action === 'library.migration.status') {
    requireMethod(req, ['GET']);
    const rows = await sql`select * from library_migrations where tenant_id=${req.query.tenantId} order by started_at desc`;
    return res.status(200).json({ migrationKey: legacyMigrationKey(req.query.tenantId), migrations: rows.map(toLibraryMigration) });
  }
  requireMethod(req, ['POST']);
  return res.status(200).json(await runLegacyLibraryMigration(actor, req.body?.tenantId, createMigrationRepository(actor)));
}
