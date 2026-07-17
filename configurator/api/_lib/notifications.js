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

export async function deliverNotification(row, deliverers) {
  const deliver = deliverers[row.channel];
  if (!deliver) return { status: 'pending', error: 'Provider is not configured' };
  await deliver(row.payload, row.destination);
  return { status: 'sent', error: null };
}
