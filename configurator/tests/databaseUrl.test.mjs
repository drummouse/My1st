import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('database bootstrap prefers the GPT sandbox URL and retains the legacy fallback', async () => {
  const source = await readFile(new URL('../api/_lib/db.js', import.meta.url), 'utf8');

  assert.match(
    source,
    /process\.env\.GPT_DATABASE_URL\s*\?\?\s*process\.env\.PROJECTS_DATABASE_URL/,
  );
});
