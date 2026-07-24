import { CaptureValidationError } from './capturePolicy.js';

// Publication mapping: an approved capture session becomes a tenant-private
// Library Core product record, following docs/CAPTURE_LIBRARY_HANDOFF.md —
// scope 'tenant', sourceType 'capture', a versioned metadata.scanner
// namespace, and stable source lineage via external_reference. Pure module:
// the service supplies rows, this builds the record; tests exercise it
// without a database.

export const SCANNER_SCHEMA_VERSION = 1;

export function captureExternalReference(sessionId) {
  return `capture:${sessionId}`;
}

const fieldValue = (fields, key) => fields.find((f) => (f.fieldKey ?? f.field_key) === key)?.value ?? null;

// Scan types whose flexible classification (§10) means they never carry a
// category — evidence (calibration/coverage/a sampled value), not a
// category, proves them complete. Publication must not demand a field
// their own completeness gate never required.
const EVIDENCE_DRIVEN_TYPES = ['profile_geometry', 'color_finish', 'texture'];

const assetLineage = (assets) => assets.map((a) => ({
  purpose: a.purpose,
  classification: a.classification || 'source',
  url: a.url,
  checksum: a.checksum ?? null,
  mimeType: a.mimeType ?? null,
}));

// Asset-graph mapping (D-076): a session's capture type decides which
// reusable Library record type it becomes. `color_finish` -> 'color'
// (library_color_details) and `texture` -> 'texture' (metadata only, no
// dedicated details table yet — mirrors how category/manufacturer/supplier/
// collection/catalog record types already have none). Every other capture
// type keeps the original 'product' mapping, byte-for-byte unchanged.
export function buildLibraryPublication({ session, fields, assets }) {
  const evidenceDriven = EVIDENCE_DRIVEN_TYPES.includes(session.captureType);
  if (!session.title || (!evidenceDriven && !session.category)) {
    throw new CaptureValidationError('CAPTURE_PUBLISH_INVALID', 'A publishable capture needs a title and category');
  }
  const mainSource = assets.find((a) => a.purpose === 'main' && (a.classification || 'source') === 'source');
  const mainThumb = mainSource
    && assets.find((a) => a.classification === 'derived' && a.sourceAssetId === mainSource.id);

  const base = {
    scope: 'tenant',
    tenantId: session.ownerId,
    name: session.title,
    description: fieldValue(fields, 'description') || null,
    lifecycleStatus: 'active',
    reviewStatus: 'approved',
    qualityLevel: 'standard',
    sourceType: 'capture',
    externalReference: captureExternalReference(session.id),
    attribution: null,
    thumbnailUrl: (mainThumb || mainSource)?.url || null,
    textureUrl: null,
    geometryUrl: null,
  };
  const scanner = {
    schemaVersion: SCANNER_SCHEMA_VERSION,
    captureSessionId: session.id,
    captureType: session.captureType,
    completenessScore: session.completeness ?? null,
    submittedAt: session.submittedAt ?? null,
  };

  if (session.captureType === 'color_finish') {
    const color = fieldValue(fields, 'color');
    return {
      record: {
        ...base,
        recordType: 'color',
        code: color?.manufacturerCode || null,
        metadata: { scanner, captureColor: color, captureAssets: assetLineage(assets) },
      },
      details: {
        colorCode: color?.manufacturerCode || null,
        hex: color?.hex || null,
        series: null,
        legacyColorId: null,
      },
    };
  }

  if (session.captureType === 'texture') {
    return {
      record: {
        ...base,
        recordType: 'texture',
        code: null,
        metadata: {
          scanner,
          captureTexture: {
            textureDirection: session.textureDirection ?? null,
            materialZoneState: session.materialZoneState ?? null,
            studioValidation: session.studioValidation ?? null,
          },
          captureAssets: assetLineage(assets),
        },
      },
      // No dedicated details table for 'texture' yet (matches category/
      // manufacturer/supplier/collection/catalog) — every field lives in
      // metadata.captureTexture above.
      details: {},
    };
  }

  const dimensions = fieldValue(fields, 'dimensions') || {};
  const coverage = fieldValue(fields, 'coverage') || {};
  const color = fieldValue(fields, 'color');
  return {
    record: {
      ...base,
      recordType: 'product',
      code: fieldValue(fields, 'sku') || null,
      metadata: {
        scanner,
        capture: {
          category: session.category,
          manufacturer: fieldValue(fields, 'manufacturer'),
          supplier: fieldValue(fields, 'supplier'),
          barcode: fieldValue(fields, 'barcode'),
          notes: fieldValue(fields, 'notes'),
          color,
          assets: assetLineage(assets),
        },
      },
    },
    details: {
      unit: dimensions.unit || null,
      price: null,
      applicationMetadata: {
        category: session.category,
        dimensions,
        coverage,
        color,
      },
    },
  };
}

// Studio-facing DTO: the contract a Studio selector consumes. A pin is
// {productId, version} PLUS the DTO snapshot taken at selection time —
// same "frozen at save time" pattern as pricingSettings and
// customServiceLines. A newer Library version is offered as an explicit
// upgrade, never applied silently.
export function toStudioProduct(row, details = {}) {
  const metadata = row.metadata || {};
  const application = details.application_metadata ?? details.applicationMetadata ?? {};
  return {
    productId: row.id,
    version: Number(row.version),
    name: row.name,
    category: application.category ?? metadata.capture?.category ?? null,
    manufacturer: metadata.capture?.manufacturer ?? null,
    supplier: metadata.capture?.supplier ?? null,
    sku: row.code ?? null,
    description: row.description ?? null,
    unit: details.unit ?? null,
    dimensions: application.dimensions ?? null,
    coverage: application.coverage ?? null,
    color: application.color ?? null,
    thumbnailUrl: row.thumbnail_url ?? row.thumbnailUrl ?? null,
    textureUrl: row.texture_url ?? row.textureUrl ?? null,
    geometryUrl: row.geometry_url ?? row.geometryUrl ?? null,
    lifecycleStatus: row.lifecycle_status ?? row.lifecycleStatus ?? 'active',
    scope: row.scope,
    tenantId: row.tenant_id ?? row.tenantId ?? null,
    sourceType: row.source_type ?? row.sourceType ?? null,
  };
}

export function buildPinReference(product) {
  return { productId: product.productId, version: product.version, pinnedAt: new Date().toISOString() };
}

// Resolves a stored pin against the current Library record. The pinned
// snapshot the project saved stays authoritative; this only reports whether
// the pin still matches and whether an explicit upgrade is available.
export function resolvePinnedReference(pin, currentProduct) {
  if (!currentProduct || currentProduct.productId !== pin.productId) {
    return { found: false, pinnedMatches: false, upgradeAvailable: false };
  }
  return {
    found: true,
    pinnedMatches: currentProduct.version === pin.version,
    upgradeAvailable: currentProduct.version > pin.version,
    currentVersion: currentProduct.version,
  };
}
