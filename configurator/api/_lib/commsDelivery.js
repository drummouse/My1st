import nodemailer from 'nodemailer';

// Every platform-sent notice — account notices and a tenant's own opted-in
// client notices alike — rides ONE shared platform Twilio number and Gmail
// account (env-configured). Only the message text (brand signature) and,
// for email, the Reply-To vary by tenant. There is no per-tenant phone
// number or sending domain (see decision log) — a tenant who wants their
// own must handle it themselves via the existing notification_webhook_url
// integration path ('self' notify_mode), not through this module.

const TWILIO_API = 'https://api.twilio.com/2010-04-01';

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

let transporter;
function getTransporter() {
  const user = process.env.GMAIL_SENDER_USER;
  const pass = process.env.GMAIL_SENDER_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transporter) transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
  return transporter;
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
      const transport = getTransporter();
      if (!transport) throw new Error('GMAIL_SENDER_USER/GMAIL_SENDER_APP_PASSWORD not configured');
      if (!destination) throw new Error('No destination email address');
      const brandName = (typeof identity === 'string' ? identity : identity?.brandName)
        || process.env.PLATFORM_DEFAULT_FROM_NAME || 'IronWrap 3D Configurator';
      const replyTo = typeof identity === 'object' ? identity?.replyTo : undefined;
      await transport.sendMail({
        from: `"${brandName}" <${process.env.GMAIL_SENDER_USER}>`,
        to: destination,
        replyTo: replyTo || undefined,
        subject: payload?.subject || 'Notification',
        text: payload?.message || '',
      });
    },
    sms: async (payload, destination) => {
      await sendTwilioSms({ to: destination, body: payload?.message || payload?.subject || 'Notification' });
    },
  };
}
