import { useEffect, useState } from 'react';
import { defaultProjectName } from '../lib/projects.js';

export default function ProjectsPanel({
  house,
  onSaveProject,
  onOpenProjectStart,
  onOpenProject,
  currentProjectId,
  onProjectIdChange,
  onDesignPersisted,
  canOpen = false,
  canSave = false,
  persistenceMessage = '',
  refreshKey = 0,
  operationBusy = false,
}) {
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setProjects(await res.json());
    } catch {
      // Silent on initial load — the "Save as New" button surfaces the
      // network problem once the user actually tries to use it.
    }
  };

  useEffect(() => {
    refresh();
  }, [refreshKey]);

  const withStatus = async (busyMsg, okMsg, fn) => {
    setBusy(true);
    setStatus(busyMsg);
    try {
      await fn();
      setStatus(okMsg);
    } catch (err) {
      console.error('Projects API error:', err);
      setStatus('Could not reach the Projects database — it may not be reachable from this environment yet.');
    }
    setBusy(false);
    setTimeout(() => setStatus(''), 5000);
  };

  // A single save action: updates the already-saved record (if this design
  // has one) instead of always creating a new one — only a genuinely new
  // project (no currentProjectId, e.g. right after "New Project") creates a
  // new database row. Always downloads the pointer file too.
  const handleDownload = () => {
    if (operationBusy || !canSave) return;
    return onSaveProject();
  };

  const handleOpen = (id) => {
    if (operationBusy || !canOpen) return;
    onOpenProjectStart?.();
    return withStatus('Opening...', 'Project loaded.', async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      const restoredDesign = await onOpenProject(row.design);
      if (!restoredDesign) throw new Error('Project design is not ready to open.');
      onProjectIdChange(id);
      onDesignPersisted?.(restoredDesign);
    });
  };

  const handleDelete = (id) => {
    if (operationBusy) return;
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    withStatus('Deleting...', 'Project deleted.', async () => {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (currentProjectId === id) onProjectIdChange(null);
      await refresh();
    });
  };

  const handleCopyProjectLink = async () => {
    if (!currentProjectId) {
      setStatus('Save this design as a project first.');
      setTimeout(() => setStatus(''), 4000);
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?p=${currentProjectId}`;
    await navigator.clipboard.writeText(url);
    setStatus('Project link copied to clipboard!');
    setTimeout(() => setStatus(''), 4000);
  };

  return (
    <div className="control-block">
      <div className="control-label">Projects</div>
      <div className="control-sublabel">
        Save this design to the database so it can be reopened and edited later, or shared as a
        short project link — an anchor for a future rotatable 3D view in exported PDFs.
        "Download" saves the design (updating this same project once it's been saved once — it
        won't create a duplicate) and downloads a small file to your device — it's just a link back
        to the database entry, not a frozen copy, so it always opens the latest saved version.
        Use "+ New Project" above to start a separate, unrelated project.
      </div>

      <div className="export-buttons" style={{ marginTop: '0.6rem' }}>
        <button type="button" className="btn-primary" onClick={handleDownload} disabled={busy || operationBusy || !canSave} style={{ width: '100%' }}>
          Download
        </button>
      </div>
      {!canSave && <div className="control-sublabel" role="status">{persistenceMessage}</div>}

      <label className="field-label" htmlFor="project-name" style={{ marginTop: '0.5rem' }}>Project Name</label>
      <input
        id="project-name"
        className="control-select"
        value={defaultProjectName(house)}
        readOnly
        title="Auto-generated from Job # / Customer / today's date — editable via Settings in a future update"
      />

      <button
        type="button"
        className="btn-secondary"
        onClick={handleCopyProjectLink}
        disabled={!currentProjectId}
        style={{ marginTop: '0.5rem', width: '100%' }}
      >
        Copy Project Link
      </button>

      {status && <div className="control-sublabel">{status}</div>}

      {projects.length > 0 && (
        <>
        <div className="field-label" style={{ marginTop: '0.6rem' }}>Saved Projects ({projects.length})</div>
        <ul className="layer-list projects-list">
          {projects.map((p) => (
            <li key={p.id} className="layer-row">
              <button
                type="button"
                className={`project-open-btn${p.id === currentProjectId ? ' project-open-btn-active' : ''}`}
                onClick={() => handleOpen(p.id)}
                disabled={busy || operationBusy || !canOpen}
              >
                {p.job_number || '(no job #)'} — {p.customer_name || 'Unnamed'}
              </button>
              <button type="button" className="layer-remove-btn" onClick={() => handleDelete(p.id)} disabled={busy || operationBusy} aria-label={`Delete ${p.job_number || p.id}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
    </div>
  );
}
