import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// D-066: signup/profile are the earliest trustworthy boundary for a phone
// number this app will later use as an SMS destination. This repo has no
// live database in its test environment (see other route test files' same
// source-assertion convention), so this confirms the validator is actually
// wired into both write paths rather than exercising the full HTTP handler.
const source = fs.readFileSync(new URL('../api/auth/[action].js', import.meta.url), 'utf8');

test('auth route imports the shared recipient-phone validator', () => {
  assert.match(source, /import \{ normalizePhoneE164 \} from '\.\.\/_lib\/commsValidation\.js'/);
});

test('signup rejects an unparseable phone number before inserting the user row', () => {
  const signupStart = source.indexOf("if (action === 'signup')");
  const signupInsert = source.indexOf('insert into users', signupStart);
  const signupSection = source.slice(signupStart, signupInsert);
  assert.match(signupSection, /normalizePhoneE164\(phone\)/);
});

test('profile update rejects an unparseable phone number the same way signup does', () => {
  const profileStart = source.indexOf("if (action === 'profile')");
  const profileSection = source.slice(profileStart, profileStart + 2000);
  assert.match(profileSection, /normalizePhoneE164\(phone\)/);
});
