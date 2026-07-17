# Library Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a privacy-safe, versioned Library Core that SuperAdmin can use to manage catalog records, relationships, documents, imports, exports, and legacy migration without changing the working configurator.

**Architecture:** Add a unified `library_records` model with focused typed-detail and relationship tables, then expose it through capability-checked actions on the existing consolidated SuperAdmin function. Keep validation, DTO projection, import/export, migration, and UI client responsibilities in separate modules; existing Materials and Colors APIs remain the configurator runtime source during this sprint.

**Tech Stack:** Node.js 24 ESM, Vercel Functions, Neon Serverless Postgres, React 18, Vite 5, native `node:test`, JSON, CSV.

## Global Constraints

- Do not change XML parsing, ESX/EagleView reader work, 3D geometry, pricing, projects, sharing, approval, HTML export, or PDF reports.
- Existing `materials` and `colors` tables remain the configurator runtime source during this sprint.
- Preserve existing legacy rows and saved-project references; Library deletion is reversible archive/restore only.
- Use stable UUID record identities; names are not identities.
- A record code is unique within `(record_type, scope, tenant_id)` when present.
- Every mutation checks the exact catalog capability server-side and requires a non-empty reason.
- Return explicit allowlisted DTOs; never expose tenant projects, customer data, designs, measurements, pricing history, reports, attachments, credentials, or password data.
- JSON is the canonical lossless exchange format; CSV is a multi-file editing format.
- Import dry run never writes; import commit requires a decision for every conflict and runs transactionally.
- Use external asset/document URLs only; managed uploads and link-health workers are outside this sprint.
- Reserve Product Knowledge and Trade Community references without implementing either module.
- Communication delivery remains deferred; notification rows staying `pending` is expected.
- Capture/Scanner submits tenant-private, `pending_review` records through the documented handoff after this foundation.
- Do not add a CSV dependency; implement the small RFC-4180-compatible parser/serializer needed by the documented columns.
- Every approved artifact follows `configurator/docs/PROJECT_ARTIFACTS.md` and is mirrored to `C:\Users\ilyam\OneDrive\Desktop\Estimating app with 3D` by the user from the committed/downloadable copy.

---

## File Map

| File | Responsibility |
| --- | --- |
| `api/_lib/libraryPolicy.js` | Enums, normalization, record/relationship rules, URL validation, category-cycle detection |
| `api/_lib/libraryDto.js` | Privacy-safe record, relationship, document, batch, and migration projections |
| `api/_lib/libraryService.js` | Database reads and transactional mutations for records, documents, and relationships |
| `api/_lib/libraryExchange.js` | Canonical JSON export plus supported CSV parsing/serialization |
| `api/_lib/libraryImport.js` | Dry-run classification, explicit conflict validation, transactional commit planning |
| `api/_lib/libraryMigration.js` | Idempotent conversion of legacy tenant Materials and Colors |
| `api/_lib/libraryRoutes.js` | HTTP action dispatch beneath the consolidated SuperAdmin function |
| `api/_lib/db.js`, `db/schema.sql` | Runtime and reference Library schema |
| `api/superadmin/index.js` | Delegate `library.*` actions after capability authorization |
| `src/lib/libraryClient.js` | Browser request helpers and exchange-file downloads |
| `src/components/LibraryConsole.jsx` | Library administration workflow inside Platform Console |
| `src/components/PlatformConsole.jsx`, `src/index.css` | Mount and style the Library section |
| `docs/LIBRARY_OPERATIONS.md` | Operator workflows, formats, migration safety, and deferred capabilities |
| `docs/CAPTURE_LIBRARY_HANDOFF.md` | Stable request contract for the urgent Capture/Scanner prototype |
| `docs/milestones/2026-07-17-library-core-verification.md` | Evidence and release-readiness record |

### Task 1: Library Policy Contract

**Files:**
- Create: `configurator/api/_lib/libraryPolicy.js`
- Create: `configurator/tests/libraryPolicy.test.mjs`

**Interfaces:**
- Produces: `RECORD_TYPES`, `SCOPES`, `LIFECYCLE_STATUSES`, `REVIEW_STATUSES`, `QUALITY_LEVELS`, `SOURCE_TYPES`, `RELATIONSHIP_TYPES` as frozen arrays.
- Produces: `normalizeLibraryRecord(input, actorTenantId): LibraryRecordInput`.
- Produces: `validateRelationship(sourceType, targetType, relationshipType): void`.
- Produces: `assertNoCategoryCycle(edges, sourceId, targetId): void`.
- Produces: `LibraryValidationError` with stable `code` and `details` fields.

- [ ] **Step 1: Write failing policy tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLibraryRecord, validateRelationship, assertNoCategoryCycle,
} from '../api/_lib/libraryPolicy.js';

test('tenant records require and retain the actor tenant', () => {
  const record = normalizeLibraryRecord({
    recordType: 'product', scope: 'tenant', tenantId: 'tenant-1', name: '24 ga Coil',
    reviewStatus: 'draft', qualityLevel: 'test', sourceType: 'manual', metadata: {},
  }, 'tenant-1');
  assert.equal(record.tenantId, 'tenant-1');
  assert.equal(record.lifecycleStatus, 'active');
});

