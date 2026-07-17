export function deriveCustomerContext({ search = '', embeddedDesign = null } = {}) {
  if (embeddedDesign) return true;

  const params = new URLSearchParams(search);
  return params.has('p') || params.has('d');
}

export function getInitialCustomerContext(browserWindow = typeof window === 'undefined' ? undefined : window) {
  if (!browserWindow) return false;

  return deriveCustomerContext({
    search: browserWindow.location?.search || '',
    embeddedDesign: browserWindow.__IRONWRAP_DESIGN__ || null,
  });
}
