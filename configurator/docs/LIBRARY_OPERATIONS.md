# Library Core Operations

## Purpose and Safety Boundary

Library Core is the SuperAdmin catalog foundation for products, profiles, colors, categories, manufacturers, suppliers, collections, catalogs, relationships, and external technical-document links. Existing `materials` and `colors` remain the live configurator source in this release. Library migration copies them; it never edits or deletes legacy rows or saved-project selections.

Library records are archived and restored, never permanently deleted. Global records have no tenant ID. Tenant records require exactly one tenant ID. Stable UUIDs, not names or codes, identify records.

## Access

| Capability | Operations |
| --- | --- |
| `catalog.read` | View records and migration status |
| `catalog.write` | Create/edit/archive/restore records, relationships, and documents |
| `catalog.import` | Dry-run/commit imports and run legacy migration |
| `catalog.export` | Export selected global or tenant scope |
| `catalog.review` | Reserved for review transitions |
| `catalog.publish` | Required for future global publication workflow |

The server checks these capabilities on every request. Hiding a UI control is not authorization.

## Platform Console Workflow

1. Open **Platform → Library Core**.
2. Choose Records, Organizations, Taxonomy, Relationships, Import / Export, or Migration.
3. For tenant-private data, select the tenant before searching, creating, importing, exporting, or migrating.
4. Supply a reason for every mutation. The audit trail records actor, action, target, reason, versions/counts, and support reference without customer/project content.
5. Archive records that should not be offered for new selections. Restore reverses that action.

Search filters include record type, global/tenant scope, lifecycle, review status, quality level, name, and code. External HTTP(S) links are syntax-validated; the system does not download or guarantee availability of external files.

## Relationships and Documents

Supported relationships are `categorized_as`, `manufactured_by`, `supplied_by`, `included_in_collection`, `included_in_catalog`, `compatible_with`, `replaces`, and `related_to`. Compatibility is restricted to product/profile/color pairs. Category parent relationships cannot create cycles.

Technical links may describe specifications, code compliance, certifications, installation, health and safety, warranties, or engineering resources. Mark a source official only when it is controlled by the manufacturer, regulator, standards body, or named publisher. Library Core stores the URL and metadata, not the document bytes.

## Exchange Format

The canonical JSON package uses `schemaVersion: 1` and contains `records`, `details`, `documents`, `documentRecords`, and `relationships`. Stable IDs and many-to-many relationships are preserved.

CSV export produces five RFC-4180-compatible files:

- `records.csv`
- `details.csv`
- `documents.csv`
- `document-records.csv`
- `relationships.csv`

Nested metadata is encoded as JSON inside its CSV cell. Importing CSV requires all five files, including header-only files for empty sections.

## Import Procedure

1. Select a tenant when importing tenant-private records.
2. Paste/upload the schema-version-1 package and choose **Run dry run**.
3. The dry run performs zero database mutations. It classifies every record as `new`, `matching`, `conflicting`, or `invalid`.
4. Correct invalid rows in the source package and run a new dry run.
5. Choose `skip`, `update`, or `create_separate` for every conflict.
6. Commit becomes available only when all conflicts have decisions and no invalid rows remain.
7. Commit revalidates current data and applies the batch transactionally. Stale batches are rejected and must be dry-run again.

No destructive conflict choice is automatic. Import audits retain decisions and counts, not uploaded source bytes or project/customer content.

## Legacy Migration

Migration key: `library-core-v1:<tenantId>`.

The migration copies tenant Materials, Colors, folders, material-color associations, and profile labels. A collision-free legacy UUID is retained; otherwise a new UUID is assigned and the old ID remains in typed detail and provenance. A completed migration key makes reruns a safe no-op. A failed transaction does not partially migrate a tenant.

Recovery procedure:

1. Record the support reference and stable error code.
2. Verify the tenant and source legacy rows without editing them.
3. Correct the rejected Library constraint or relationship in source/administration data.
4. Rerun only if the migration status is not `completed`.
5. Do not manually delete migration rows or legacy catalog rows.

## Deferred Services

Email and SMS delivery providers are intentionally not connected. Account notification rows remaining `pending` is expected; do not treat the queue as a Library failure. Managed file uploads, external-link health checks, Product Knowledge, Trade Community, contractor inheritance/deactivation controls, and the Capture/Scanner application are separate milestones.

## Privacy

Library DTOs and exports never contain credentials, password hashes, projects, customers, addresses, designs, measurements, pricing history, reports, or attachments. Tenant-private export requires an explicitly selected tenant.
