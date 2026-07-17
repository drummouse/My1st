const UNAVAILABLE = {
  error: 'This design is temporarily unavailable. Please contact the contractor.',
};

export function publicTenantAccess(status) {
  if (!status || status === 'active') return { allowed: true };
  return { allowed: false, status: 503, body: UNAVAILABLE };
}
