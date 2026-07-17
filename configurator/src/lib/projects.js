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
