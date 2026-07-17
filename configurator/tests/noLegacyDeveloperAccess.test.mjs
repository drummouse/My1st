import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(target) : target.endsWith('.js') ? [target] : [];
  });
}

test('tenant APIs contain no legacy developer ownership bypass', () => {
  const apiRoot = fileURLToPath(new URL('../api/', import.meta.url));
  for (const file of javascriptFiles(apiRoot)) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      source,
      /isDeveloper|resolveOwnerId|canActOnOwner|asOwner/,
      path.relative(apiRoot, file),
    );
  }
});
