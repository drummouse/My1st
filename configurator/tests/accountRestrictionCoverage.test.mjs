import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('authenticated APIs do not use unverified session ids', () => {
  for (const path of [
    '../api/projects/index.js', '../api/settings/index.js', '../api/custom-services/index.js',
    '../api/materials/index.js', '../api/colors/index.js', '../api/attachments/index.js',
    '../api/upload.js', '../api/_lib/folders.js',
  ]) {
    assert.doesNotMatch(read(path), /\bgetUserId\b/, path);
  }
});

test('public tenant resources enforce account restriction', () => {
  for (const path of ['../api/materials/index.js', '../api/colors/index.js']) {
    const source = read(path);
    assert.match(source, /requireUserId/, path);
    assert.doesNotMatch(source, /requirePublicTenant|searchParams\.get\(['"]ownerId['"]\)/, path);
  }

  assert.match(read('../api/_lib/folders.js'), /requirePublicTenant/);
  assert.match(read('../api/attachments/index.js'), /publicTenantAccess/);

  const projects = read('../api/projects/index.js');
  assert.match(projects, /sub === 'catalog'/);
  assert.match(projects, /requirePublicProjectAccess/);
  assert.match(projects, /publicTenantAccess/);
});
