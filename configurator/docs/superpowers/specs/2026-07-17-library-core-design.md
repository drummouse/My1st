# IronWrap Studio Library Core Design

## Purpose

Build the first usable Library administration system for IronWrap Studio. SuperAdmin will manage a unified catalog of products, profiles, colors, manufacturers, suppliers, collections, catalogs, and categories. Existing tenant Materials and Colors will migrate into tenant-private Library records without breaking saved projects or the working configurator.

This is Part 1 of a three-part information architecture:

1. **Library Core:** structured catalog records, taxonomy, compatibility, provenance, imports, and exports.
2. **Product Knowledge:** “everything about this product/profile/color,” including specifications, code compliance, certifications, installation, safety, warranties, and verified guidance.
3. **Trade Community:** topic-based spaces such as “Standing Seam Installers” for discussions, tricks, ideas, field experience, and how-to contributions.

Part 1 reserves stable references to Parts 2 and 3 but does not implement either module. The Capture/Scanner working prototype is the immediate priority after this Library foundation.

## Scope

### Included

- Global and tenant-private Library records.
- Products, profiles, colors, categories, manufacturers, suppliers, collections, and catalogs.
- Many-to-many organizational and taxonomy relationships.
- Product/profile/color compatibility relationships.
- External thumbnail, texture, geometry, technical-document, and source URLs.
- Provenance, attribution, quality, lifecycle, review, and version metadata.
- SuperAdmin create, edit, archive, restore, search, filter, and inspect operations.
- Privacy-safe DTOs and capability-checked consolidated APIs.
- JSON and CSV export.
- JSON and CSV import with dry-run validation and explicit conflict decisions.
- Idempotent migration of existing tenant Materials and Colors.
- Audit events for privileged mutations and committed imports.
- Reserved Product Knowledge and Trade Community references.
- Capture/Scanner handoff contract.

### Excluded

- Managed file uploads and document storage.
- Product Knowledge wiki pages and AI moderation.
- Trade Community posts, discussions, enforcement, and appeals.
- Capture/Scanner application or submission workflow.
- Contractor-facing inherited-record deactivation UI.
- Immediate replacement of current configurator selectors.
- Changes to XML parsing, ESX/EagleView readers, 3D geometry, pricing, projects, sharing, approval, HTML export, or PDF reports.
- Permanent deletion.

## Architecture

Use a unified versioned record model with typed detail tables. Shared fields and lifecycle rules live on `library_records`; product-, profile-, and color-specific fields live on focused detail tables. Organization and taxonomy entities use the same stable record identity so relationships, audit, import/export, Knowledge links, and Community links follow one contract.

Core records never derive identity from names or codes. UUIDs remain stable across edits and exports. Core typed fields remain validated while an extensible JSON metadata object carries future Capture/Scanner and integration data.

The Library API is consolidated under `/api/superadmin/library` to respect Vercel function limits. Server routes check named capabilities through `requireCapability`; UI visibility is not authorization. Explicit DTO functions return allowlisted fields rather than raw database rows.

## Record Model

Every Library record contains:

- `id`: stable UUID.
- `record_type`: `product`, `profile`, `color`, `category`, `manufacturer`, `supplier`, `collection`, or `catalog`.
- `scope`: `global` or `tenant`.
- `tenant_id`: required for tenant scope and null for global scope.
- `name`, optional `code`, and optional `description`.
- `lifecycle_status`: `active` or `archived`.
- `review_status`: `draft`, `pending_review`, `approved`, or `rejected`.
- `quality_level`: `test`, `low`, `standard`, or `verified`.
- `version`: positive integer incremented by meaningful edits.
- `source_type`: `manual`, `legacy_migration`, `import`, `manufacturer`, `supplier`, or `capture`.
- `external_reference` and `source_url`.
- `attribution` and provenance metadata.
- `thumbnail_url`, `texture_url`, and `geometry_url` as optional external asset links.
- `knowledge_space_id`: nullable reserved Part 2 reference.
- `community_topic_ids`: reserved Part 3 references stored through a relation table when Part 3 exists; exports expose an empty array until then.
- `metadata`: versioned extensible JSON.
- `created_by`, `updated_by`, `created_at`, and `updated_at`.

