async function request(action, { method = 'GET', query = {}, body } = {}) {
  const params = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(query).filter(([, value]) => value != null && value !== '')) });
  const response = await fetch(`/api/superadmin?${params}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof result.error === 'object' ? result.error : { message: result.error };
    const error = new Error(detail?.message || `Library request failed (${response.status})`);
    error.code = detail?.code; error.details = detail?.details; throw error;
  }
  return result;
}

export const libraryApi = {
  records: (filters) => request('library.records', { query: filters }),
  getRecord: (id, tenantId) => request('library.record', { query: { id, tenantId } }),
  createRecord: (record, reason) => request('library.record', { method: 'POST', body: { record, reason, tenantId: record.tenantId } }),
  updateRecord: (record, reason) => request('library.record', { method: 'PATCH', query: { id: record.id }, body: { record, expectedVersion: record.version, reason, tenantId: record.tenantId } }),
  lifecycle: (record, lifecycleStatus, reason) => request('library.record', { method: 'PATCH', query: { id: record.id }, body: { lifecycleStatus, expectedVersion: record.version, reason, tenantId: record.tenantId } }),
  relationships: () => request('library.relationships'),
  createRelationship: (relationship, reason, tenantId) => request('library.relationships', { method: 'POST', body: { relationship, reason, tenantId } }),
  documents: () => request('library.documents'),
  saveDocument: (document, reason) => request('library.documents', { method: 'POST', body: { document, reason } }),
  exportPackage: (format, tenantId) => request('library.export', { query: { format, tenantId } }),
  dryRunImport: (packageData, tenantId) => request('library.import.dry-run', { method: 'POST', body: { format: 'json', package: packageData, tenantId } }),
  commitImport: (batchId, decisions, tenantId) => request('library.import.commit', { method: 'POST', body: { batchId, decisions, tenantId } }),
  migrationStatus: (tenantId) => request('library.migration.status', { query: { tenantId } }),
  runMigration: (tenantId) => request('library.migration.run', { method: 'POST', body: { tenantId } }),
};

export function downloadLibraryFile(filename, value) {
  const blob = new Blob([typeof value === 'string' ? value : JSON.stringify(value, null, 2)], { type: filename.endsWith('.json') ? 'application/json' : 'text/csv' });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}
