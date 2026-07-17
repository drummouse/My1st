import { useEffect, useState } from 'react';
import { saveOrUpdateProject } from '../lib/projects.js';

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// A small downloadable "pointer" file, not a copy of the design itself — it
// just redirects to the project's ?p= link, so opening it later always
// loads whatever is currently saved in the database under that id.
function buildProjectFileHtml(id, design) {
  const url = `${window.location.origin}${window.location.pathname}?p=${id}`;
  const job = escapeHtml(design.house.jobNumber);
  const customer = escapeHtml(design.house.customerName);
  const address = escapeHtml(design.house.address);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>IronWrap Project${job ? ` — ${job}` : ''}</title>
<meta http-equiv="refresh" content="0; url=${url}" />
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 2rem; color: #1c1f24;">
  <h1>IronWrap Project${job ? `: ${job}` : ''}</h1>
  <p>${customer}${customer && address ? ' — ' : ''}${address}</p>
  <p>This file is a link to a project saved in the IronWrap Configurator database — it always
  opens whatever is currently saved, not a frozen copy.</p>
  <p>If you are not redirected automatically, <a href="${url}">open the project</a>.</p>
</body>
</html>`;
}

function downloadProjectFile(id, design, projectName) {
  const html = buildProjectFileHtml(id, design);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(projectName || design.house.jobNumber || id).replace(/[\\/:*?"<>|]/g, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// "JOB_NUMBER - CUSTOMER - DATE" — a simple, predictable default. Not yet
// user-editable (that's future Settings work); for now it's always derived
// from the current job #/customer, so there's nothing to reset by hand when
// starting a new project.
function defaultProjectName(house) {
  const date = new Date().toISOString().slice(0, 10);
  return [house.jobNumber, house.customerName, date].filter(Boolean).join(' - ');
}

export default function ProjectsPanel({
  house,
  getCurrentDesign,
  onOpenProject,
  currentProjectId,
  onProjectIdChange,
  onDesignPersisted,
  persistenceReady = false,
  persistenceMessage = '',
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

  // A single save action: updates the already-saved record (if this design
  // has one) instead of always creating a new one — only a genuinely new
  // project (no currentProjectId, e.g. right after "New Project") creates a
  // new database row. Always downloads the pointer file too.
  const handleDownload = () => {
    if (!persistenceReady) return;
    return withStatus('Saving...', 'Project saved — file downloaded.', async () => {
      const design = getCurrentDesign();
      const saved = await saveOrUpdateProject(design, currentProjectId);
      onProjectIdChange(saved.id);
      onDesignPersisted?.(design);
      downloadProjectFile(saved.id, design, defaultProjectName(house));
      await refresh();
    });
  };

  const handleOpen = (id) => {
    if (!persistenceReady) return;
    return withStatus('Opening...', 'Project loaded.', async () => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      const restoredDesign = onOpenProject(row.design);
      onProjectIdChange(id);
      onDesignPersisted?.(restoredDesign);
    });
  };

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
        short project link — an anchor for a future rotatable 3D view in exported PDFs.
        "Download" saves the design (updating this same project once it's been saved once — it
        won't create a duplicate) and downloads a small file to your device — it's just a link back
        to the database entry, not a frozen copy, so it always opens the latest saved version.
        Use "+ New Project" above to start a separate, unrelated project.
      </div>

      <div className="export-buttons" style={{ marginTop: '0.6rem' }}>
        <button type="button" className="btn-primary" onClick={handleDownload} disabled={busy || !persistenceReady} style={{ width: '100%' }}>
          Download
        </button>
      </div>
      {!persistenceReady && <div className="control-sublabel" role="status">{persistenceMessage}</div>}

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
                disabled={busy || !persistenceReady}
              >
                {p.job_number || '(no job #)'} — {p.customer_name || 'Unnamed'}
              </button>
              <button type="button" className="layer-remove-btn" onClick={() => handleDelete(p.id)} disabled={busy} aria-label={`Delete ${p.job_number || p.id}`}>
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
