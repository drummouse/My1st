import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTURE_STATUSES,
  CAPTURE_TYPES,
  CAPTURE_CATEGORIES,
  EDITABLE_STATUSES,
  ITEM_TYPES,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_SESSION,
  allowedTransitions,
  assertTransition,
  normalizeCreateInput,
  normalizeDraftPatch,
  normalizeTagInput,
  normalizeTagValue,
} from '../api/_lib/capturePolicy.js';

test('capture status vocabulary is exactly the documented state machine', () => {
  assert.deepEqual([...CAPTURE_STATUSES], [
    'draft', 'submitted', 'in_review', 'changes_requested',
    'approved', 'publishing', 'published', 'rejected', 'archived',
  ]);
  assert.deepEqual([...EDITABLE_STATUSES], ['draft', 'changes_requested']);
});

test('every allowed transition passes for an owner and is audited', () => {
  for (const key of allowedTransitions()) {
    const [from, to] = key.split('->');
    const outcome = assertTransition('owner', from, to, 'because the test says so');
    assert.ok(outcome.audit.startsWith('capture.'), `${key} audit action`);
    assert.equal(outcome.metadata.fromStatus, from);
    assert.equal(outcome.metadata.toStatus, to);
  }
});

test('every undeclared status pair is rejected, exhaustively', () => {
  const allowed = new Set(allowedTransitions());
  for (const from of CAPTURE_STATUSES) {
    for (const to of CAPTURE_STATUSES) {
      const key = `${from}->${to}`;
      if (allowed.has(key)) continue;
      assert.throws(
        () => assertTransition('superadmin', from, to, 'reason'),
        { code: 'CAPTURE_TRANSITION_INVALID' },
        `expected ${key} to be rejected`,
      );
    }
  }
});

test('reviewer decisions that need a reason refuse to run without one', () => {
  for (const [from, to] of [['in_review', 'changes_requested'], ['in_review', 'rejected'], ['rejected', 'archived']]) {
    assert.throws(() => assertTransition('owner', from, to, '   '), { code: 'CAPTURE_REASON_REQUIRED' });
    assert.ok(assertTransition('owner', from, to, 'documented reason'));
  }
});

test('a role without capture capabilities cannot drive any transition', () => {
  for (const key of allowedTransitions()) {
    const [from, to] = key.split('->');
    assert.throws(
      () => assertTransition('reseller', from, to, 'reason'),
      { code: 'CAPTURE_NOT_AUTHORIZED' },
      `expected reseller to be blocked on ${key}`,
    );
  }
});

test('resubmission is the same submitted state with an audit flag', () => {
  const outcome = assertTransition('owner', 'changes_requested', 'submitted');
  assert.equal(outcome.audit, 'capture.session.submitted');
  assert.equal(outcome.metadata.resubmission, true);
  const first = assertTransition('owner', 'draft', 'submitted');
  assert.equal(first.metadata.resubmission, undefined);
});

test('publishing retry is an explicit self-transition', () => {
  const outcome = assertTransition('owner', 'publishing', 'publishing');
  assert.equal(outcome.audit, 'capture.session.publish_retried');
});

test('create input is normalized and validated', () => {
  const result = normalizeCreateInput({ title: `  Panel  `, clientRef: ' ref-1 ', category: 'roofing' });
  assert.equal(result.captureType, 'guided_product');
  assert.equal(result.title, 'Panel');
  assert.equal(result.clientRef, 'ref-1');
  assert.equal(result.category, 'roofing');
  assert.throws(() => normalizeCreateInput({ captureType: 'hologram' }), { code: 'CAPTURE_TYPE_INVALID' });
  assert.throws(() => normalizeCreateInput({ category: 'spaceship' }), { code: 'CAPTURE_CATEGORY_INVALID' });
  for (const type of CAPTURE_TYPES) assert.equal(normalizeCreateInput({ captureType: type }).captureType, type);
  for (const category of CAPTURE_CATEGORIES) assert.equal(normalizeCreateInput({ category }).category, category);
});

test('draft patches only touch provided keys and validate fields', () => {
  assert.deepEqual(normalizeDraftPatch({ title: ' New name ' }), { title: 'New name' });
  assert.equal(normalizeDraftPatch({ category: '' }).category, null);
  assert.throws(() => normalizeDraftPatch({}), { code: 'CAPTURE_PATCH_EMPTY' });
  assert.throws(() => normalizeDraftPatch({ fields: [] }), { code: 'CAPTURE_FIELDS_INVALID' });
  assert.throws(() => normalizeDraftPatch({ fields: { '': 'x' } }), { code: 'CAPTURE_FIELDS_INVALID' });
  const patch = normalizeDraftPatch({ fields: { notes: 'seen at supplier yard', sku: null } });
  assert.deepEqual(patch.fields, [
    { fieldKey: 'notes', value: 'seen at supplier yard' },
    { fieldKey: 'sku', value: null },
  ]);
});

test('a single tag value is normalized to a lowercase, bounded, punctuation-light string', () => {
  assert.equal(normalizeTagValue('  Standing Seam  '), 'standing seam');
  assert.equal(normalizeTagValue('gutter_5in'), 'gutter_5in');
  assert.throws(() => normalizeTagValue(''), { code: 'CAPTURE_TAG_INVALID' });
  assert.throws(() => normalizeTagValue('x'.repeat(MAX_TAG_LENGTH + 1)), { code: 'CAPTURE_TAG_INVALID' });
  assert.throws(() => normalizeTagValue('roofing/siding'), { code: 'CAPTURE_TAG_INVALID' });
  assert.deepEqual(normalizeTagInput({ tag: ' Trim ' }), { tag: 'trim' });
});

test('draft patches accept item type and a deduplicated, bounded tags array', () => {
  for (const itemType of ITEM_TYPES) {
    assert.equal(normalizeDraftPatch({ itemType }).itemType, itemType);
  }
  assert.throws(() => normalizeDraftPatch({ itemType: 'spaceship' }), { code: 'CAPTURE_ITEM_TYPE_INVALID' });

  const patch = normalizeDraftPatch({ tags: ['Roofing', 'roofing', ' Gutter '] });
  assert.deepEqual(patch.tags, ['roofing', 'gutter']);
  assert.throws(() => normalizeDraftPatch({ tags: 'roofing' }), { code: 'CAPTURE_TAGS_INVALID' });
  assert.throws(
    () => normalizeDraftPatch({ tags: Array.from({ length: MAX_TAGS_PER_SESSION + 1 }, (_, i) => `tag-${i}`) }),
    { code: 'CAPTURE_TAGS_INVALID' },
  );
});
