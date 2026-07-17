import { useCallback, useEffect, useState } from 'react';
import { libraryApi, downloadLibraryFile } from '../lib/libraryClient.js';

const TABS = ['Records', 'Organizations', 'Taxonomy', 'Relationships', 'Import / Export', 'Migration'];
const recordTypes = ['product', 'profile', 'color', 'category', 'manufacturer', 'supplier', 'collection', 'catalog'];
const emptyRecord = { recordType: 'product', scope: 'global', tenantId: '', name: '', code: '', description: '', reviewStatus: 'draft', qualityLevel: 'test', sourceType: 'manual', metadata: {} };

export default function LibraryConsole({ capabilities = [], tenants = [] }) {
  const [tab, setTab] = useState('Records');
  const [records, setRecords] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [relationshipForm, setRelationshipForm] = useState({ sourceRecordId: '', targetRecordId: '', relationshipType: 'related_to' });
  const emptyDocument = { title: '', documentType: 'technical_specification', url: '', publisher: '', isOfficial: false, recordIds: [] };
  const [documentForm, setDocumentForm] = useState(emptyDocument);
  const [filters, setFilters] = useState({ recordType: '', scope: '', tenantId: '', lifecycleStatus: 'active', reviewStatus: '', qualityLevel: '', search: '' });
  const [form, setForm] = useState(emptyRecord);
  const [importText, setImportText] = useState('');
  const [dryRun, setDryRun] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [migration, setMigration] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const can = (capability) => capabilities.includes(capability);
  const visibleTypes = tab === 'Organizations' ? ['manufacturer', 'supplier'] : tab === 'Taxonomy' ? ['category', 'collection', 'catalog'] : ['product', 'profile', 'color'];

  const run = async (operation) => {
    setBusy(true); setError('');
    try { return await operation(); } catch (err) { setError(err.message); return null; } finally { setBusy(false); }
  };
  const refresh = useCallback(async () => {
    const result = await run(() => libraryApi.records(filters));
    if (result) setRecords(result.records || []);
  }, [filters]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (tab === 'Relationships') run(async () => {
      const [relationResult, documentResult] = await Promise.all([libraryApi.relationships(), libraryApi.documents()]);
      setRelationships(relationResult.relationships || []); setDocuments(documentResult.documents || []);
    });
  }, [tab]);

  const saveRecord = async (event) => {
    event.preventDefault();
    const reason = window.prompt('Reason for this Library change:'); if (!reason?.trim()) return;
    const payload = { ...form, tenantId: form.scope === 'tenant' ? form.tenantId : null };
    const result = await run(() => form.id ? libraryApi.updateRecord(payload, reason) : libraryApi.createRecord(payload, reason));
    if (result) { setForm(emptyRecord); await refresh(); }
  };
  const changeLifecycle = async (record) => {
    const next = record.lifecycleStatus === 'archived' ? 'active' : 'archived';
    const reason = window.prompt(`Reason to ${next === 'active' ? 'restore' : 'archive'} ${record.name}:`); if (!reason?.trim()) return;
    await run(() => libraryApi.lifecycle(record, next, reason)); await refresh();
  };
  const exportData = async (format) => {
    const data = await run(() => libraryApi.exportPackage(format, filters.tenantId)); if (!data) return;
    if (format === 'csv') Object.entries(data.files || {}).forEach(([name, content]) => downloadLibraryFile(name, content));
    else downloadLibraryFile('ironwrap-library-v1.json', data);
  };
  const runDryRun = async () => {
    let data; try { data = JSON.parse(importText); } catch { setError('Import file is not valid JSON'); return; }
    const result = await run(() => libraryApi.dryRunImport(data, filters.tenantId));
    if (result) { setDryRun(result); setDecisions({}); }
  };
  const conflicts = dryRun?.items?.filter((item) => item.classification === 'conflicting') || [];
  const allConflictsDecided = conflicts.every((item) => ['skip', 'update', 'create_separate'].includes(decisions[item.id]));
  const commitImport = async () => {
    const result = await run(() => libraryApi.commitImport(dryRun.batchId, decisions, filters.tenantId));
    if (result) { setDryRun(null); setImportText(''); await refresh(); }
  };
  const filteredRecords = records.filter((record) => visibleTypes.includes(record.recordType));
  const createRelationship = async (event) => {
    event.preventDefault(); const reason = window.prompt('Reason for this relationship:'); if (!reason?.trim()) return;
    const result = await run(() => libraryApi.createRelationship(relationshipForm, reason, filters.tenantId));
    if (result) { setRelationshipForm({ sourceRecordId: '', targetRecordId: '', relationshipType: 'related_to' }); setRelationships((await libraryApi.relationships()).relationships || []); }
  };
  const saveDocument = async (event) => {
    event.preventDefault(); const reason = window.prompt('Reason for this technical document link:'); if (!reason?.trim()) return;
    const result = await run(() => libraryApi.saveDocument(documentForm, reason));
    if (result) { setDocumentForm(emptyDocument); setDocuments((await libraryApi.documents()).documents || []); }
  };

  return <section className="library-console platform-card">
    <div className="library-header"><div><h2>Library Core</h2><p>Structured products, profiles, colors, organizations, taxonomy, and provenance.</p></div><button onClick={refresh} disabled={busy}>Refresh Library</button></div>
    <nav className="library-tabs">{TABS.map((label) => <button key={label} className={tab === label ? 'active' : ''} onClick={() => setTab(label)}>{label}</button>)}</nav>
    {error && <div className="platform-error">{error}</div>}
    <div className="library-future"><button disabled>Product Knowledge · Coming next</button><button disabled>Trade Community · Coming next</button></div>

    {['Records', 'Organizations', 'Taxonomy'].includes(tab) && <>
      <div className="library-filters">
        <input aria-label="Search Library" placeholder="Search name or code" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <select value={filters.scope} onChange={(e) => setFilters({ ...filters, scope: e.target.value })}><option value="">All scopes</option><option value="global">Global</option><option value="tenant">Tenant</option></select>
        <select value={filters.tenantId} onChange={(e) => setFilters({ ...filters, tenantId: e.target.value })}><option value="">No tenant selected</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName || tenant.email}</option>)}</select>
        <select value={filters.reviewStatus} onChange={(e) => setFilters({ ...filters, reviewStatus: e.target.value })}><option value="">All review states</option>{['draft', 'pending_review', 'approved', 'rejected'].map((value) => <option key={value}>{value}</option>)}</select>
        <select value={filters.qualityLevel} onChange={(e) => setFilters({ ...filters, qualityLevel: e.target.value })}><option value="">All quality levels</option>{['test', 'low', 'standard', 'verified'].map((value) => <option key={value}>{value}</option>)}</select>
      </div>
      {can('catalog.write') && <form className="library-record-form" onSubmit={saveRecord}>
        <select value={form.recordType} onChange={(e) => setForm({ ...form, recordType: e.target.value })}>{visibleTypes.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="global">global</option><option value="tenant">tenant</option></select>
        {form.scope === 'tenant' && <select required value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName || tenant.email}</option>)}</select>}
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Code" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        <input placeholder="Description" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button disabled={busy}>{form.id ? 'Save record' : 'Create record'}</button>{form.id && <button type="button" onClick={() => setForm(emptyRecord)}>Cancel</button>}
      </form>}
      <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Name</th><th>Type</th><th>Scope</th><th>Review / quality</th><th>Version</th><th>Actions</th></tr></thead><tbody>{filteredRecords.map((record) => <tr key={record.id}><td><strong>{record.name}</strong><small>{record.code || 'No code'}</small></td><td>{record.recordType}</td><td>{record.scope}</td><td>{record.reviewStatus}<small>{record.qualityLevel}</small></td><td>{record.version}</td><td className="platform-actions">{can('catalog.write') && <><button onClick={() => setForm(record)}>Edit</button><button onClick={() => changeLifecycle(record)}>{record.lifecycleStatus === 'archived' ? 'Restore' : 'Archive'}</button></>}</td></tr>)}</tbody></table></div>
    </>}

    {tab === 'Relationships' && <div className="library-relationships">
      {can('catalog.write') && <form className="library-record-form" onSubmit={createRelationship}><select required value={relationshipForm.sourceRecordId} onChange={(e) => setRelationshipForm({ ...relationshipForm, sourceRecordId: e.target.value })}><option value="">Source record</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.recordType}</option>)}</select><select value={relationshipForm.relationshipType} onChange={(e) => setRelationshipForm({ ...relationshipForm, relationshipType: e.target.value })}>{['categorized_as', 'manufactured_by', 'supplied_by', 'included_in_collection', 'included_in_catalog', 'compatible_with', 'replaces', 'related_to'].map((value) => <option key={value}>{value}</option>)}</select><select required value={relationshipForm.targetRecordId} onChange={(e) => setRelationshipForm({ ...relationshipForm, targetRecordId: e.target.value })}><option value="">Target record</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.recordType}</option>)}</select><button disabled={busy}>Create relationship</button></form>}
      <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Type</th><th>Source</th><th>Target</th><th>Status</th></tr></thead><tbody>{relationships.map((relation) => <tr key={relation.id}><td>{relation.relationshipType}</td><td>{relation.sourceRecordId}</td><td>{relation.targetRecordId}</td><td>{relation.lifecycleStatus}</td></tr>)}</tbody></table></div>
      <h3>Technical document links</h3>
      {can('catalog.write') && <form className="library-record-form" onSubmit={saveDocument}><input required placeholder="Document title" value={documentForm.title} onChange={(e) => setDocumentForm({ ...documentForm, title: e.target.value })} /><select value={documentForm.documentType} onChange={(e) => setDocumentForm({ ...documentForm, documentType: e.target.value })}>{['technical_specification', 'code_compliance', 'certification', 'installation', 'health_and_safety', 'warranty', 'engineering'].map((value) => <option key={value}>{value}</option>)}</select><input required type="url" placeholder="https://…" value={documentForm.url} onChange={(e) => setDocumentForm({ ...documentForm, url: e.target.value })} /><input placeholder="Publisher" value={documentForm.publisher} onChange={(e) => setDocumentForm({ ...documentForm, publisher: e.target.value })} /><select required value={documentForm.recordIds[0] || ''} onChange={(e) => setDocumentForm({ ...documentForm, recordIds: e.target.value ? [e.target.value] : [] })}><option value="">Attach to record</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name} · {record.recordType}</option>)}</select><label><input type="checkbox" checked={documentForm.isOfficial} onChange={(e) => setDocumentForm({ ...documentForm, isOfficial: e.target.checked })} /> Official source</label><button disabled={busy}>Save document link</button></form>}
      <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Title</th><th>Type</th><th>Publisher</th><th>Source</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><a href={document.url} target="_blank" rel="noreferrer">{document.title}</a></td><td>{document.documentType}</td><td>{document.publisher || '—'}</td><td>{document.isOfficial ? 'Official' : 'Unverified'}</td></tr>)}</tbody></table></div>
    </div>}

    {tab === 'Import / Export' && <div className="library-exchange">
      {can('catalog.export') && <div><h3>Export</h3><button onClick={() => exportData('json')}>Download JSON</button><button onClick={() => exportData('csv')}>Download CSV files</button></div>}
      {can('catalog.import') && <div><h3>Import JSON</h3><textarea placeholder="Paste a schemaVersion 1 Library package" value={importText} onChange={(e) => setImportText(e.target.value)} /><button onClick={runDryRun} disabled={!importText || busy}>Run dry run</button>{dryRun && <div className="library-dry-run"><p>New {dryRun.summary.new} · Matching {dryRun.summary.matching} · Conflicting {dryRun.summary.conflicting} · Invalid {dryRun.summary.invalid}</p>{conflicts.map((item) => <label key={item.id}>{item.record?.name || item.id}<select value={decisions[item.id] || ''} onChange={(e) => setDecisions({ ...decisions, [item.id]: e.target.value })}><option value="">Choose action</option><option value="skip">skip</option><option value="update">update</option><option value="create_separate">create separate</option></select></label>)}<button onClick={commitImport} disabled={!allConflictsDecided || dryRun.summary.invalid > 0 || busy}>Commit approved import</button></div>}</div>}
    </div>}

    {tab === 'Migration' && <div className="library-migration"><h3>Legacy Materials and Colors</h3><select value={filters.tenantId} onChange={(e) => setFilters({ ...filters, tenantId: e.target.value })}><option value="">Select tenant</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.companyName || tenant.email}</option>)}</select><button disabled={!filters.tenantId || busy} onClick={async () => setMigration(await run(() => libraryApi.migrationStatus(filters.tenantId)))}>Check status</button>{can('catalog.import') && <button disabled={!filters.tenantId || busy} onClick={async () => { const reason = window.confirm('Copy legacy Materials and Colors into this tenant Library?'); if (reason) setMigration(await run(() => libraryApi.runMigration(filters.tenantId))); }}>Run migration</button>}<pre>{migration ? JSON.stringify(migration, null, 2) : 'No migration selected.'}</pre></div>}
  </section>;
}
