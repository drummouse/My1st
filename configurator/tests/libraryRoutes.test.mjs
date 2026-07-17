import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('every Library action maps to an exact catalog capability', async () => {
  const source = await readFile(new URL('../api/superadmin/index.js', import.meta.url), 'utf8');
  for (const [action, capability] of Object.entries({
    'library.records': 'catalog.read',
    'library.record': 'catalog.write',
    'library.relationships': 'catalog.write',
    'library.documents': 'catalog.write',
    'library.export': 'catalog.export',
    'library.import.dry-run': 'catalog.import',
    'library.import.commit': 'catalog.import',
    'library.migration.status': 'catalog.read',
    'library.migration.run': 'catalog.import',
  })) {
    assert.match(source, new RegExp(`['"]${action.replaceAll('.', '\\.')}['"]\\s*:\\s*['"]${capability.replaceAll('.', '\\.')}['"]`));
  }
});

test('Library actions delegate only after server capability authorization', async () => {
  const source = await readFile(new URL('../api/superadmin/index.js', import.meta.url), 'utf8');
  const authorization = source.indexOf('requireCapability(req, res, capability)');
  const delegation = source.indexOf("action.startsWith('library.')");
  assert.ok(authorization > -1 && delegation > authorization);
  assert.doesNotMatch(source, /req\.body\?\.capabilities|req\.headers\?\.role/);
});

test('Vercel keeps Library under the consolidated SuperAdmin function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(config.rewrites.some((rule) => rule.source === '/api/superadmin/library' && rule.destination.includes('library.records')));
});
