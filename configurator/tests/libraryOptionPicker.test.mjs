import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readComponent = (name) => readFile(new URL(`../src/components/${name}.jsx`, import.meta.url), 'utf8');

test('picker searches labels and returns its selected option once', async () => {
  const source = await readComponent('LibraryOptionPicker');
  assert.match(source, /aria-label="Search Library"/);
  assert.match(source, /onSelect\(option\)/);
  assert.match(source, /key=\{`\$\{option\.source\}:\$\{option\.id\}`\}/);
});