test('global records reject tenant ids and unsafe URLs', () => {
  assert.throws(() => normalizeLibraryRecord({
    recordType: 'color', scope: 'global', tenantId: 'tenant-1', name: 'Black',
  }, 'tenant-1'), { code: 'LIBRARY_SCOPE_INVALID' });
  assert.throws(() => normalizeLibraryRecord({
    recordType: 'color', scope: 'global', name: 'Black', thumbnailUrl: 'javascript:alert(1)',
  }, null), { code: 'LIBRARY_URL_INVALID' });
});

test('relationship matrix permits supported compatibility only', () => {
  assert.doesNotThrow(() => validateRelationship('product', 'profile', 'compatible_with'));
  assert.throws(() => validateRelationship('manufacturer', 'color', 'compatible_with'), {
    code: 'LIBRARY_RELATIONSHIP_INVALID',
  });
});

test('category parent graph rejects a cycle', () => {
  const edges = [{ sourceId: 'b', targetId: 'a' }, { sourceId: 'c', targetId: 'b' }];
  assert.throws(() => assertNoCategoryCycle(edges, 'a', 'c'), {
    code: 'LIBRARY_CATEGORY_CYCLE',
  });
});
```

- [ ] **Step 2: Run the policy test and verify the missing-module failure**

Run: `cd configurator && node --test tests/libraryPolicy.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `libraryPolicy.js`.

- [ ] **Step 3: Implement enums, normalization, and graph validation**

```js
export const RECORD_TYPES = Object.freeze(['product', 'profile', 'color', 'category', 'manufacturer', 'supplier', 'collection', 'catalog']);
export const SCOPES = Object.freeze(['global', 'tenant']);
export const LIFECYCLE_STATUSES = Object.freeze(['active', 'archived']);
export const REVIEW_STATUSES = Object.freeze(['draft', 'pending_review', 'approved', 'rejected']);
export const QUALITY_LEVELS = Object.freeze(['test', 'low', 'standard', 'verified']);
export const SOURCE_TYPES = Object.freeze(['manual', 'legacy_migration', 'import', 'manufacturer', 'supplier', 'capture']);
export const RELATIONSHIP_TYPES = Object.freeze(['categorized_as', 'manufactured_by', 'supplied_by', 'included_in_collection', 'included_in_catalog', 'compatible_with', 'replaces', 'related_to']);

export class LibraryValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message); this.name = 'LibraryValidationError'; this.code = code; this.details = details;
  }
}

const allowedCompatibility = new Set(['product:profile', 'profile:product', 'product:color', 'color:product', 'profile:color', 'color:profile']);
const relationTargets = {
  categorized_as: new Set(['category']), manufactured_by: new Set(['manufacturer']),
  supplied_by: new Set(['supplier']), included_in_collection: new Set(['collection']),
  included_in_catalog: new Set(['catalog']),
};
const clean = (value) => String(value ?? '').trim();
const enumValue = (value, allowed, fallback, code) => {
  const result = clean(value || fallback);
  if (!allowed.includes(result)) throw new LibraryValidationError(code, `Unsupported value: ${result}`);
  return result;
};
const externalUrl = (value, field) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('protocol');
    return parsed.toString();
  } catch { throw new LibraryValidationError('LIBRARY_URL_INVALID', `${field} must be an HTTP(S) URL`, { field }); }
};

export function normalizeLibraryRecord(input, actorTenantId) {
  const scope = enumValue(input.scope, SCOPES, 'tenant', 'LIBRARY_SCOPE_INVALID');
  const tenantId = scope === 'tenant' ? clean(input.tenantId || actorTenantId) : null;
  if ((scope === 'tenant' && !tenantId) || (scope === 'global' && input.tenantId)) {
    throw new LibraryValidationError('LIBRARY_SCOPE_INVALID', 'Tenant scope requires one matching tenant; global scope forbids one');
  }
  if (scope === 'tenant' && actorTenantId && tenantId !== actorTenantId) {
    throw new LibraryValidationError('LIBRARY_SCOPE_INVALID', 'Tenant does not match actor scope');
  }
  const name = clean(input.name);
  if (!name) throw new LibraryValidationError('LIBRARY_NAME_REQUIRED', 'Name is required');
  return {
    recordType: enumValue(input.recordType, RECORD_TYPES, '', 'LIBRARY_TYPE_INVALID'), scope, tenantId, name,
    code: clean(input.code) || null, description: clean(input.description) || null,
    lifecycleStatus: enumValue(input.lifecycleStatus, LIFECYCLE_STATUSES, 'active', 'LIBRARY_LIFECYCLE_INVALID'),
    reviewStatus: enumValue(input.reviewStatus, REVIEW_STATUSES, 'draft', 'LIBRARY_REVIEW_INVALID'),
    qualityLevel: enumValue(input.qualityLevel, QUALITY_LEVELS, 'test', 'LIBRARY_QUALITY_INVALID'),
    sourceType: enumValue(input.sourceType, SOURCE_TYPES, 'manual', 'LIBRARY_SOURCE_INVALID'),
    externalReference: clean(input.externalReference) || null, sourceUrl: externalUrl(input.sourceUrl, 'sourceUrl'),
    attribution: clean(input.attribution) || null, thumbnailUrl: externalUrl(input.thumbnailUrl, 'thumbnailUrl'),
    textureUrl: externalUrl(input.textureUrl, 'textureUrl'), geometryUrl: externalUrl(input.geometryUrl, 'geometryUrl'),
    knowledgeSpaceId: input.knowledgeSpaceId || null, metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };
}

export function validateRelationship(sourceType, targetType, relationshipType) {
  if (!RECORD_TYPES.includes(sourceType) || !RECORD_TYPES.includes(targetType) || !RELATIONSHIP_TYPES.includes(relationshipType)) {
    throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'Unknown relationship contract');
  }
  if (relationshipType === 'compatible_with' && !allowedCompatibility.has(`${sourceType}:${targetType}`)) {
    throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'Unsupported compatibility pair');
  }
  if (relationTargets[relationshipType] && !relationTargets[relationshipType].has(targetType)) {
    throw new LibraryValidationError('LIBRARY_RELATIONSHIP_INVALID', 'Unsupported relationship target');
  }
}

export function assertNoCategoryCycle(edges, sourceId, targetId) {
  const parents = new Map(edges.map((edge) => [edge.sourceId, edge.targetId]));
  parents.set(sourceId, targetId);
  const seen = new Set([sourceId]);
  for (let cursor = targetId; cursor; cursor = parents.get(cursor)) {
    if (seen.has(cursor)) throw new LibraryValidationError('LIBRARY_CATEGORY_CYCLE', 'Category parent would create a cycle');
    seen.add(cursor);
  }
}
```

