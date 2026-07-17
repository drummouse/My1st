import { randomUUID as nodeRandomUUID } from 'node:crypto';
import { LibraryValidationError } from './libraryPolicy.js';

export const LEGACY_LIBRARY_MIGRATION_VERSION = 1;
export const legacyMigrationKey = (tenantId) => `library-core-v${LEGACY_LIBRARY_MIGRATION_VERSION}:${tenantId}`;

export function planLegacyLibraryMigration(tenantId, legacyData, existingLibrary, deps = {}) {
  const randomUUID = deps.randomUUID || nodeRandomUUID;
  const migrationKey = legacyMigrationKey(tenantId);
  if (existingLibrary.migrationKeys.has(migrationKey)) {
    return { migrationKey, status: 'already_completed', records: [], details: [], relationships: [] };
  }
  const occupied = new Set(existingLibrary.ids || []);
  const records = []; const details = []; const relationships = [];
  const idFor = (legacyId) => {
    const id = legacyId && !occupied.has(legacyId) ? legacyId : randomUUID();
    occupied.add(id); return id;
  };
  const base = (id, recordType, source, extra = {}) => ({
    id, recordType, scope: 'tenant', tenantId, name: source.name,
    code: source.code || null, description: source.description || null,
    lifecycleStatus: 'active', reviewStatus: 'draft', qualityLevel: 'test', version: 1,
    sourceType: 'legacy_migration', attribution: 'IronWrap legacy tenant library',
    thumbnailUrl: source.thumbnail_url || null,
    metadata: {
      provenance: { legacyId: source.id || null, migrationKey, migratedFrom: extra.migratedFrom },
      legacy: extra.legacy || {},
    },
  });
  const folderIds = new Map();
  for (const folder of legacyData.folders || []) {
    const id = idFor(folder.id);
    folderIds.set(folder.id, id);
    records.push(base(id, 'category', folder, { migratedFrom: 'folders', legacy: { kind: folder.kind } }));
  }
  const colorIds = new Map();
  for (const color of legacyData.colors || []) {
    const id = idFor(color.id);
    colorIds.set(color.id, id);
    records.push(base(id, 'color', color, { migratedFrom: 'colors' }));
    details.push({ recordId: id, recordType: 'color', colorCode: color.code || null, hex: color.hex || null, series: color.series || null, legacyColorId: color.id });
    for (const folderId of color.folder_ids || []) {
      if (folderIds.has(folderId)) relationships.push({ id: randomUUID(), sourceRecordId: id, targetRecordId: folderIds.get(folderId), relationshipType: 'categorized_as' });
    }
  }
  const profileIds = new Map();
  const materialIds = new Map();
  for (const material of legacyData.materials || []) {
    const id = idFor(material.id);
    materialIds.set(material.id, id);
    records.push(base(id, 'product', material, { migratedFrom: 'materials', legacy: { kind: material.kind || null } }));
    details.push({
      recordId: id, recordType: 'product', unit: 'sqft', price: Number(material.price_per_sqft ?? material.price ?? 0),
      applicationMetadata: { kind: material.kind || null, profiles: material.profiles || [] }, legacyMaterialId: material.id,
    });
    if (material.folder_id && folderIds.has(material.folder_id)) relationships.push({ id: randomUUID(), sourceRecordId: id, targetRecordId: folderIds.get(material.folder_id), relationshipType: 'categorized_as' });
    for (const profileLabel of material.profiles || []) {
      const key = String(profileLabel).trim().toLowerCase();
      if (!key) continue;
      if (!profileIds.has(key)) {
        const profileId = idFor(null);
        profileIds.set(key, profileId);
        records.push(base(profileId, 'profile', { name: String(profileLabel).trim() }, { migratedFrom: 'materials.profiles' }));
        details.push({ recordId: profileId, recordType: 'profile', profileFamily: String(profileLabel).trim(), geometryMetadata: {}, legacyProfileLabel: String(profileLabel).trim() });
      }
      relationships.push({ id: randomUUID(), sourceRecordId: id, targetRecordId: profileIds.get(key), relationshipType: 'compatible_with' });
    }
    for (const legacyColorId of material.color_ids || []) {
      if (colorIds.has(legacyColorId)) relationships.push({ id: randomUUID(), sourceRecordId: id, targetRecordId: colorIds.get(legacyColorId), relationshipType: 'compatible_with' });
    }
  }
  return { migrationKey, status: 'ready', records, details, relationships, materialIds, colorIds };
}

export async function runLegacyLibraryMigration(actor, tenantId, repository) {
  if (!tenantId) throw new LibraryValidationError('LIBRARY_SCOPE_INVALID', 'Tenant is required for legacy migration');
  const [legacyData, existingLibrary] = await Promise.all([
    repository.loadLegacyData(tenantId), repository.loadMigrationState(tenantId),
  ]);
  const plan = planLegacyLibraryMigration(tenantId, legacyData, existingLibrary);
  if (plan.status === 'already_completed') return { status: plan.status, migrationKey: plan.migrationKey, inserted: 0 };
  return repository.transaction(async () => {
    await repository.claimMigration(plan.migrationKey, tenantId, LEGACY_LIBRARY_MIGRATION_VERSION);
    await repository.applyMigration(plan);
    const summary = { records: plan.records.length, details: plan.details.length, relationships: plan.relationships.length };
    await repository.appendAudit({
      actorId: actor.id, action: 'library.migration.completed', targetType: 'tenant', targetId: tenantId,
      reason: 'Legacy Materials and Colors migration', metadata: { migrationKey: plan.migrationKey, ...summary },
    });
    await repository.completeMigration(plan.migrationKey, summary);
    return { status: 'completed', migrationKey: plan.migrationKey, inserted: plan.records.length, summary };
  });
}
