import { createDesignRuntime } from './designRuntime.js';
import { toPublicDesign } from './publicDesign.js';

const asArray = (value) => (Array.isArray(value) ? value : []);
const publicTextList = (value) => asArray(value).filter((item) => typeof item === 'string');

export function toSafePublicCatalog({ colors = [], materials = [] } = {}) {
  return {
    colors: asArray(colors).map((color) => ({
      id: color.id,
      name: color.name,
      code: color.code || '',
      hex: color.hex || '#888888',
      series: color.series || 'Custom',
      thumbnail: color.thumbnail ?? color.thumbnail_url,
    })),
    materials: asArray(materials).map((material) => ({
      id: material.id,
      name: material.name ?? material.label,
      kind: material.kind === 'wall' ? 'wall' : 'roof',
      profiles: publicTextList(material.profiles),
      colorIds: publicTextList(material.colorIds ?? material.color_ids),
    })),
  };
}

export function buildStandaloneSharePayload({
  applicationUrl,
  projectId,
  design,
  colors,
  materials,
  total,
  runtime,
} = {}) {
  const publicDesign = toPublicDesign(design);
  if (projectId && publicDesign) publicDesign.projectId = projectId;
  return {
    applicationUrl: new URL(applicationUrl).toString(),
    design: publicDesign,
    catalog: toSafePublicCatalog({ colors, materials }),
    quote: Number.isFinite(Number(total)) ? { total: Number(total), currency: 'CAD' } : null,
    runtime: createDesignRuntime(runtime?.unitSystem),
  };
}

export function buildPublicProjectUrl(applicationUrl, projectId) {
  const url = new URL(applicationUrl);
  url.search = '';
  url.hash = '';
  url.searchParams.set('p', projectId);
  return url.toString();
}

function serverUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

const STANDALONE_SHARE_UNAVAILABLE =
  'This standalone design was not saved to Projects and cannot be shared from this file.';

// A downloaded file is not itself a shareable design URL. Saved exports point
// back to the server project capability; unsaved exports explain why Share is
// unavailable instead of copying or invoking navigator.share with file://.
export function resolveShowroomShareTarget({
  applicationUrl,
  projectId,
  currentUrl,
  standalone = false,
} = {}) {
  const application = serverUrl(applicationUrl);
  if (projectId && application) {
    return {
      url: buildPublicProjectUrl(application.toString(), projectId),
      unavailableReason: null,
    };
  }

  if (standalone) {
    return { url: null, unavailableReason: STANDALONE_SHARE_UNAVAILABLE };
  }

  const current = serverUrl(currentUrl);
  if (current?.searchParams.has('d')) {
    return { url: current.toString(), unavailableReason: null };
  }

  return {
    url: null,
    unavailableReason: 'This design does not have a server-capable share link.',
  };
}