- [ ] **Step 4: Run policy and full regression tests**

Run: `cd configurator && node --test tests/libraryPolicy.test.mjs && npm test`

Expected: the focused test and all existing tests PASS.

- [ ] **Step 5: Commit the policy contract**

```bash
git add configurator/api/_lib/libraryPolicy.js configurator/tests/libraryPolicy.test.mjs
git commit -m "feat: define Library Core policy contract"
```

### Task 2: Runtime and Reference Database Schema

**Files:**
- Modify: `configurator/api/_lib/db.js`
- Modify: `configurator/db/schema.sql`
- Create: `configurator/tests/librarySchema.test.mjs`

**Interfaces:**
- Consumes: enum string values from `libraryPolicy.js`.
- Produces: idempotent tables `library_records`, `library_product_details`, `library_profile_details`, `library_color_details`, `library_relationships`, `library_documents`, `library_document_records`, `library_import_batches`, and `library_migrations`.

- [ ] **Step 1: Add a failing schema-equivalence contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredTables = ['library_records', 'library_product_details', 'library_profile_details', 'library_color_details', 'library_relationships', 'library_documents', 'library_document_records', 'library_import_batches', 'library_migrations'];

test('runtime and reference schemas contain every Library Core table and critical constraints', async () => {
  const runtime = await readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8');
  const reference = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  for (const table of requiredTables) {
    assert.match(runtime, new RegExp(`create table if not exists ${table}`));
    assert.match(reference, new RegExp(`create table if not exists ${table}`));
  }
  for (const source of [runtime, reference]) {
    assert.match(source, /version integer not null default 1 check \(version > 0\)/);
    assert.match(source, /library_record_code_scope_unique/);
    assert.match(source, /unique \(migration_key\)/);
  }
});
```

- [ ] **Step 2: Run the schema test and verify it fails**

Run: `cd configurator && node --test tests/librarySchema.test.mjs`

Expected: FAIL because `library_records` is absent.

- [ ] **Step 3: Add identical additive DDL to both schema sources**

Add the following statements to the migration list in `ensureSchema()` and as direct statements in `db/schema.sql`:

```sql
create table if not exists library_records (
  id uuid primary key, record_type text not null check (record_type in ('product','profile','color','category','manufacturer','supplier','collection','catalog')),
  scope text not null check (scope in ('global','tenant')), tenant_id uuid references users(id),
  name text not null, code text, description text, lifecycle_status text not null default 'active' check (lifecycle_status in ('active','archived')),
  review_status text not null default 'draft' check (review_status in ('draft','pending_review','approved','rejected')),
  quality_level text not null default 'test' check (quality_level in ('test','low','standard','verified')),
  version integer not null default 1 check (version > 0),
  source_type text not null default 'manual' check (source_type in ('manual','legacy_migration','import','manufacturer','supplier','capture')),
  external_reference text, source_url text, attribution text, thumbnail_url text, texture_url text, geometry_url text,
  knowledge_space_id text, metadata jsonb not null default '{}'::jsonb,
  created_by uuid references users(id), updated_by uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((scope = 'global' and tenant_id is null) or (scope = 'tenant' and tenant_id is not null))
);
create unique index if not exists library_record_code_scope_unique on library_records (record_type, scope, coalesce(tenant_id::text, ''), lower(code)) where code is not null;
create index if not exists library_records_search_idx on library_records (record_type, scope, lifecycle_status, review_status, quality_level, lower(name));
create table if not exists library_product_details (record_id uuid primary key references library_records(id), unit text, price numeric(14,4), application_metadata jsonb not null default '{}'::jsonb, legacy_material_id uuid);
create table if not exists library_profile_details (record_id uuid primary key references library_records(id), profile_family text, geometry_metadata jsonb not null default '{}'::jsonb, legacy_profile_label text);
create table if not exists library_color_details (record_id uuid primary key references library_records(id), color_code text, hex text, series text, legacy_color_id uuid);
create table if not exists library_relationships (id uuid primary key, source_record_id uuid not null references library_records(id), target_record_id uuid not null references library_records(id), relationship_type text not null, lifecycle_status text not null default 'active', version integer not null default 1 check (version > 0), attribution text, metadata jsonb not null default '{}'::jsonb, created_by uuid references users(id), updated_by uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (source_record_id, target_record_id, relationship_type));
create table if not exists library_documents (id uuid primary key, title text not null, document_type text not null, url text not null, publisher text, jurisdiction text, effective_date date, expiry_date date, language text, checksum text, review_status text not null default 'draft', is_official boolean not null default false, metadata jsonb not null default '{}'::jsonb, created_by uuid references users(id), updated_by uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists library_document_records (document_id uuid not null references library_documents(id), record_id uuid not null references library_records(id), primary key (document_id, record_id));
create table if not exists library_import_batches (id uuid primary key, actor_id uuid not null references users(id), scope text not null, tenant_id uuid references users(id), schema_version integer not null, source_format text not null, status text not null, support_reference text not null, summary jsonb not null default '{}'::jsonb, decisions jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), committed_at timestamptz);
create table if not exists library_migrations (id uuid primary key, migration_key text not null, tenant_id uuid not null references users(id), version integer not null, status text not null, summary jsonb not null default '{}'::jsonb, error_code text, started_at timestamptz not null default now(), completed_at timestamptz, unique (migration_key));
```

- [ ] **Step 4: Verify schema and regressions**

Run: `cd configurator && node --test tests/librarySchema.test.mjs && npm test`

Expected: all tests PASS and schema setup remains idempotent.

- [ ] **Step 5: Commit the additive schema**

```bash
git add configurator/api/_lib/db.js configurator/db/schema.sql configurator/tests/librarySchema.test.mjs
git commit -m "feat: add versioned Library Core schema"
```

### Task 3: Privacy-Safe DTOs and Exchange Formats

**Files:**
- Create: `configurator/api/_lib/libraryDto.js`
- Create: `configurator/api/_lib/libraryExchange.js`
- Create: `configurator/tests/libraryExchange.test.mjs`

**Interfaces:**
- Produces: `toLibraryRecord(row)`, `toLibraryRelationship(row)`, `toLibraryDocument(row)`, `toLibraryImportBatch(row)`, `toLibraryMigration(row)`.
- Produces: `buildJsonPackage(data, context)`, `parseJsonPackage(text)`, `serializeCsvBundle(data)`, `parseCsvBundle(files)`.
- JSON package schema version is integer `1`; CSV bundle keys are `records.csv`, `details.csv`, `documents.csv`, `document-records.csv`, and `relationships.csv`.

- [ ] **Step 1: Write failing privacy and round-trip tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { toLibraryRecord } from '../api/_lib/libraryDto.js';
import { buildJsonPackage, parseJsonPackage, serializeCsvBundle, parseCsvBundle } from '../api/_lib/libraryExchange.js';

const record = { id: 'r1', record_type: 'product', scope: 'tenant', tenant_id: 't1', name: 'Panel', code: 'P-1', version: 2, metadata: {}, password_hash: 'secret', customer_address: 'private' };

test('record DTO excludes unapproved and private fields', () => {
  assert.deepEqual(toLibraryRecord(record), {
    id: 'r1', recordType: 'product', scope: 'tenant', tenantId: 't1', name: 'Panel', code: 'P-1',
    description: null, lifecycleStatus: 'active', reviewStatus: 'draft', qualityLevel: 'test', version: 2,
    sourceType: 'manual', externalReference: null, sourceUrl: null, attribution: null, thumbnailUrl: null,
    textureUrl: null, geometryUrl: null, knowledgeSpaceId: null, communityTopicIds: [], metadata: {},
    createdAt: null, updatedAt: null,
  });
});

test('canonical JSON and supported CSV fields round trip stable IDs', () => {
  const data = { records: [toLibraryRecord(record)], details: [], documents: [], documentRecords: [], relationships: [] };
  assert.deepEqual(parseJsonPackage(JSON.stringify(buildJsonPackage(data, { exportedBy: 'u1' }))).records, data.records);
  assert.equal(parseCsvBundle(serializeCsvBundle(data)).records[0].id, 'r1');
});
```

