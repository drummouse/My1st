function restrictionMessage(state, reason, supportReference) {
  return {
    subject: `IronWrap account ${state}`,
    message: `Your IronWrap account has been ${state}. Reason: ${reason}. Please contact SuperAdmin as soon as possible. Reference: ${supportReference}`,
    state,
    reason,
    supportReference,
  };
}

export function buildRestrictionNotifications(user, state, reason, supportReference) {
  const payload = restrictionMessage(state, reason, supportReference);
  const notifications = [{
    userId: user.id, channel: 'in_app', template: 'account-restricted',
    destination: user.id, payload, supportReference,
  }];
  if (user.email) notifications.push({
    userId: user.id, channel: 'email', template: 'account-restricted',
    destination: user.email, payload, supportReference,
  });
  if (user.phone) notifications.push({
    userId: user.id, channel: 'sms', template: 'account-restricted',
    destination: user.phone, payload, supportReference,
  });
  return notifications;
}

// "Dear <name>, <message> Best wishes, <Brand> team." — the shared voice
// for every platform-sent notice to a tenant's own client. brandName is
// resolved by commsIdentity.js's resolveClientNotifier() cascade at
// enqueue time (the reseller's own name if this tenant has one, else the
// platform's), so a reseller's own downstream clients see that reseller's
// name here, never Configurator's.
function clientNoticeText({ recipientName, message, brandName }) {
  const greeting = recipientName ? `Dear ${recipientName}` : 'Hello';
  return `${greeting}, ${message} Best wishes,\n${brandName} team`;
}

// The business-facing counterpart to buildRestrictionNotifications above: a
// tenant's own message to its own project customer. Only built at all when
// the caller has already confirmed (via resolveClientNotifier) that this
// tenant opted into platform-sent client notices — a 'self' tenant's
// approvals never reach this function, see api/projects/index.js. Pure
// builder — the caller does the actual notification_outbox insert, same
// division as everywhere else in this file.
export function buildDesignApprovedNotifications(project, supportReference, shareUrl, brandName) {
  const message = `your design has been approved. View it anytime: ${shareUrl}`;
  const payload = {
    subject: `Design approved — Job ${project.job_number || project.id}`,
    message: clientNoticeText({ recipientName: project.customer_name, message, brandName }),
    shareUrl,
  };
  const notifications = [];
  if (project.customer_email) notifications.push({
    channel: 'email', template: 'design-approved', destination: project.customer_email, payload, supportReference,
  });
  if (project.customer_phone) notifications.push({
    channel: 'sms', template: 'design-approved', destination: project.customer_phone, payload, supportReference,
  });
  return notifications;
}

// context.destination/context.identity are the drain worker's resolved
// values (see api/comms/index.js) — a real DB row has no top-level
// `destination` column (it lives inside payload for legacy account-notice
// rows, or in notification_outbox.to_email/to_phone for newer business-
// event rows), so the caller resolves it and passes it explicitly. Falling
// back to row.destination/row.payload.destination keeps this compatible
// with the pre-existing shape callers/tests already pass. `identity` is
// either a plain brand-name string (account notices) or a
// {brandName, replyTo} object (client notices) — see commsDelivery.js.
export async function deliverNotification(row, deliverers, context = {}) {
  const deliver = deliverers[row.channel];
  if (!deliver) return { status: 'pending', error: 'Provider is not configured' };
  const destination = context.destination || row.destination || row.payload?.destination;
  await deliver(row.payload, destination, context.identity || null);
  return { status: 'sent', error: null };
}
