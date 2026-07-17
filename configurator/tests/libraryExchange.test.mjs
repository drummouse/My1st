import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toLibraryRecord,
  toLibraryRelationship,
  toLibraryDocument,
} from '../api/_lib/libraryDto.js';
import {
  buildJsonPackage,
  parseJsonPackage,
  serializeCsvBundle,
  parseCsvBundle,
} from '../api/_lib/libraryExchange.js';

const row = {
  id: 'r1', record_type: 'product', scope: 'tenant', tenant_id: 't1', name: 'Panel, 24"',
  code: 'P-1', version: 2, metadata: { gauge: 24 }, password_hash: 'secret',
  customer_address: 'private',
};

test('record DTO excludes unapproved and private fields', () => {
  assert.deepEqual(toLibraryRecord(row), {
    id: 'r1', recordType: 'product', scope: 'tenant', tenantId: 't1', name: 'Panel, 24"', code: 'P-1',
    description: null, lifecycleStatus: 'active', reviewStatus: 'draft', qualityLevel: 'test', version: 2,
    sourceType: 'manual', externalReference: null, sourceUrl: null, attribution: null, thumbnailUrl: null,
    textureUrl: null, geometryUrl: null, knowledgeSpaceId: null, communityTopicIds: [], metadata: { gauge: 24 },
    createdAt: null, updatedAt: null,
  });
});

test('relationship and document DTOs are allowlisted', () => {
  assert.equal(toLibraryRelationship({ id: 'x', source_record_id: 'r1', target_record_id: 'r2', relationship_type: 'related_to' }).sourceRecordId, 'r1');
  assert.equal(toLibraryDocument({ id: 'd1', title: 'Guide', document_type: 'installation', url: 'https://example.com/guide' }).isOfficial, false);
});

test('canonical JSON round trips stable IDs', () => {
  const data = { records: [toLibraryRecord(row)], details: [], documents: [], documentRecords: [], relationships: [] };
  const encoded = JSON.stringify(buildJsonPackage(data, { exportedBy: 'u1', exportedAt: '2026-07-17T00:00:00.000Z' }));
  assert.deepEqual(parseJsonPackage(encoded).records, data.records);
  assert.doesNotMatch(encoded, /password_hash|customer_address|secret|private/);
});

test('supported CSV fields round trip commas, quotes, newlines, and metadata', () => {
  const data = { records: [toLibraryRecord(row)], details: [], documents: [], documentRecords: [], relationships: [] };
  const parsed = parseCsvBundle(serializeCsvBundle(data));
  assert.equal(parsed.records[0].id, 'r1');
  assert.equal(parsed.records[0].name, 'Panel, 24"');
  assert.deepEqual(parsed.records[0].metadata, { gauge: 24 });
});

test('exchange rejects unsupported schema versions', () => {
  assert.throws(() => parseJsonPackage('{"schemaVersion":2,"records":[]}'), {
    code: 'LIBRARY_SCHEMA_UNSUPPORTED',
  });
});
