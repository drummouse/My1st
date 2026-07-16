export function getEditProjectId(search) {
  return new URLSearchParams(search).get('edit');
}

export function replaceEditProjectId(projectId, location = window.location, history = window.history) {
  const params = new URLSearchParams(location.search);
  params.delete('p');
  params.delete('d');
  if (projectId) params.set('edit', projectId);
  else params.delete('edit');

  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash || ''}`);
}
