import { resolveSharedDesignPayload } from './designRuntime.js';

export async function loadPublicProject(projectId, {
  fetchJson,
  applyCatalogs = () => {},
  applyProject = () => {},
} = {}) {
  if (!projectId || typeof fetchJson !== 'function') {
    throw new TypeError('A public project id and fetchJson callback are required');
  }

  const [project, catalog] = await Promise.all([
    fetchJson(`/api/projects/${projectId}`),
    fetchJson(`/api/projects/${projectId}/catalog`),
  ]);

  // Module-backed legacy catalog consumers must be hydrated before the saved
  // design selects ids from those catalogs. React-owned catalog state then
  // versions all memoized presentation models on the same boundary.
  applyCatalogs(catalog);
  applyProject(project);
  return { project, catalog };
}

export async function loadPublicDesignEntry(entry, {
  embeddedDesign,
  embeddedCatalog = { colors: [], materials: [] },
  embeddedQuote = null,
  embeddedRuntime = null,
  fetchJson,
  decodeDesign,
} = {}) {
  if (!entry || entry.status === 'invalid') throw new Error('Invalid public design entry');

  if (entry.kind === 'embedded') {
    if (!embeddedDesign) throw new Error('Embedded design is unavailable');
    return {
      design: embeddedDesign,
      catalog: embeddedCatalog,
      quote: embeddedQuote,
      runtime: embeddedRuntime,
      projectId: embeddedDesign.projectId || null,
    };
  }

  if (entry.kind === 'design') {
    if (typeof decodeDesign !== 'function') throw new TypeError('decodeDesign callback is required');
    const payload = resolveSharedDesignPayload(await decodeDesign(entry.identifier));
    return {
      design: payload.design,
      catalog: { colors: [], materials: [] },
      quote: null,
      runtime: payload.runtime,
      projectId: null,
    };
  }

  if (entry.kind === 'project') {
    const { project, catalog } = await loadPublicProject(entry.identifier, { fetchJson });
    return {
      design: project.design,
      catalog,
      quote: project.quote || null,
      runtime: project.runtime || null,
      projectId: project.id || entry.identifier,
      approvedAt: project.approved_at || null,
    };
  }

  return null;
}
