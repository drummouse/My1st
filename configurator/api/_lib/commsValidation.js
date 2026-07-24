// Recipient validation for Communications — pure module, no I/O, mirroring
// capturePolicy.js's shared-validator idiom. Used at every point a phone or
// email is accepted (signup/profile) and again immediately before a
// notification is enqueued or dispatched, per decision D-066/D-067: the
// 2026-07-17 failed SMS rows trace to `users.phone` accepting any non-empty
// string at signup with zero format validation (see
// docs/COMMUNICATIONS_RUNBOOK.md's incident note) — this module is the fix.

// North American Numbering Plan: area code and exchange codes cannot start
// with 0 or 1. This alone rejects the historical placeholder class
// ("58777502024" — 11 digits, doesn't start with 1, fails this shape) without
// needing to special-case any specific bad value.
const NANP_NATIONAL = /^[2-9]\d{2}[2-9]\d{6}$/;

// Normalizes a Canadian or US phone number to E.164 (+1XXXXXXXXXX).
// Returns null for anything that isn't a valid NANP number — never guesses,
// never substitutes a default, never silently accepts malformed input.
export function normalizePhoneE164(raw) {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  // Reject anything with letters or other non-phone characters up front —
  // a placeholder like "5877750XXXX" has non-digit characters that a
  // digit-only strip would silently drop, which is exactly the kind of
  // silent acceptance this module exists to prevent.
  if (!/^\+?[\d\s().-]+$/.test(value)) return null;
  const digits = value.replace(/[^\d]/g, '');
  let national;
  if (digits.length === 11 && digits.startsWith('1')) {
    national = digits.slice(1);
  } else if (digits.length === 10) {
    national = digits;
  } else {
    return null;
  }
  if (!NANP_NATIONAL.test(national)) return null;
  return `+1${national}`;
}

// Deliberately conservative, not full RFC 5322 — this only needs to catch
// obviously-invalid recipients before they're enqueued, not replace a real
// email-verification flow (out of scope per the Communications MVP brief).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value || !EMAIL_PATTERN.test(value)) return null;
  return value;
}

// Masks a recipient for logs/API responses/error text — keeps just enough
// to be useful for support correlation without exposing the full value.
// "+15877750XXXX" -> "+1587***0202" shape (last 4 digits kept, rest starred).
export function maskPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (digits.length < 4) return '***';
  return `***${digits.slice(-4)}`;
}

export function maskEmail(raw) {
  if (!raw) return null;
  const value = String(raw);
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  const keep = name.length > 1 ? name[0] : '*';
  return `${keep}***@${domain}`;
}

// Strips a raw destination value out of provider error text before it's
// stored or returned — providers (Twilio in particular) sometimes echo the
// submitted "To" value back in their error message, which would otherwise
// leak into notification_outbox.last_error and the SuperAdmin API. Redacts
// any run of 6+ digits (covers full and partially-masked numbers alike) and
// any embedded email address.
export function redactRecipientFromText(text) {
  if (!text) return text;
  return String(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[redacted-email]')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, '[redacted-phone]');
}
