export function deriveCustomerContext({ search = '', embeddedDesign = null } = {}) {
  if (embeddedDesign) return true;

  const params = new URLSearchParams(search);
  return params.has('p') || params.has('d');
}

// Presentation is a visual mode shared by two fundamentally different
// sessions: an authenticated owner temporarily presenting a design, and an
// unauthenticated public link. Require every piece of authenticated
// provenance so a public Showroom can never gain edit controls by supplying
// the visual mode alone.
export function derivePresentationEditable({
  currentUser = null,
  isCustomerView = false,
  session = null,
} = {}) {
  return Boolean(currentUser)
    && isCustomerView !== true
    && session?.mode === 'showroom'
    && session?.authenticated === true
    && session?.publicShowroom !== true
    && session?.presentationSource === 'authenticated';
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
