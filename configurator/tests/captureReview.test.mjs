import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCaptureService, REVIEW_QUEUE_STATUSES } from '../api/_lib/captureService.js';

const OWNER = { id: 'user-a', role: 'owner' };
const OTHER = { id: 'user-b', role: 'owner' };
const SUPER = { id: 'admin', role: 'superadmin' };
const RESELLER = { id: 'reseller', role: 'reseller' };

function makeStore(session) {
  const state = {
    session: session === undefined
      ? { id: 's1', owner_id: 'user-a', status: 'in_review', capture_type: 'guided_product', title: 'Panel' }
      : session,
    comments: [],
    writes: [],
    audits: [],
    queueFilters: null,
  };
  return {
    state,
    transaction: async (work) => work(),
    getSession: async () => state.session,
    listFields: async () => [],
    listAssets: async () => [],
    listComments: async () => state.comments,
    listMeasurements: async () => [],
    listClaudeAnalyses: async () => [],
    listReviewQueue: async (filters) => { state.queueFilters = filters; return state.session ? [state.session] : []; },
    updateSessionStatus: async (id, from, to) => { state.writes.push({ id, from, to }); return { ...state.session, status: to }; },
    insertComment: async (change) => { state.comments.push(change); return change; },
    appendAudit: async (event) => { state.audits.push(event); },
  };
}

test('the review queue is owner-scoped for owners and platform-wide for superadmin', async () => {
  const ownerStore = makeStore();
  await createCaptureService({ store: ownerStore }).listReviewQueue(OWNER, {});
  assert.equal(ownerStore.state.queueFilters.ownerId, 'user-a');
  assert.equal(ownerStore.state.queueFilters.includeAllOwners, false);

  const superStore = makeStore();
  await createCaptureService({ store: superStore }).listReviewQueue(SUPER, { status: 'submitted' });
  assert.equal(superStore.state.queueFilters.includeAllOwners, true);
  assert.equal(superStore.state.queueFilters.status, 'submitted');
});

test('an unknown status filter is dropped rather than passed to SQL', async () => {
  const store = makeStore();
  await createCaptureService({ store }).listReviewQueue(OWNER, { status: 'draft' });
  assert.equal(store.state.queueFilters.status, null);
  assert.ok(!REVIEW_QUEUE_STATUSES.includes('draft'));
});

test('starting a review claims a submitted capture with an audit trail', async () => {
  const store = makeStore({ id: 's1', owner_id: 'user-a', status: 'submitted', capture_type: 'quick' });
  const { session } = await createCaptureService({ store }).startReview(OWNER, 's1');
  assert.equal(session.status, 'in_review');
  assert.equal(store.state.audits[0].action, 'capture.review.started');
});

test('approve moves to approved without needing a reason', async () => {
  const store = makeStore();
  const { session } = await createCaptureService({ store }).decideReview(OWNER, 's1', 'approve');
  assert.equal(session.status, 'approved');
  assert.equal(store.state.audits[0].action, 'capture.review.approved');
});

test('request_changes and reject demand a written reason and record it', async () => {
  for (const [decision, toStatus, auditAction] of [
    ['request_changes', 'changes_requested', 'capture.review.changes_requested'],
    ['reject', 'rejected', 'capture.review.rejected'],
  ]) {
    const store = makeStore();
    const service = createCaptureService({ store });
    await assert.rejects(service.decideReview(OWNER, 's1', decision, '  '), { code: 'CAPTURE_REASON_REQUIRED' });
    assert.equal(store.state.writes.length, 0);
    const { session } = await service.decideReview(OWNER, 's1', decision, 'panel photo is blurred');
    assert.equal(session.status, toStatus);
    assert.equal(store.state.audits[0].action, auditAction);
    assert.equal(store.state.audits[0].reason, 'panel photo is blurred');
  }
});

test('unknown decisions and unauthorized roles are refused before any write', async () => {
  const store = makeStore();
  const service = createCaptureService({ store });
  await assert.rejects(service.decideReview(OWNER, 's1', 'promote'), { code: 'CAPTURE_DECISION_INVALID' });
  // Another tenant's reviewer sees not-found (row scoping hides existence
  // before capabilities are even consulted).
  await assert.rejects(service.decideReview(OTHER, 's1', 'approve'), { code: 'CAPTURE_SESSION_NOT_FOUND' });
  assert.equal(store.state.writes.length, 0);
  assert.equal(store.state.audits.length, 0);

  // A role without capture.review fails on capability even for a session it
  // can see (its own).
  const resellerStore = makeStore({ id: 's1', owner_id: 'reseller', status: 'in_review', capture_type: 'quick' });
  await assert.rejects(
    createCaptureService({ store: resellerStore }).decideReview(RESELLER, 's1', 'approve'),
    { code: 'CAPTURE_NOT_AUTHORIZED' },
  );
  assert.equal(resellerStore.state.writes.length, 0);
});

test('comments attach to reviewable sessions and appear in the detail', async () => {
  const store = makeStore({ id: 's1', owner_id: 'user-a', status: 'submitted', capture_type: 'quick' });
  const service = createCaptureService({ store, randomUUID: () => 'c1' });
  const { comment } = await service.addComment(OWNER, 's1', '  Looks close — retake the label.  ');
  assert.equal(comment.id, 'c1');
  assert.equal(comment.body, 'Looks close — retake the label.');
  const detail = await service.getSession(OWNER, 's1');
  assert.equal(detail.comments.length, 1);
});

test('comments are refused on drafts, archived captures, empty and oversized bodies', async () => {
  const service = (status) => createCaptureService({
    store: makeStore({ id: 's1', owner_id: 'user-a', status, capture_type: 'quick' }),
  });
  await assert.rejects(service('draft').addComment(OWNER, 's1', 'hello'), { code: 'CAPTURE_COMMENT_INVALID' });
  await assert.rejects(service('archived').addComment(OWNER, 's1', 'hello'), { code: 'CAPTURE_COMMENT_INVALID' });
  await assert.rejects(service('submitted').addComment(OWNER, 's1', '   '), { code: 'CAPTURE_COMMENT_INVALID' });
  await assert.rejects(service('submitted').addComment(OWNER, 's1', 'x'.repeat(4001)), { code: 'CAPTURE_COMMENT_INVALID' });
});

test('review routes demand capture.review and are wired through the consolidated function', async () => {
  const source = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  for (const action of ['review.queue', 'review.start', 'review.decide', 'review.comments']) {
    assert.match(source, new RegExp(`'${action.replaceAll('.', '\\.')}': 'capture\\.review'`));
  }
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  for (const path of ['/api/capture/review', '/api/capture/review/:id/start', '/api/capture/review/:id/decision', '/api/capture/review/:id/comments']) {
    assert.ok(sources.includes(path), `missing rewrite for ${path}`);
  }
  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture\/review/);
});
