import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The Tag UI slice — makes D-053–D-056's schema + tag CRUD (shipped
// UI-less) actually usable in the guided-product editor. This repo has no
// component-rendering test infra (no jsdom/testing-library), so — matching
// every other .jsx contract test in this suite (see captureSubmit.test.mjs) —
// these assert against the component's source text.
const panelUrl = new URL('../src/components/CapturePanel.jsx', import.meta.url);

test('CapturePanel imports the shared tag/item-type constants verbatim from capturePolicy.js', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  assert.match(panel, /import \{ validateCompleteness, DIMENSION_UNITS, EXPOSURE_CATEGORIES, ITEM_TYPES, MAX_TAG_LENGTH, MAX_TAGS_PER_SESSION \} from '\.\.\/\.\.\/api\/_lib\/capturePolicy\.js'/);
});

test('the draft-patch round trip carries itemType/tags as top-level keys, matching normalizeDraftPatch\'s contract (not nested under fields)', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  const formFromDetail = panel.slice(panel.indexOf('const formFromDetail'), panel.indexOf('const patchFromForm'));
  assert.match(formFromDetail, /itemType: detail\.session\.itemType \|\| ''/);
  assert.match(formFromDetail, /tags: detail\.session\.tags \|\| \[\]/);

  const patchFromForm = panel.slice(panel.indexOf('const patchFromForm'), panel.indexOf('// Live completeness'));
  assert.match(patchFromForm, /itemType: form\.itemType \|\| null/);
  assert.match(patchFromForm, /tags: form\.tags \|\| \[\]/);
  // Must be siblings of `fields`, not inside it — the API only accepts
  // itemType/tags at the top level of the patch body.
  assert.doesNotMatch(patchFromForm.slice(0, patchFromForm.indexOf('fields: {')), /fields:/);
});

test('TagPicker fetches the tenant\'s vocabulary and can register a genuinely new tag', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  const component = panel.slice(panel.indexOf('function TagPicker'), panel.indexOf('// Stage 1–3 Capture workspace'));
  assert.match(component, /captureApi\.listTags\(\)/);
  assert.match(component, /captureApi\.createTag\(value\)/);
  // Session tags are never validated against the vocabulary server-side
  // (D-055) — a failed best-effort vocabulary registration must not block
  // adding the tag to the session itself. onChange (adding to form.tags)
  // happens unconditionally before the createTag call, and createTag is
  // wrapped so its rejection can't propagate.
  const onChangeIndex = component.indexOf('onChange([...tags, value]);');
  const createTagIndex = component.indexOf('captureApi.createTag(value)');
  assert.ok(onChangeIndex > -1 && createTagIndex > onChangeIndex, 'tag is added to the session before the vocabulary registration attempt');
  assert.match(component, /try \{[\s\S]*createTag\(value\)[\s\S]*\} catch/);
});

test('the tag input enforces MAX_TAG_LENGTH/MAX_TAGS_PER_SESSION client-side, matching the server contract', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  const component = panel.slice(panel.indexOf('function TagPicker'), panel.indexOf('// Stage 1–3 Capture workspace'));
  assert.match(component, /maxLength=\{MAX_TAG_LENGTH\}/);
  assert.match(component, /tags\.length >= MAX_TAGS_PER_SESSION/);
});

test('item type is optional and offers every ITEM_TYPES value plus an unclassified default', async () => {
  const panel = await readFile(panelUrl, 'utf8');
  assert.match(panel, /<option value="">Not classified<\/option>/);
  assert.match(panel, /\{ITEM_TYPES\.map\(\(id\) => <option key=\{id\} value=\{id\}>\{ITEM_TYPE_LABELS\[id\] \|\| id\}<\/option>\)\}/);
});

test('tag chip/picker CSS classes used by the component are actually defined', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
  for (const cls of ['.capture-tags', '.capture-tag-chips', '.capture-tag-chip', '.capture-tag-input-row', '.capture-tag-suggestions', '.capture-tag-suggestion']) {
    assert.ok(css.includes(cls), `missing CSS rule: ${cls}`);
  }
});
