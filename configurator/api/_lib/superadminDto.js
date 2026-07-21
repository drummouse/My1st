export function toProjectDiagnostic(row) {
  return {
    id: row.id,
    jobNumber: row.job_number || null,
    layerCount: Number(row.layer_count || 0),
    facetCount: Number(row.facet_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTenantSummary(row) {
  return {
    id: row.id,
    email: row.email,
    companyName: row.business_name || row.company_name || null,
    phone: row.phone || null,
    role: row.role || 'owner',
    resellerId: row.reseller_id || null,
    status: row.status || 'active',
    statusReason: row.status_reason || null,
    statusChangedAt: row.status_changed_at || null,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at || null,
    deletedAt: row.deleted_at || null,
    purgeAfter: row.purge_after || null,
    projectCount: Number(row.project_count || 0),
  };
}

export function toAuditEvent(row) {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    metadata: row.metadata || {},
    requestId: row.request_id,
    supportReference: row.support_reference,
    result: row.result,
    createdAt: row.created_at,
  };
}

// Recipient (to_email/to_phone/payload.destination) is never exposed here —
// operational status is visible without ever revealing who a notice was
// sent to. `lastError` is safe to return as-is: it's redacted of recipient
// text at write time (see api/comms/index.js's applyRowState /
// commsValidation.js's redactRecipientFromText) before it ever reaches this
// column, not just at read time. `provider` is derived, not stored — one
// fewer column to keep in sync with `channel`.
const PROVIDER_BY_CHANNEL = { sms: 'twilio', email: 'sendgrid', in_app: null };

export function toNotification(row) {
  return {
    id: row.id,
    userId: row.user_id,
    channel: row.channel,
    provider: PROVIDER_BY_CHANNEL[row.channel] ?? null,
    template: row.template,
    status: row.status,
    attemptCount: Number(row.attempt_count || 0),
    nextAttemptAt: row.next_attempt_at,
    claimedAt: row.claimed_at,
    errorCategory: row.error_category,
    lastError: row.last_error,
    sentAt: row.sent_at,
    supportReference: row.support_reference,
    createdAt: row.created_at,
  };
}
