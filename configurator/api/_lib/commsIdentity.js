import { sql } from './db.js';

const PLATFORM_BRAND_NAME = () => process.env.PLATFORM_DEFAULT_FROM_NAME || 'IronWrap 3D Configurator';

// Whose brand signs a platform account notice (password reset, status
// change) to a given recipient: one level up the fixed 3-tier hierarchy
// (Company -> [reseller] -> owner). A reseller's own owners see that
// reseller's name in the signature; a reseller itself (and any owner with
// no reseller) sees the platform's own fixed brand name, since there's
// nothing above them to white-label from. Every send still rides the one
// shared platform Twilio number/Gmail account — only the text changes.
export async function resolveAccountNoticeBrand(recipientUser) {
  if (recipientUser?.reseller_id) {
    const [identity] = await sql`select display_name from sender_identities where user_id = ${recipientUser.reseller_id}`;
    if (identity?.display_name) return identity.display_name;
  }
  return PLATFORM_BRAND_NAME();
}

// Whether — and under whose brand — a tenant's own client-facing notices
// (e.g. design.approved) should be sent by the platform at all. Returns
// null when the tenant has chosen 'self' (the default): no platform send,
// whether that means doing it by hand or through their own automation
// against settings.notification_webhook_url — either way this function's
// caller should not enqueue anything.
export async function resolveClientNotifier(ownerUserId) {
  const [owner] = await sql`select id, email, reseller_id from users where id = ${ownerUserId}`;
  if (!owner) return null;
  const [ownerIdentity] = await sql`select notify_mode, contact_email from sender_identities where user_id = ${owner.id}`;
  if (!ownerIdentity || ownerIdentity.notify_mode !== 'platform') return null;

  let brandName = PLATFORM_BRAND_NAME();
  if (owner.reseller_id) {
    const [resellerIdentity] = await sql`select display_name from sender_identities where user_id = ${owner.reseller_id}`;
    if (resellerIdentity?.display_name) brandName = resellerIdentity.display_name;
  }
  return { brandName, replyTo: ownerIdentity.contact_email || owner.email };
}

export async function getOwnSenderIdentity(userId) {
  const [identity] = await sql`select * from sender_identities where user_id = ${userId}`;
  return identity || null;
}

export async function upsertSenderIdentity(userId, { notifyMode, displayName, contactEmail }) {
  const [row] = await sql`
    insert into sender_identities (user_id, notify_mode, display_name, contact_email)
    values (${userId}, ${notifyMode || 'self'}, ${displayName || null}, ${contactEmail || null})
    on conflict (user_id) do update set
      notify_mode = coalesce(${notifyMode || null}, sender_identities.notify_mode),
      display_name = coalesce(${displayName || null}, sender_identities.display_name),
      contact_email = coalesce(${contactEmail || null}, sender_identities.contact_email),
      updated_at = now()
    returning *
  `;
  return row;
}
