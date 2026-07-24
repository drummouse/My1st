import { randomUUID } from 'node:crypto';
import { assertAccountTransition } from './superadminPolicy.js';
import { buildRestrictionNotifications } from './notifications.js';

export function createSupportReference() {
  return `IW-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
}

// The adapter owns the database transaction. Keeping the orchestration
// independent of Neon makes the all-or-nothing contract directly testable.
export async function changeAccountStatus({
  transaction, actor, targetId, nextStatus, reason, requestId,
}) {
  return transaction(async (store) => {
    const target = await store.lockUser(targetId);
    if (!target) throw new Error('Account not found');
    const transition = assertAccountTransition(actor, target, nextStatus, reason);
    const supportReference = createSupportReference();
    const updated = await store.updateUserStatus({
      targetId, actorId: actor.id, supportReference, ...transition,
    });
    await store.insertAudit({
      actorId: actor.id, action: `account.${nextStatus}`, targetId,
      reason: transition.reason, requestId, supportReference,
    });
    const { notifications, skipped } = buildRestrictionNotifications(
      target, nextStatus, transition.reason, supportReference,
    );
    await store.insertNotifications(notifications);
    return { user: updated, supportReference, notificationsQueued: notifications.length, notificationsSkipped: skipped };
  });
}
