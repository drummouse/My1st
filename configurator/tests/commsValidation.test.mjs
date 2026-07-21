import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhoneE164, normalizeEmail, maskPhone, maskEmail, redactRecipientFromText,
} from '../api/_lib/commsValidation.js';

test('rejects the exact placeholder-phone class responsible for the 2026-07-17 failed rows (D-066)', () => {
  // The real stored value (users.phone) behind the incident — 11 digits,
  // does not start with 1, not a valid NANP number.
  assert.equal(normalizePhoneE164('58777502024'), null);
  // The masked form Twilio's own error text echoed back — also invalid,
  // for a different reason (non-digit characters), and must be rejected
  // the same way, not silently stripped down to a shorter "valid" number.
  assert.equal(normalizePhoneE164('5877750XXXX'), null);
});

test('normalizes valid Canadian and US numbers to E.164', () => {
  assert.equal(normalizePhoneE164('5873777663'), '+15873777663');
  assert.equal(normalizePhoneE164('+15873777663'), '+15873777663');
  assert.equal(normalizePhoneE164('1-587-377-7663'), '+15873777663');
  assert.equal(normalizePhoneE164('(587) 377-7663'), '+15873777663');
  assert.equal(normalizePhoneE164('  587.377.7663  '), '+15873777663');
});

test('rejects malformed/placeholder shapes without guessing or substituting', () => {
  assert.equal(normalizePhoneE164(''), null);
  assert.equal(normalizePhoneE164(null), null);
  assert.equal(normalizePhoneE164(undefined), null);
  assert.equal(normalizePhoneE164('0000000000'), null); // area code can't start with 0
  assert.equal(normalizePhoneE164('1234567890'), null); // area code can't start with 1
  assert.equal(normalizePhoneE164('123'), null);
  assert.equal(normalizePhoneE164('not a phone number'), null);
  assert.equal(normalizePhoneE164('+44 20 7946 0958'), null); // non-NANP intl number
});

test('normalizeEmail accepts well-formed addresses and rejects the rest', () => {
  assert.equal(normalizeEmail('Solaris@Example.com'), 'solaris@example.com');
  assert.equal(normalizeEmail('  a@b.co  '), 'a@b.co');
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail('missing@domain'), null);
  assert.equal(normalizeEmail('spaces in@email.com'), null);
});

test('masking keeps recipients out of logs/API responses while staying support-correlatable', () => {
  assert.equal(maskPhone('+15873777663'), '***7663');
  assert.equal(maskPhone(null), null);
  assert.equal(maskEmail('solarisleo1983@gmail.com'), 's***@gmail.com');
  assert.equal(maskEmail(null), null);
});

test('redactRecipientFromText strips phone/email fragments out of raw provider error text', () => {
  const raw = "Twilio send failed: HTTP 400 {\"code\":21211,\"message\":\"Invalid 'To' Phone Number: 5877750XXXX\"}";
  const redacted = redactRecipientFromText(raw);
  assert.equal(redacted.includes('5877750'), false);
  assert.match(redacted, /\[redacted-phone\]/);

  const withEmail = 'SendGrid send failed: HTTP 400 recipient solarisleo1983@gmail.com is invalid';
  assert.match(redactRecipientFromText(withEmail), /\[redacted-email\]/);
  assert.equal(redactRecipientFromText(withEmail).includes('solarisleo1983'), false);
});