- [ ] **Step 2: Run and verify missing-module failure**

Run: `cd configurator && node --test tests/libraryExchange.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement allowlisted DTOs and deterministic exchange**

Use a fixed field map for every DTO. `buildJsonPackage` must return `{ schemaVersion: 1, package: { exportedAt, exportedBy }, ...data }`; `parseJsonPackage` must reject non-object input and schema versions other than `1` with `LIBRARY_SCHEMA_UNSUPPORTED`. Implement CSV quoting by doubling embedded quotes and quoting values containing commas, quotes, CR, or LF. Encode nested values as JSON strings and parse only the documented nested columns.

```js
const csvCell = (value) => {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
export function buildJsonPackage(data, context) {
  return { schemaVersion: 1, package: { exportedAt: new Date().toISOString(), exportedBy: context.exportedBy }, ...data };
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `cd configurator && node --test tests/libraryExchange.test.mjs && npm test`

Expected: round trips PASS and private sentinel fields never appear in serialized output.

- [ ] **Step 5: Commit DTO and exchange contracts**

```bash
git add configurator/api/_lib/libraryDto.js configurator/api/_lib/libraryExchange.js configurator/tests/libraryExchange.test.mjs
git commit -m "feat: add privacy-safe Library exchange formats"
```

### Task 4: Transactional Library Service

**Files:**
- Create: `configurator/api/_lib/libraryService.js`
- Create: `configurator/tests/libraryService.test.mjs`

**Interfaces:**
- Consumes: `normalizeLibraryRecord`, `validateRelationship`, `assertNoCategoryCycle`, DTO functions, and injected `{ sql, randomUUID }` dependencies.
- Produces: `createLibraryService(deps)` with `listRecords(filters)`, `getRecord(id)`, `createRecord(actor, input)`, `updateRecord(actor, id, expectedVersion, input)`, `setRecordLifecycle(actor, id, expectedVersion, status)`, `upsertDocument(actor, input)`, `createRelationship(actor, input)`, and `archiveRelationship(actor, id, expectedVersion)`.
- Every mutation returns `{ value, audit }`; callers persist mutation and audit in one `sql.transaction`.

- [ ] **Step 1: Write failing service tests with an injected store spy**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLibraryService } from '../api/_lib/libraryService.js';

test('update uses optimistic version and increments it exactly once', async () => {
  const calls = [];
  const service = createLibraryService({
    randomUUID: () => 'new-id',
    store: {
      getRecord: async () => ({ id: 'r1', version: 3, scope: 'tenant', tenant_id: 't1', record_type: 'product' }),
      updateRecord: async (change) => { calls.push(change); return { ...change, id: 'r1' }; },
      transaction: async (work) => work(), appendAudit: async () => {},
    },
  });
  await service.updateRecord({ id: 'u1', tenantId: 't1' }, 'r1', 3, { recordType: 'product', scope: 'tenant', name: 'Panel 2' }, 'correct metadata');
  assert.equal(calls[0].version, 4);
});

test('archive is reversible and rejects stale versions', async () => {
  const service = createLibraryService({ randomUUID: crypto.randomUUID, store: fakeStore({ id: 'r1', version: 4 }) });
  await assert.rejects(service.setRecordLifecycle({ id: 'u1' }, 'r1', 3, 'archived', 'duplicate'), { code: 'LIBRARY_VERSION_CONFLICT' });
});
```

- [ ] **Step 2: Run and verify missing service failure**

Run: `cd configurator && node --test tests/libraryService.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement service orchestration and the Neon store adapter**

Implement `createLibraryService` with injected methods so unit tests do not require Neon. Export `createNeonLibraryStore(sql)` from the same module. Before update/archive/restore, compare `expectedVersion` to the current row and throw `{ code: 'LIBRARY_VERSION_CONFLICT' }` on mismatch. Wrap each mutation, typed-detail write, relationship/document link, and `superadmin_audit_events` append in one transaction. Store audit metadata as IDs, types, versions, counts, reason, request/support reference; do not store full imported records or customer data.

- [ ] **Step 4: Verify service and regression tests**

Run: `cd configurator && node --test tests/libraryService.test.mjs && npm test`

Expected: service tests and all regressions PASS.

- [ ] **Step 5: Commit the service**

```bash
git add configurator/api/_lib/libraryService.js configurator/tests/libraryService.test.mjs
git commit -m "feat: add transactional Library service"
```

### Task 5: Two-Phase Import Pipeline

**Files:**
- Create: `configurator/api/_lib/libraryImport.js`
- Create: `configurator/tests/libraryImport.test.mjs`

**Interfaces:**
- Consumes: parsed exchange data, policy validation, and service/store interfaces.
- Produces: `dryRunLibraryImport(actor, packageData, repository): ImportDryRun`.
- Produces: `commitLibraryImport(actor, batchId, decisions, repository): ImportCommitResult`.
- Conflict keys use `{ recordType, scope, tenantId, code }`; decisions are `skip`, `update`, or `create_separate`.

- [ ] **Step 1: Write failing dry-run and commit tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { dryRunLibraryImport, commitLibraryImport } from '../api/_lib/libraryImport.js';

test('dry run classifies without writes', async () => {
  const repository = importRepository({ existingByCode: new Map([['product:tenant:t1:P-1', { id: 'existing', name: 'Old' }]]) });
  const result = await dryRunLibraryImport({ id: 'u1', tenantId: 't1' }, packageWith([
    { id: 'a', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-2', name: 'New' },
    { id: 'b', recordType: 'product', scope: 'tenant', tenantId: 't1', code: 'P-1', name: 'Changed' },
  ]), repository);
  assert.deepEqual(result.summary, { new: 1, matching: 0, conflicting: 1, invalid: 0 });
  assert.equal(repository.writeCount, 0);
});

test('commit rejects missing decisions and rolls back invalid batches', async () => {
  await assert.rejects(commitLibraryImport({ id: 'u1' }, 'batch-1', {}, importRepositoryWithConflict()), { code: 'LIBRARY_IMPORT_DECISIONS_REQUIRED' });
});
```

- [ ] **Step 2: Run and verify missing import module failure**

Run: `cd configurator && node --test tests/libraryImport.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement classification and transactional revalidation**

Dry run must parse/normalize every row; resolve references; validate URLs, scope, duplicate codes, relationship pairs, and category cycles; and return row-level stable codes under `new`, `matching`, `conflicting`, and `invalid`. Persist only the batch summary and a server-side normalized staging payload in `library_import_batches.summary`, never the original uploaded bytes. Commit reloads the batch, requires one valid decision per conflict, repeats all validation against current rows, applies records/details/documents/links/relationships in a single transaction, writes one aggregate audit event, and marks the batch `committed` only inside that transaction.

- [ ] **Step 4: Run import and full regression tests**

Run: `cd configurator && node --test tests/libraryImport.test.mjs && npm test`

Expected: dry run performs zero writes; incomplete/invalid commit performs zero writes; successful commit is atomic.

- [ ] **Step 5: Commit the import pipeline**

```bash
git add configurator/api/_lib/libraryImport.js configurator/tests/libraryImport.test.mjs
git commit -m "feat: add two-phase Library imports"
```

### Task 6: Idempotent Legacy Migration

**Files:**
- Create: `configurator/api/_lib/libraryMigration.js`
- Create: `configurator/tests/libraryMigration.test.mjs`

**Interfaces:**
- Produces: `planLegacyLibraryMigration(tenantId, legacyData, existingLibrary): MigrationPlan`.
- Produces: `runLegacyLibraryMigration(actor, tenantId, repository): MigrationResult`.
- Migration key is `library-core-v1:<tenantId>`; source rows are never updated or deleted.

- [ ] **Step 1: Write failing mapping and idempotency tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { planLegacyLibraryMigration } from '../api/_lib/libraryMigration.js';

test('migration preserves collision-free IDs and maps material-color compatibility', () => {
  const plan = planLegacyLibraryMigration('t1', {
    materials: [{ id: 'm1', name: 'Panel', kind: 'metal', price: 4.25, profiles: ['Standing Seam'], color_ids: ['c1'] }],
    colors: [{ id: 'c1', name: 'Black', code: 'BK', hex: '#111111', series: 'Standard' }],
  }, { ids: new Set(), migrationKeys: new Set() });
  assert.equal(plan.records.find((item) => item.recordType === 'product').id, 'm1');
  assert.deepEqual(plan.relationships.map((item) => item.relationshipType), ['compatible_with']);
});

test('completed migration key produces a no-op plan', () => {
  const plan = planLegacyLibraryMigration('t1', { materials: [], colors: [] }, { ids: new Set(), migrationKeys: new Set(['library-core-v1:t1']) });
  assert.equal(plan.status, 'already_completed');
});
```

- [ ] **Step 2: Run and verify missing migration module failure**

Run: `cd configurator && node --test tests/libraryMigration.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement deterministic planning and atomic execution**

Map each material to a tenant-private product with `sourceType: 'legacy_migration'`, original price/unit/kind/profile data in product detail and provenance metadata. Map each color likewise to color detail. Create category records for legacy folders and profile records for distinct profile labels; connect them through `categorized_as` and `compatible_with`. Preserve the legacy UUID if unused; otherwise generate a new UUID and retain the original in detail and metadata. In one transaction, claim the unique migration key, insert all planned rows and relationships, append a privacy-safe audit event, and mark completion. On failure, roll back the entire transaction and return the stable error code from the failed validation.

- [ ] **Step 4: Run migration and regression tests**

Run: `cd configurator && node --test tests/libraryMigration.test.mjs && npm test`

Expected: repeat plans are no-ops, mappings pass, and all existing Materials/Colors tests remain unchanged.

- [ ] **Step 5: Commit migration support**

```bash
git add configurator/api/_lib/libraryMigration.js configurator/tests/libraryMigration.test.mjs
git commit -m "feat: migrate legacy catalog data into Library"
```

### Task 7: Consolidated SuperAdmin Library API

**Files:**
- Create: `configurator/api/_lib/libraryRoutes.js`
- Modify: `configurator/api/superadmin/index.js`
- Modify: `configurator/vercel.json`
- Create: `configurator/tests/libraryRoutes.test.mjs`

**Interfaces:**
- Consumes: Library service, import, exchange, migration modules and existing `requireCapability`.
- Produces actions: `library.records`, `library.record`, `library.relationships`, `library.documents`, `library.export`, `library.import.dry-run`, `library.import.commit`, `library.migration.status`, `library.migration.run`.
- Route alias `/api/superadmin/library` rewrites to `/api/superadmin?action=library.records`; detailed operations pass their explicit `action` query.

- [ ] **Step 1: Write a failing API authorization/dispatch contract test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every Library action maps to an exact catalog capability', async () => {
  const source = await readFile(new URL('../api/superadmin/index.js', import.meta.url), 'utf8');
  for (const [action, capability] of Object.entries({
    'library.records': 'catalog.read', 'library.record': 'catalog.write',
    'library.relationships': 'catalog.write', 'library.documents': 'catalog.write',
    'library.export': 'catalog.export', 'library.import.dry-run': 'catalog.import',
    'library.import.commit': 'catalog.import', 'library.migration.status': 'catalog.read',
    'library.migration.run': 'catalog.import',
  })) {
    assert.match(source, new RegExp(`['"]${action}['"]\\s*:\\s*['"]${capability}['"]`));
  }
});
```

- [ ] **Step 2: Run and verify missing mappings**

Run: `cd configurator && node --test tests/libraryRoutes.test.mjs`

Expected: FAIL for `library.records`.

- [ ] **Step 3: Implement route delegation and stable errors**

Extend `capabilityByAction` with the exact mappings above. After the initial `requireCapability`, delegate actions beginning with `library.` to `handleLibraryAction({ req, res, actor, action, requestId })`. Enforce GET for reads/export/status and POST for mutations/import/migration. Require `reason` on each mutation. Convert `LibraryValidationError` to `{ error: { code, message, details }, requestId }` with HTTP 400, version conflicts to 409, missing records to 404, and unexpected errors to the existing safe 500 response. Add the route rewrite without creating another Vercel function.

- [ ] **Step 4: Run API, full, and build checks**

Run: `cd configurator && node --test tests/libraryRoutes.test.mjs && npm test && npm run build`

Expected: all tests PASS and both Vite builds complete successfully.

- [ ] **Step 5: Commit the consolidated API**

```bash
git add configurator/api/_lib/libraryRoutes.js configurator/api/superadmin/index.js configurator/vercel.json configurator/tests/libraryRoutes.test.mjs
git commit -m "feat: expose capability-checked Library API"
```

### Task 8: Platform Library Administration UI

**Files:**
- Create: `configurator/src/lib/libraryClient.js`
- Create: `configurator/src/components/LibraryConsole.jsx`
- Modify: `configurator/src/components/PlatformConsole.jsx`
- Modify: `configurator/src/index.css`
- Create: `configurator/tests/libraryConsole.test.mjs`

**Interfaces:**
- Consumes: consolidated actions and DTOs from Task 7.
- Produces: `LibraryConsole({ capabilities })` with Records, Organizations, Taxonomy, Relationships, Import/Export, and Migration views.
- Produces client helpers `listLibraryRecords`, `saveLibraryRecord`, `setLibraryRecordLifecycle`, `exportLibraryPackage`, `dryRunLibraryImport`, `commitLibraryImport`, and `runLibraryMigration`.

- [ ] **Step 1: Write a failing source contract for required workflows and privacy boundaries**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Library Console exposes approved sections and reserves future modules', async () => {
  const source = await readFile(new URL('../src/components/LibraryConsole.jsx', import.meta.url), 'utf8');
  for (const label of ['Records', 'Organizations', 'Taxonomy', 'Relationships', 'Import / Export', 'Migration']) assert.match(source, new RegExp(label));
  assert.match(source, /Product Knowledge/);
  assert.match(source, /Trade Community/);
  assert.match(source, /Coming next/);
  for (const forbidden of ['customer address', 'project measurements', 'password hash']) assert.doesNotMatch(source.toLowerCase(), new RegExp(forbidden));
});
```

