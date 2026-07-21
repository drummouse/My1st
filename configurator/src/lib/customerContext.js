export function deriveCustomerContext({ search = '', embeddedDesign = null } = {}) {
  if (embeddedDesign) return true;

  const params = new URLSearchParams(search);
  return params.has('p') || params.has('d');
}

export function parsePublicDesignEntry({ search = '', embeddedDesign = null } = {}) {
  if (embeddedDesign) return { kind: 'embedded', identifier: null, status: 'loading' };
  const params = new URLSearchParams(search);
  for (const [key, kind] of [['p', 'project'], ['d', 'design']]) {
    if (!params.has(key)) continue;
    const identifier = (params.get(key) || '').trim();
    return { kind, identifier, status: identifier ? 'loading' : 'invalid' };
  }
  return { kind: null, identifier: null, status: 'ready' };
}

export function getInitialCustomerContext(browserWindow = typeof window === 'undefined' ? undefined : window) {
  if (!browserWindow) return false;

  return deriveCustomerContext({
    search: browserWindow.location?.search || '',
    embeddedDesign: browserWindow.__IRONWRAP_DESIGN__ || null,
  });
}
