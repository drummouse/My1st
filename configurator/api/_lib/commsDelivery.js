// Every platform-sent notice — account notices and a tenant's own opted-in
// client notices alike — rides ONE shared platform Twilio number and
// SendGrid sender (env-configured). Only the message text (brand signature)
// and, for email, the Reply-To vary by tenant. There is no per-tenant phone
// number or sending domain (see decision log) — a tenant who wants their
// own must handle it themselves via the existing notification_webhook_url
// integration path ('self' notify_mode), not through this module. Both
// providers are called via plain fetch — no SDK, no new dependency (see
// decision log for the Gmail->SendGrid reversal: one vendor, no domain
// needed yet via SendGrid's single-sender verification, and it drops the
// one dependency the earlier Gmail-SMTP design added).

const TWILIO_API = 'https://api.twilio.com/2010-04-01';
const SENDGRID_API = 'https://api.sendgrid.com/v3/mail/send';

function twilioAuth() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return { sid, header: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}` };
}

async function sendTwilioSms({ to, body }) {
  const auth = twilioAuth();
  if (!auth) throw new Error('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not configured');
  const fromNumber = process.env.PLATFORM_DEFAULT_PHONE;
  if (!fromNumber) throw new Error('PLATFORM_DEFAULT_PHONE not configured');
  if (!to) throw new Error('No destination phone number');
  const res = await fetch(`${TWILIO_API}/Accounts/${auth.sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: auth.header, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: fromNumber, Body: body || '' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Twilio send failed: HTTP ${res.status} ${text}`);
  }
  return res.json();
}

async function sendGridEmail({ to, subject, text, fromName, replyTo }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error('SENDGRID_API_KEY not configured');
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  if (!fromEmail) throw new Error('SENDGRID_FROM_EMAIL not configured');
  if (!to) throw new Error('No destination email address');
  const res = await fetch(SENDGRID_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject: subject || 'Notification',
      content: [{ type: 'text/plain', value: text || '' }],
    }),
  });
  if (!res.ok) {
    const text2 = await res.text().catch(() => '');
    throw new Error(`SendGrid send failed: HTTP ${res.status} ${text2}`);
  }
}

// The provider-neutral adapter map notifications.js's deliverNotification()
// was designed for (see its own header comment) — keyed by
// notification_outbox.channel. `identity` here is the resolved brand/
// reply-to context from commsIdentity.js (either resolveAccountNoticeBrand's
// plain string or resolveClientNotifier's {brandName, replyTo} object).
export function buildDeliverers() {
  return {
    // The row itself is the notification (read via the superadmin
    // notifications list); there's nothing further to deliver.
    in_app: async () => {},
    email: async (payload, destination, identity) => {
      const brandName = (typeof identity === 'string' ? identity : identity?.brandName)
        || process.env.PLATFORM_DEFAULT_FROM_NAME || 'IronWrap 3D Configurator';
      const replyTo = typeof identity === 'object' ? identity?.replyTo : undefined;
      await sendGridEmail({
        to: destination,
        subject: payload?.subject,
        text: payload?.message,
        fromName: brandName,
        replyTo,
      });
    },
    sms: async (payload, destination) => {
      await sendTwilioSms({ to: destination, body: payload?.message || payload?.subject || 'Notification' });
    },
  };
}
