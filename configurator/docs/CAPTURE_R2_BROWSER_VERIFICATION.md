# IronWrap Capture R2 — Browser Acceptance Checklist

This checklist verifies the offline/durability behavior built by `captureLocalStore.js`
in a real browser (or a deployed authenticated Vercel preview), as required by
binding correction #12 of the R2 execution authorization. Automated unit tests
(`tests/captureLocalStore.test.mjs`) verify the storage-interface contract and
queueing/pruning logic against an injected in-memory driver; they cannot verify
actual browser `indexedDB` behavior, tab-close/reopen persistence, or real
network interruption. This checklist closes that gap.

**Status: not yet executed.** This file is created during R2.1 as the checklist
itself; results are recorded here once an authenticated Vercel preview is READY
(the live-smoke stage, R2.6), consistent with "do not claim a deployment
verified while it is still building."

## How to run this checklist

Against a deployed preview (`SMOKE_BASE_URL`), signed in as a tenant owner:

1. Start a Profile Geometry capture.
2. Complete calibration.
3. Accept at least one photo.
4. Perform each check below, recording pass/fail and the date/build (commit
   SHA) tested.

## Checklist

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | Draft survives refresh | ☐ pending | |
| 2 | Draft survives browser close and reopen | ☐ pending | |
| 3 | Original Blob (accepted photo) survives refresh | ☐ pending | |
| 4 | Original Blob survives close and reopen | ☐ pending | |
| 5 | Upload queue resumes automatically after reload | ☐ pending | |
| 6 | Successful upload removes local evidence only after server confirmation (verify by throttling network and checking IndexedDB in devtools mid-upload) | ☐ pending | |
| 7 | Failed upload retains local evidence and shows "Upload failed — tap to retry" | ☐ pending | |
| 8 | Duplicate upload (retry after a successful-but-unacknowledged request) does not create a second server-side asset | ☐ pending | |
| 9 | Unsynced-changes warning is shown before a destructive logout/deletion action, where implemented | ☐ pending | |
| 10 | "Saved on device" is never shown when data exists only in memory (verify by inspecting IndexedDB directly alongside the UI state) | ☐ pending | |

## Evidence

To be filled in with: date, commit SHA, preview URL, browser/OS, and either a
screen recording reference or step-by-step observed behavior, once a live
preview is available (R2.6 milestone report will link back to this file with
results filled in).
