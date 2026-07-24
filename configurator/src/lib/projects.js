// Saves a new project or updates the existing one — POST if there's no id
// yet, PUT if there is, so repeat saves update the same row instead of
// creating duplicates. Shared by ProjectsPanel's Download button and
// App.jsx's HTML export (which needs a project id to embed so the exported
// file's "Approve This Design" button has something to POST to).
export async function saveOrUpdateProject(design, currentProjectId) {
  if (!design?.pricingSettings) {
    throw new Error('Pricing settings must finish loading before a design can be saved.');
  }
  const res = await fetch(currentProjectId ? `/api/projects/${currentProjectId}` : '/api/projects', {
    method: currentProjectId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobNumber: design.house.jobNumber,
      customerName: design.house.customerName,
      address: design.house.address,
      design,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return currentProjectId ? { id: currentProjectId } : res.json();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

// "JOB_NUMBER - CUSTOMER - DATE" is the stable display and download name
// used by both the Projects panel and the Studio project menu.
export function defaultProjectName(house) {
  const date = new Date().toISOString().slice(0, 10);
  return [house.jobNumber, house.customerName, date].filter(Boolean).join(' - ');
}

// Downloads a small pointer to the saved database record rather than a
// frozen copy. Opening the file therefore always restores the latest save.
export function downloadProjectFile(id, design, projectName) {
  const url = `${window.location.origin}${window.location.pathname}?p=${id}`;
  const job = escapeHtml(design.house.jobNumber);
  const customer = escapeHtml(design.house.customerName);
  const address = escapeHtml(design.house.address);
  const html = `<!DOCTYPE html>
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
  const blob = new Blob([html], { type: 'text/html' });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${(projectName || design.house.jobNumber || id).replace(/[\\/:*?"<>|]/g, '_')}.html`;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}
