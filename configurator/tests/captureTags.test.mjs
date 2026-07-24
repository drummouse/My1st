import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCaptureService } from '../api/_lib/captureService.js';

function makeTagStore() {
  const state = { tags: [], deleted: [] };
  return {
    state,
    listTags: async ({ ownerId, includeAllOwners }) => state.tags.filter((t) => includeAllOwners || t.owner_id === ownerId),
    getTag: async (id) => state.tags.find((t) => t.id === id) || null,
    getTagByValue: async (ownerId, tag) => state.tags.find((t) => t.owner_id === ownerId && t.tag === tag) || null,
    insertTag: async (change) => {
      if (state.tags.some((t) => t.owner_id === change.ownerId && t.tag === change.tag)) return null;
      const row = { id: change.id, owner_id: change.ownerId, tag: change.tag, created_by: change.createdBy, created_at: 'now' };
      state.tags.push(row);
      return row;
    },
    deleteTag: async (id) => {
      state.deleted.push(id);
      state.tags = state.tags.filter((t) => t.id !== id);
    },
  };
}

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };
const SUPERADMIN = { id: 'user-s', role: 'superadmin' };

test('creating a tag validates and scopes it to the actor\'s own tenant', async () => {
  const store = makeTagStore();
  const service = createCaptureService({ store, randomUUID: () => 'tag-1' });
  const { tag, created } = await service.createTag(OWNER, { tag: '  Standing Seam  ' });
  assert.equal(created, true);
  assert.equal(tag.tag, 'standing seam');
  assert.equal(tag.ownerId, 'user-a');
  await assert.rejects(service.createTag(OWNER, { tag: '' }), { code: 'CAPTURE_TAG_INVALID' });
});

test('re-adding an existing tag is idempotent (reuses the vocabulary entry)', async () => {
  const store = makeTagStore();
  const service = createCaptureService({ store });
  const first = await service.createTag(OWNER, { tag: 'gutter' });
  assert.equal(first.created, true);
  const second = await service.createTag(OWNER, { tag: 'Gutter' });
  assert.equal(second.created, false);
  assert.equal(second.tag.id, first.tag.id);
  assert.equal(store.state.tags.length, 1);
});

test('two tenants may independently register the same tag text', async () => {
  const store = makeTagStore();
  const service = createCaptureService({ store });
  await service.createTag(OWNER, { tag: 'trim' });
  const { created } = await service.createTag(OTHER, { tag: 'trim' });
  assert.equal(created, true);
  assert.equal(store.state.tags.length, 2);
});

test('listing scopes to the actor\'s tenant; superadmin sees every tenant\'s vocabulary', async () => {
  const store = makeTagStore();
  const service = createCaptureService({ store });
  await service.createTag(OWNER, { tag: 'roofing' });
  await service.createTag(OTHER, { tag: 'siding' });
  const ownerTags = await service.listTags(OWNER);
  assert.deepEqual(ownerTags.map((t) => t.tag), ['roofing']);
  const allTags = await service.listTags(SUPERADMIN);
  assert.deepEqual(allTags.map((t) => t.tag).sort(), ['roofing', 'siding']);
});

test('removing a tag is row-scoped; cross-tenant and missing tags are not-found', async () => {
  const store = makeTagStore();
  const service = createCaptureService({ store });
  const { tag } = await service.createTag(OWNER, { tag: 'fascia' });
  await assert.rejects(service.removeTag(OTHER, tag.id), { code: 'CAPTURE_TAG_NOT_FOUND' });
  await assert.rejects(service.removeTag(OWNER, 'missing'), { code: 'CAPTURE_TAG_NOT_FOUND' });
  await service.removeTag(OWNER, tag.id);
  assert.deepEqual(store.state.deleted, [tag.id]);
});

test('superadmin may remove any tenant\'s tag', async () => {
  const store = makeTagStore();
  const service = createCaptureService({ store });
  const { tag } = await service.createTag(OWNER, { tag: 'downspout' });
  await service.removeTag(SUPERADMIN, tag.id);
  assert.deepEqual(store.state.deleted, [tag.id]);
});

test('tag routes are rewritten onto the consolidated function, capability-mapped, and smoke-guarded', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/tags'));
  assert.ok(sources.includes('/api/capture/tags/:tagId'));

  const routes = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(routes, /tags: 'capture\.create'/);
  assert.match(routes, /tag: 'capture\.create'/);

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture\/tags/);
});
