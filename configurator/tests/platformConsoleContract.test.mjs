import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Platform UI is capability gated and has no tenant impersonation', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const platform = fs.readFileSync(new URL('../src/components/PlatformConsole.jsx', import.meta.url), 'utf8');
  assert.match(app, /platform\.diagnostics\.read/);
  assert.doesNotMatch(app + platform, /asOwner|impersonat|switch tenant/i);
  assert.match(platform, /Freeze/);
  assert.match(platform, /Block/);
  assert.match(platform, /Reset password/);
});

test('temporary-password users are gated until password change succeeds', () => {
  const gate = fs.readFileSync(new URL('../src/components/AuthGate.jsx', import.meta.url), 'utf8');
  const auth = fs.readFileSync(new URL('../api/auth/[action].js', import.meta.url), 'utf8');
  assert.match(gate, /mustChangePassword/);
  assert.match(auth, /change-password/);
  assert.match(auth, /must_change_password = false/);
});