- [ ] **Step 2: Run and verify missing component failure**

Run: `cd configurator && node --test tests/libraryConsole.test.mjs`

Expected: FAIL with `ENOENT` for `LibraryConsole.jsx`.

- [ ] **Step 3: Implement client helpers and capability-gated console**

Use the existing `superadminClient.js` fetch/error style. Render server-paginated filters for record type, scope, lifecycle, review, quality, code, and name. Use one form schema driven by record type, with focused product/profile/color detail fields and generic metadata JSON validation. Require a reason for create/edit/archive/restore, relationship, document, migration, and commit actions. Import UX must show dry-run counts and row errors, render one `skip/update/create separate` selector per conflict, disable Commit until all conflicts have decisions, and never call commit from file selection. Export downloads canonical JSON or a ZIP-free set of named CSV text files. Show Product Knowledge and Trade Community as disabled `Coming next` destinations. Hide write/import/export/review/publish controls unless the matching capability is present; the server remains authoritative.

- [ ] **Step 4: Run UI contracts, regressions, and build**

Run: `cd configurator && node --test tests/libraryConsole.test.mjs && npm test && npm run build`

Expected: tests PASS, production bundle builds, and existing configurator views compile unchanged.

- [ ] **Step 5: Commit the Platform UI**

```bash
git add configurator/src/lib/libraryClient.js configurator/src/components/LibraryConsole.jsx configurator/src/components/PlatformConsole.jsx configurator/src/index.css configurator/tests/libraryConsole.test.mjs
git commit -m "feat: add Library administration console"
```

