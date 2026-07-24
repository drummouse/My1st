import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('operations and Capture handoff document stable contracts', async () => {
  const operations = await readFile(new URL('../docs/LIBRARY_OPERATIONS.md', import.meta.url), 'utf8');
  const capture = await readFile(new URL('../docs/CAPTURE_LIBRARY_HANDOFF.md', import.meta.url), 'utf8');
  assert.match(operations, /schemaVersion.*1/s);
  assert.match(operations, /dry run.*zero database mutations/is);
  assert.match(operations, /email.*SMS.*pending/is);
  assert.match(capture, /sourceType.*capture/s);
  assert.match(capture, /pending_review/);
  assert.match(capture, /captureConfidence/);
  // R2.6 (D-047): corrected to describe actual behavior — publish is
  // create-only straight to 'approved' (D-029), and pending_review is a
  // proposed-target label used only by the side-effect-free dry-run, not
  // a live intake-queue state. Pin the correction so it can't silently
  // regress back to the stale description.
  assert.match(capture, /side-effect-free/i);
  assert.match(capture, /review_status\s*=\s*'approved'/);
});

test('milestone report records automated verification and deployment boundary', async () => {
  const report = await readFile(new URL('../docs/milestones/2026-07-17-library-core-verification.md', import.meta.url), 'utf8');
  assert.match(report, /65\/65/);
  assert.match(report, /Production.*requires deployment/is);
});
