import { useEffect, useState } from 'react';

export default function ProjectsPanel({ getCurrentDesign, onOpenProject, currentProjectId, onProjectIdChange }) {
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
  }, []);

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

  const handleSaveNew = () =>
    withStatus('Saving...', 'Project saved.', async () => {
      const design = getCurrentDesign();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobNumber: design.house.jobNumber,
          customerName: design.house.customerName,
          address: design.house.address,
          design,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json();
      onProjectIdChange(saved.id);
      await refresh();
    });

  const handleUpdate = () =>
    withStatus('Updating...', 'Project updated.', async () => {
      const design = getCurrentDesign();
      const res = await fetch(`/api/projects/${currentProjectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobNumber: design.house.jobNumber,
          customerName: design.house.customerName,
          address: design.house.address,
          design,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    });

  const handleOpen = (id) =>
    withStatus('Opening...', 'Project loaded.', async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      onOpenProject(row.design);
      onProjectIdChange(id);
    });

  const handleDelete = (id) => {
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
        short project link — an anchor for a future rotatable 3D view in exported PDFs, unlike the
        self-contained Shareable Link above which embeds the whole design in the URL itself.
      </div>

      <div className="export-buttons" style={{ marginTop: '0.6rem' }}>
        <button type="button" className="btn-secondary" onClick={handleSaveNew} disabled={busy}>Save as New</button>
        <button type="button" className="btn-primary" onClick={handleUpdate} disabled={busy || !currentProjectId}>
          Update Saved
        </button>
      </div>
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
        <ul className="layer-list" style={{ marginTop: '0.6rem' }}>
          {projects.map((p) => (
            <li key={p.id} className="layer-row">
              <button
                type="button"
                className={`project-open-btn${p.id === currentProjectId ? ' project-open-btn-active' : ''}`}
                onClick={() => handleOpen(p.id)}
                disabled={busy}
              >
                {p.job_number || '(no job #)'} — {p.customer_name || 'Unnamed'}
              </button>
              <button type="button" className="layer-remove-btn" onClick={() => handleDelete(p.id)} disabled={busy} aria-label={`Delete ${p.job_number || p.id}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
