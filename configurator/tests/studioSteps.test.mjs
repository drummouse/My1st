import test from 'node:test';
import assert from 'node:assert/strict';
import { STUDIO_STEPS, getStudioStep, nextStudioStep, previousStudioStep } from '../src/lib/studioSteps.js';

test('Sales Mode exposes the approved ordered workflow', () => {
  assert.deepEqual(STUDIO_STEPS.map((step) => step.key), ['project', 'roof', 'siding', 'accents', 'services', 'review']);
  assert.equal(getStudioStep('accents').label, 'Trims & Accents');
});

test('Sales Mode freezes every workflow entry as well as the containing list', () => {
  assert.equal(Object.isFrozen(STUDIO_STEPS), true);
  for (const step of STUDIO_STEPS) assert.equal(Object.isFrozen(step), true);
});

test('step progression clamps at the workflow boundaries', () => {
  assert.equal(previousStudioStep('project').key, 'project');
  assert.equal(nextStudioStep('roof').key, 'siding');
  assert.equal(nextStudioStep('review').key, 'review');
});
