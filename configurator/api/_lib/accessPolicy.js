export function authorizeUserRecord(user, session) {
  if (!user || user.deleted_at) return { ok: false, code: 'NOT_AUTHENTICATED' };
  if (user.status !== 'active') return { ok: false, code: 'ACCOUNT_RESTRICTED' };
  if (Number(user.session_version) !== Number(session?.sv)) {
    return { ok: false, code: 'SESSION_REVOKED' };
  }
  return { ok: true };
}