### Task 9: Operations, Capture Handoff, Verification, and Artifact Record

**Files:**
- Create: `configurator/docs/LIBRARY_OPERATIONS.md`
- Create: `configurator/docs/CAPTURE_LIBRARY_HANDOFF.md`
- Create: `configurator/docs/milestones/2026-07-17-library-core-verification.md`
- Modify: `configurator/README.md`
- Modify: `configurator/scripts/smoke-test.mjs`
- Test: `configurator/tests/libraryDocumentation.test.mjs`

**Interfaces:**
- Documents the exact JSON/CSV schema version `1`, migration key, capability map, operational recovery, and Capture submission envelope.
- Capture envelope fields: `scope: 'tenant'`, `sourceType: 'capture'`, `reviewStatus: 'pending_review'`, `qualityLevel`, `captureConfidence`, contributor attribution, device/session reference, `metadata.scanner.schemaVersion`, and external asset URLs.

- [ ] **Step 1: Write a failing documentation and smoke contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('operations and Capture handoff document stable contracts', async () => {
  const operations = await readFile(new URL('../docs/LIBRARY_OPERATIONS.md', import.meta.url), 'utf8');
  const capture = await readFile(new URL('../docs/CAPTURE_LIBRARY_HANDOFF.md', import.meta.url), 'utf8');
  assert.match(operations, /schemaVersion.*1/s);
  assert.match(operations, /dry run.*zero database mutations/is);
  assert.match(operations, /pending.*email.*SMS/is);
  assert.match(capture, /sourceType.*capture/s);
  assert.match(capture, /reviewStatus.*pending_review/s);
  assert.match(capture, /captureConfidence/);
});
```

- [ ] **Step 2: Run and verify missing-document failure**

Run: `cd configurator && node --test tests/libraryDocumentation.test.mjs`

Expected: FAIL with `ENOENT` for `LIBRARY_OPERATIONS.md`.

- [ ] **Step 3: Write operator, Capture, and verification artifacts**

`LIBRARY_OPERATIONS.md` must include record lifecycle, capability matrix, filters, document-link policy, JSON/CSV columns, dry-run/commit sequence, conflict semantics, support references, migration run/retry behavior, rollback guidance, external-link limitations, and the expected pending state of email/SMS notifications. `CAPTURE_LIBRARY_HANDOFF.md` must include this valid example:

```json
{
  "recordType": "profile",
  "scope": "tenant",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "name": "Captured standing-seam profile",
  "reviewStatus": "pending_review",
  "qualityLevel": "test",
  "sourceType": "capture",
  "attribution": "Contributor display name",
  "geometryUrl": "https://assets.example/profile.glb",
  "metadata": {
    "scanner": {
      "schemaVersion": 1,
      "captureConfidence": 0.82,
      "deviceReference": "device-anonymous-7",
      "sessionReference": "capture-session-42",
      "measurements": { "unit": "mm", "points": [] }
    }
  }
}
```

Update the smoke script to assert unauthenticated Library access is rejected and `/api/health` plus the existing auth/project/configurator flows still work. Record commands, counts, build result, local browser checks, Preview result, Production result, known deferrals, commit, PR, and deployment URL in the milestone report; use `Not run — requires deployment` for deployment-only rows until those commands are actually executed, then replace those entries with evidence before release.

- [ ] **Step 4: Run complete local verification**

Run: `cd configurator && npm test && npm run build`

Expected: every test passes and both production/snapshot builds complete. Then run `npm run dev`, verify login, Platform → Library CRUD/archive/restore, dry-run/commit, export, migration status, project refresh restoration, HTML share, XML load, 3D rotation/skin/profile changes, measurements, and PDF generation in the browser. Stop with `Ctrl+C`.

- [ ] **Step 5: Perform review and deployment verification before release**

Run the `superpowers:requesting-code-review` and `superpowers:verification-before-completion` skills. After user authorization to publish, push the branch, open the PR, verify CI, merge, deploy Production, and run:

```bash
cd configurator
BASE_URL=https://ironwrap-configurator-gpt-lab.vercel.app npm run smoke
```

Expected: smoke PASS, Library endpoint rejects unauthenticated access, Production login and Platform Library workflows pass. Replace every deployment-only milestone row with the observed timestamp and result.

- [ ] **Step 6: Commit final artifacts**

```bash
git add configurator/docs/PROJECT_ARTIFACTS.md configurator/docs/LIBRARY_OPERATIONS.md configurator/docs/CAPTURE_LIBRARY_HANDOFF.md configurator/docs/milestones/2026-07-17-library-core-verification.md configurator/README.md configurator/scripts/smoke-test.mjs configurator/tests/libraryDocumentation.test.mjs
git commit -m "docs: complete Library Core operations and verification"
```

## Plan Self-Review Record

- **Spec coverage:** Tasks 1–9 cover record policy/versioning/scope, schema parity, typed details, all relationship classes and category cycles, external documents, privacy DTOs, JSON/CSV exchange, two-phase imports, idempotent legacy migration, named capabilities/audit, Platform Console workflows, Capture handoff, Product Knowledge/Community reservations, regressions, build, smoke, and milestone evidence.
- **Explicit exclusions preserved:** Current selectors stay on legacy tables; there is no permanent delete, managed upload, document mirroring, Product Knowledge page, Community posting/moderation, Capture implementation, contractor deactivation UI, communications worker, or 3D/XML/report alteration.
- **Type consistency:** API and UI use camelCase DTOs; database rows use snake_case; `recordType`, `reviewStatus`, `qualityLevel`, `sourceType`, `knowledgeSpaceId`, `communityTopicIds`, `expectedVersion`, `schemaVersion: 1`, and the three conflict decisions retain the same spelling throughout.
- **Artifact continuity:** The approved design, this plan, and the eventual verification report are registered in `docs/PROJECT_ARTIFACTS.md` for the required OneDrive mirror.