Codes are unique within `(record_type, scope, tenant_id)` when present. Display names are not unique.

Typed details:

- Product: unit, price, construction/application metadata, and legacy material ID.
- Profile: profile family, geometry metadata, and legacy profile label.
- Color: code/hex/series and legacy color ID.
- Category: parent category ID with cycle prevention.
- Manufacturer/Supplier/Collection/Catalog: organization/catalog-specific reference metadata.

The model does not hardcode roof, siding, or other construction categories. Those are data records and relationships, allowing future trade expansion without schema replacement.

## Relationships

`library_relationships` connects records using centralized relationship types:

- `categorized_as`
- `manufactured_by`
- `supplied_by`
- `included_in_collection`
- `included_in_catalog`
- `compatible_with`
- `replaces`
- `related_to`

Relationships are directed, versionable, attributable, and individually archivable. Validation enforces allowed source/target combinations. `compatible_with` supports product ↔ profile, product ↔ color, and profile ↔ color links. The same product, profile, or color may relate to multiple manufacturers, suppliers, collections, catalogs, and categories.

Category parent links cannot form cycles. Archiving a record preserves historical relationships and project references but prevents it from being offered for new Library selections.

## Technical Document Links

Part 1 stores external links and structured metadata for:

- Technical specifications
- Code compliance and jurisdictional references
- Certifications and test reports
- Manufacturer documentation
- Installation instructions
- Health and safety materials
- Warranty documents
- Engineering and architectural resources

Document metadata includes title, document type, URL, source/publisher, jurisdiction, effective date, expiry date, language, checksum when known, review status, and whether the source is official or unverified. Official/manufacturer content must be visually distinct from community interpretation in future Part 2.

Technical links live in `library_documents`. A document has its own stable ID and can connect to multiple Library records through `library_document_records`, allowing one code bulletin, safety sheet, or installation guide to apply to several products and profiles without duplication.

Part 1 does not download, mirror, or permanently store external documents. Managed document storage is a later Product Knowledge capability.

## SuperAdmin Console

Add a Library area inside the existing Platform Console with these views:

- **Records:** products, profiles, and colors.
- **Organizations:** manufacturers and suppliers.
- **Taxonomy:** categories, collections, and catalogs.
- **Relationships:** compatibility and organizational links.
- **Import/Export:** upload/parse, dry-run report, conflict decisions, commit, and download.
- **Migration:** legacy migration status and counts.

Search supports record type, scope, lifecycle, review status, quality, code, and name. Lists use server pagination. Mutation forms require a reason. Knowledge and Community entries appear as disabled “Coming next” links backed by reserved references.

No console view exposes tenant projects, customer names, addresses, designs, measurements, pricing history, attachments, reports, or credentials.

## Import and Export

JSON is the canonical lossless format and contains:

- `schemaVersion`
- package metadata
- records
- typed details
- document links
- relationships
- provenance

CSV supports simple bulk editing. Separate CSV sections/files represent records, typed details, document links, and relationships so many-to-many data is not flattened ambiguously.

Every import follows two explicit phases:

1. **Dry run:** parse, normalize, validate, classify rows, and return `new`, `matching`, `conflicting`, and `invalid` results without database changes.
2. **Commit:** require explicit decisions for every conflict (`skip`, `update`, or `create_separate`), revalidate against current data, and apply the whole batch transactionally.

No destructive conflict resolution is automatic. Invalid URLs, unknown references, wrong scope, duplicate codes, category cycles, malformed JSON/CSV, unsupported schema versions, and invalid relationship pairs block commit. Import batches receive IDs and support references; audits store counts and decisions, never full file contents.

Export is scope- and capability-aware. Secrets, user passwords, customer/project content, and private tenant data outside an explicitly selected tenant scope never appear.

## Legacy Migration

Existing `materials` and `colors` rows migrate idempotently into tenant-private Library records:

