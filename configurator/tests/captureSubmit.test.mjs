import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCompleteness, EXPOSURE_CATEGORIES, DIMENSION_UNITS } from '../api/_lib/capturePolicy.js';
import { createCaptureService } from '../api/_lib/captureService.js';

const OWNER = { id: 'user-a', role: 'owner' };

const completeFields = () => [
  { fieldKey: 'manufacturer', value: 'Schlebach' },
  { fieldKey: 'sku', value: 'SS-450' },
  { fieldKey: 'description', value: 'Standing seam panel' },
  { fieldKey: 'dimensions', value: { unit: 'mm', width: 450, length: null, thickness: 0.5 } },
  { fieldKey: 'coverage', value: { exposure: 430 } },
  { fieldKey: 'color', value: { mode: 'manual', name: 'Charcoal', hex: '#333333' } },
];
const completeAssets = () => [
  { purpose: 'main', classification: 'source' },
  { purpose: 'surface', classification: 'source' },
  { purpose: 'label', classification: 'source' },
];
const guidedSession = (overrides = {}) => ({
  captureType: 'guided_product', title: 'Panel', category: 'roofing', ...overrides,
});

test('a fully complete guided capture validates clean with a full score', () => {
  const result = validateCompleteness({
    session: guidedSession(), fields: completeFields(), assets: completeAssets(),
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.score, 100);
});

test('base requirements are errors for every capture type', () => {
  const result = validateCompleteness({ session: { captureType: 'quick', title: '', category: null }, fields: [], assets: [] });
  const codes = result.errors.map((e) => e.code);
  assert.ok(codes.includes('TITLE_REQUIRED'));
  assert.ok(codes.includes('CATEGORY_REQUIRED'));
  assert.ok(codes.includes('MAIN_PHOTO_REQUIRED'));
});

test('identity and dimensions block a guided capture but only warn a quick one', () => {
  const base = { title: 'Panel', category: 'accessory' };
  const guided = validateCompleteness({
    session: { ...base, captureType: 'guided_product' },
    fields: [],
    assets: [{ purpose: 'main', classification: 'source' }],
  });
  assert.ok(guided.errors.some((e) => e.code === 'IDENTITY_REQUIRED'));
  assert.ok(guided.errors.some((e) => e.code === 'DIMENSIONS_REQUIRED'));

  const quick = validateCompleteness({
    session: { ...base, captureType: 'quick' },
    fields: [],
    assets: [{ purpose: 'main', classification: 'source' }],
  });
  assert.deepEqual(quick.errors, []);
  assert.ok(quick.warnings.some((w) => w.code === 'IDENTITY_REQUIRED'));
  assert.ok(quick.warnings.some((w) => w.code === 'DIMENSIONS_REQUIRED'));
});

test('exposure is required exactly for the exposure categories', () => {
  assert.deepEqual([...EXPOSURE_CATEGORIES], ['roofing', 'siding']);
  const fields = completeFields().filter((f) => f.fieldKey !== 'coverage');
  for (const category of EXPOSURE_CATEGORIES) {
    const result = validateCompleteness({ session: guidedSession({ category }), fields, assets: completeAssets() });
    assert.ok(result.errors.some((e) => e.code === 'EXPOSURE_REQUIRED'), `${category} must require exposure`);
  }
  const gutter = validateCompleteness({ session: guidedSession({ category: 'gutter' }), fields, assets: completeAssets() });
  assert.ok(!gutter.errors.some((e) => e.code === 'EXPOSURE_REQUIRED'));
  assert.ok(!gutter.warnings.some((w) => w.code === 'EXPOSURE_REQUIRED'));
});

test('dimension units are constrained and derived-only photos do not count', () => {
  const dims = [{ fieldKey: 'dimensions', value: { unit: 'furlong', width: 450 } }];
  const result = validateCompleteness({
    session: guidedSession(),
    fields: [...completeFields().filter((f) => f.fieldKey !== 'dimensions'), ...dims],
    assets: [{ purpose: 'main', classification: 'derived' }],
  });
  assert.ok(result.errors.some((e) => e.code === 'DIMENSIONS_REQUIRED'));
  assert.ok(result.errors.some((e) => e.code === 'MAIN_PHOTO_REQUIRED'));
  assert.ok(DIMENSION_UNITS.includes('mm') && DIMENSION_UNITS.includes('in'));
});

function makeStore(session) {
  const state = {
    session: session === undefined
      ? { id: 's1', owner_id: 'user-a', status: 'draft', capture_type: 'guided_product', title: 'Panel', category: 'roofing' }
      : session,
    fields: completeFields().map((f) => ({ field_key: f.fieldKey, value: f.value })),
    assets: completeAssets().map((a, index) => ({ id: `a${index}`, session_id: 's1', ...a, url: 'https://x.public.blob.vercel-storage.com/a.jpg', size_bytes: 10 })),
    submissions: [],
    audits: [],
  };
  return {
    state,
    transaction: async (work) => work(),
    getSession: async () => state.session,
    listFields: async () => state.fields,
    listAssets: async () => state.assets,
    applySubmission: async (id, fromStatus, snapshot, completeness) => {
      state.submissions.push({ id, fromStatus, snapshot, completeness });
      return { ...state.session, status: 'submitted', completeness };
    },
    appendAudit: async (event) => { state.audits.push(event); },
  };
}

test('submit freezes an immutable snapshot and audits with the score', async () => {
  const store = makeStore();
  const service = createCaptureService({ store });
  const { session, completeness } = await service.submitSession(OWNER, 's1');
  assert.equal(session.status, 'submitted');
  assert.equal(completeness.errors.length, 0);
  const [submission] = store.state.submissions;
  assert.equal(submission.fromStatus, 'draft');
  assert.equal(submission.snapshot.session.title, 'Panel');
  assert.equal(submission.snapshot.fields.length, 6);
  assert.equal(submission.snapshot.assets.length, 3);
  assert.equal(submission.snapshot.completeness.score, 100);
  assert.equal(submission.snapshot.submittedBy, 'user-a');
  assert.equal(store.state.audits[0].action, 'capture.session.submitted');
  assert.equal(store.state.audits[0].metadata.completenessScore, 100);
});

test('an incomplete capture cannot submit and nothing is written', async () => {
  const store = makeStore();
  store.state.fields = [];
  const service = createCaptureService({ store });
  await assert.rejects(service.submitSession(OWNER, 's1'), (error) => {
    assert.equal(error.code, 'CAPTURE_INCOMPLETE');
    assert.ok(error.details.errors.length > 0);
    return true;
  });
  assert.equal(store.state.submissions.length, 0);
  assert.equal(store.state.audits.length, 0);
});

test('resubmission from changes_requested carries the resubmission audit flag', async () => {
  const store = makeStore({
    id: 's1', owner_id: 'user-a', status: 'changes_requested',
    capture_type: 'guided_product', title: 'Panel', category: 'roofing',
  });
  const service = createCaptureService({ store });
  await service.submitSession(OWNER, 's1');
  assert.equal(store.state.audits[0].metadata.resubmission, true);
});

test('submit is refused from states the machine does not allow', async () => {
  const store = makeStore({
    id: 's1', owner_id: 'user-a', status: 'in_review',
    capture_type: 'guided_product', title: 'Panel', category: 'roofing',
  });
  await assert.rejects(
    createCaptureService({ store }).submitSession(OWNER, 's1'),
    { code: 'CAPTURE_TRANSITION_INVALID' },
  );
});

test('validate returns server-truth completeness without writing anything', async () => {
  const store = makeStore();
  store.state.fields = [];
  const result = await createCaptureService({ store }).validateSession(OWNER, 's1');
  assert.ok(result.errors.length > 0);
  assert.equal(store.state.submissions.length, 0);
});

test('routes: submit/validate are wired, PATCH cannot smuggle transitions, client shares the validator', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const sources = config.rewrites.map((rule) => rule.source);
  assert.ok(sources.includes('/api/capture/sessions/:id/submit'));
  assert.ok(sources.includes('/api/capture/sessions/:id/validate'));
  assert.ok(sources.indexOf('/api/capture/sessions/:id/submit') < sources.indexOf('/api/capture/sessions/:id'));

  const route = await readFile(new URL('../api/capture/index.js', import.meta.url), 'utf8');
  assert.match(route, /String\(req\.body\.status\) !== 'archived'/);

  const smoke = await readFile(new URL('../scripts/smoke-test.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /auth guard \/api\/capture submit/);

  const panel = await readFile(new URL('../src/components/CapturePanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /import \{ validateCompleteness, DIMENSION_UNITS, EXPOSURE_CATEGORIES \} from '\.\.\/\.\.\/api\/_lib\/capturePolicy\.js'/);
});
