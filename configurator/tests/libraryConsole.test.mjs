import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Library Console exposes approved sections and reserves future modules', async () => {
  const source = await readFile(new URL('../src/components/LibraryConsole.jsx', import.meta.url), 'utf8');
  for (const label of ['Records', 'Organizations', 'Taxonomy', 'Relationships', 'Import / Export', 'Migration']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /Product Knowledge/);
  assert.match(source, /Trade Community/);
  assert.match(source, /Coming next/);
});

test('Library write, import, and export controls use exact capabilities', async () => {
  const source = await readFile(new URL('../src/components/LibraryConsole.jsx', import.meta.url), 'utf8');
  for (const capability of ['catalog.write', 'catalog.import', 'catalog.export']) assert.match(source, new RegExp(capability.replace('.', '\\.')));
  assert.doesNotMatch(source.toLowerCase(), /customer address|project measurements|password hash/);
});

test('import commit remains separate from file selection and dry run', async () => {
  const source = await readFile(new URL('../src/components/LibraryConsole.jsx', import.meta.url), 'utf8');
  assert.match(source, /Run dry run/);
  assert.match(source, /Commit approved import/);
  assert.match(source, /allConflictsDecided/);
});