- Preserve the legacy row UUID as the Library record UUID wherever no collision exists.
- Store the original ID in typed detail and provenance metadata in every case.
- Map material name, kind, price, profiles, and folder/category links.
- Map color name, code, hex, series, thumbnail, and folder/category links.
- Convert material-color associations into `compatible_with` relationships.
- Record migration version, timestamp, status, and error without deleting or rewriting legacy rows.

Current APIs and configurator selectors continue using legacy tables during this sprint. A later compatibility adapter will switch reads to Library data after migration and contractor deactivation behavior are verified. Saved projects continue resolving frozen selections even when a Library record is archived.

## Authorization and Audit

Reuse existing capabilities:

- `catalog.read`
- `catalog.write`
- `catalog.import`
- `catalog.export`
- `catalog.review`
- `catalog.publish`

Every server mutation checks the exact capability. Future roles can receive selected catalog capabilities without becoming SuperAdmin. Global publication requires `catalog.publish`; draft/review transitions use `catalog.review`. No actor can publish through client-side state alone.

Create, update, archive, restore, relationship changes, review transitions, migration runs, and committed imports append privacy-safe audit events. Events contain actor, action, target IDs/types, reason, result, batch/support reference, and non-sensitive counts.

## Error Handling and Transactions

- Mutations return stable error codes and human-readable messages.
- Import commit and migration batches are transactional.
- Dry runs never mutate database state.
- Version checks prevent silent lost updates.
- Archive/restore operations are reversible.
- External links are syntactically validated but network availability does not block record creation; link health checking is a later background service.
- Concurrent migration reruns are protected by migration keys and unique constraints.
- A failed import or migration does not partially update Library state.

## Capture/Scanner Handoff

The Capture/Scanner prototype will submit tenant-private records with:

- `source_type = capture`
- `review_status = pending_review`
- quality level and capture confidence
- contributor attribution
- source device/session reference
- raw measurement/profile/color metadata inside a versioned scanner namespace
- external asset URLs

Submitting tenants may later use pending records privately. An authorized reviewer may approve, reject, request revision, merge into an existing global record, and separately publish. The Library preserves lineage and contributor attribution through every transition. Incentive mechanics remain configurable and inactive.

## Product Knowledge and Trade Community Handoff

Part 2 attaches one Product Knowledge space to a Library record and may attach individual official documents to multiple related records. It provides structured “everything about this record” information, source citations, version tracking, and AI-assisted moderation.

Part 3 attaches topic spaces to Library records and trade concepts. It supports short posts, links, discussions, field tricks, ideas, and how-to content. It prohibits paid promotion, self-advertising, solicitation, lead harvesting, repetitive links, disguised advertising, and contractor “call me for best rates” posts. Enforcement will support rejection, warning, posting restriction, suspension, ban, human appeal, and SuperAdmin override.

Neither Part 2 nor Part 3 is implemented by this sprint.

## Verification

Automated coverage includes:

- Runtime and reference schema equivalence.
- Record policy validation and versioning.
- Scope and capability enforcement.
- Allowed and rejected relationship combinations.
- Category cycle prevention.
- Archive/restore behavior.
- Privacy-safe DTO projection.
- JSON round-trip fidelity.
- CSV round-trip for supported fields.
- Dry-run classifications and explicit conflict decisions.
- Transactional import contracts.
- Migration idempotency and compatibility mapping.
- Existing Materials, Colors, project, XML, 3D, report, sharing, and export regression tests.
- Platform Console capability gating and absence of tenant-content access.
- Production build and Vercel smoke checks.

## Success Criteria

- SuperAdmin can manage every included Library record type and relationship from the Platform Console.
- JSON/CSV imports cannot mutate data before an approved dry run.
- JSON/CSV exports preserve stable IDs and relationships.
- Existing tenant Materials and Colors migrate without deletion or project breakage.
- The current configurator behaves unchanged throughout this sprint.
- Core records are ready for Capture/Scanner, Product Knowledge, and Trade Community integration without schema replacement.
- Communication providers remain intentionally deferred; pending notification rows are expected until email/SMS delivery is implemented.
