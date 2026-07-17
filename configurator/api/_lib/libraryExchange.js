import { LibraryValidationError } from './libraryPolicy.js';

export const LIBRARY_SCHEMA_VERSION = 1;
const sections = {
  'records.csv': 'records',
  'details.csv': 'details',
  'documents.csv': 'documents',
  'document-records.csv': 'documentRecords',
  'relationships.csv': 'relationships',
};
const columns = {
  records: ['id', 'recordType', 'scope', 'tenantId', 'name', 'code', 'description', 'lifecycleStatus', 'reviewStatus', 'qualityLevel', 'version', 'sourceType', 'externalReference', 'sourceUrl', 'attribution', 'thumbnailUrl', 'textureUrl', 'geometryUrl', 'knowledgeSpaceId', 'metadata'],
  details: ['recordId', 'recordType', 'unit', 'price', 'applicationMetadata', 'profileFamily', 'geometryMetadata', 'legacyProfileLabel', 'colorCode', 'hex', 'series'],
  documents: ['id', 'title', 'documentType', 'url', 'publisher', 'jurisdiction', 'effectiveDate', 'expiryDate', 'language', 'checksum', 'reviewStatus', 'isOfficial', 'metadata'],
  documentRecords: ['documentId', 'recordId'],
  relationships: ['id', 'sourceRecordId', 'targetRecordId', 'relationshipType', 'lifecycleStatus', 'version', 'attribution', 'metadata'],
};
const jsonColumns = new Set(['metadata', 'applicationMetadata', 'geometryMetadata']);
const numberColumns = new Set(['version', 'price']);
const booleanColumns = new Set(['isOfficial']);

export function buildJsonPackage(data, context = {}) {
  return {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    package: {
      exportedAt: context.exportedAt || new Date().toISOString(),
      exportedBy: context.exportedBy || null,
    },
    records: data.records || [], details: data.details || [], documents: data.documents || [],
    documentRecords: data.documentRecords || [], relationships: data.relationships || [],
  };
}

export function parseJsonPackage(text) {
  let data;
  try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch {
    throw new LibraryValidationError('LIBRARY_JSON_INVALID', 'Library package is not valid JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new LibraryValidationError('LIBRARY_JSON_INVALID', 'Library package must be an object');
  }
  if (data.schemaVersion !== LIBRARY_SCHEMA_VERSION) {
    throw new LibraryValidationError('LIBRARY_SCHEMA_UNSUPPORTED', `Only schema version ${LIBRARY_SCHEMA_VERSION} is supported`);
  }
  return {
    ...data,
    records: Array.isArray(data.records) ? data.records : [],
    details: Array.isArray(data.details) ? data.details : [],
    documents: Array.isArray(data.documents) ? data.documents : [],
    documentRecords: Array.isArray(data.documentRecords) ? data.documentRecords : [],
    relationships: Array.isArray(data.relationships) ? data.relationships : [],
  };
}

function csvCell(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serializeRows(rows, names) {
  return [names.join(','), ...rows.map((row) => names.map((name) => csvCell(row[name])).join(','))].join('\r\n');
}

export function serializeCsvBundle(data) {
  return Object.fromEntries(Object.entries(sections).map(([filename, key]) => [
    filename, serializeRows(data[key] || [], columns[key]),
  ]));
}

function parseRows(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  for (let index = 0; index < String(text).length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new LibraryValidationError('LIBRARY_CSV_INVALID', 'CSV contains an unterminated quoted value');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function parseTable(text, expected) {
  const [header = [], ...rows] = parseRows(text);
  if (header.join('|') !== expected.join('|')) {
    throw new LibraryValidationError('LIBRARY_CSV_COLUMNS_INVALID', 'CSV columns do not match the Library schema');
  }
  return rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(header.map((name, index) => {
    const raw = row[index] ?? '';
    if (!raw) return [name, null];
    if (jsonColumns.has(name)) {
      try { return [name, JSON.parse(raw)]; } catch { throw new LibraryValidationError('LIBRARY_CSV_INVALID', `${name} must contain valid JSON`); }
    }
    if (numberColumns.has(name)) return [name, Number(raw)];
    if (booleanColumns.has(name)) return [name, raw.toLowerCase() === 'true'];
    return [name, raw];
  })));
}

export function parseCsvBundle(files) {
  const result = {};
  for (const [filename, key] of Object.entries(sections)) {
    if (typeof files?.[filename] !== 'string') {
      throw new LibraryValidationError('LIBRARY_CSV_FILE_MISSING', `${filename} is required`);
    }
    result[key] = parseTable(files[filename], columns[key]);
  }
  return result;
}
