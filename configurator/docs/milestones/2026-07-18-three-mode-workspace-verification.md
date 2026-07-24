# Three-Mode Workspace Local Verification Record

## Milestone

Local release-gate evidence for the three-mode Studio workspace reconstruction. This record is not a branch review, publication, Preview verification, deployment approval, or release approval.

| Field | Value |
| --- | --- |
| Date | 2026-07-20 |
| Verification scope | Local automated checks and repository inspection only |
| Branch | `chatgpt/ui-foundation-design` |
| Implementation candidate | `8835ab6c17bb66bf4cb81a1da736ee32839cd45a` (`fix: resolve workspace static review gaps`) |
| Candidate tree | `9cda434923773ac9863133ff7f220f1841f3cd18` |
| Reviewed commit range | `c533e71b541609f680e1e4b02f07831cef46a045..8835ab6c17bb66bf4cb81a1da736ee32839cd45a` (27 commits) |
| Runtime | Node `v24.14.0`, npm `11.9.0` |
| Release decision | **HOLD — local evidence is incomplete for release.** |

The range adds the Sales, Expert, and public Showroom workspace implementations; mode-transition and public-boundary hardening; trim/service separation and legacy normalization; unit and export updates; responsive workspace styles; and automated coverage. It has not received the required whole-branch code review in this verification task.

## Local Automated Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Complete test suite | Pass | `npm test` exited 0: 283 tests passed; 0 failures, 0 skipped, 0 cancelled. A `WebSocket server error: Port is already in use` message appeared during a passing test run; it did not cause a test failure. |
| Exact production build | **Fail — not marked passed** | `npm run build` exited 1 after Vite transformed 702 modules and emitted the main bundle. Workbox service-worker generation failed in Terser `renderChunk` with `Unexpected early exit`; the artifact and snapshot stages of this chained command did not run. The existing chunk-over-500-kB advisory was also emitted. |
| Artifact and snapshot build | Pass | `./node_modules/.bin/vite build --config vite.artifact.config.js && node scripts/build-snapshot-template.mjs` exited 0: 701 modules transformed, artifact bundle written, and `dist/snapshot-template.html` written at 2451 KB. The existing chunk-over-500-kB advisory was emitted. |
| Whitespace validation | Pass | `git diff --check` exited 0 with no whitespace errors before this record was added; it must be rerun against the final documentation commit. |

The exact production/PWA build is a release blocker in this local runtime. The successful artifact/snapshot build does not turn that failed exact command into a pass.

## Pending Evidence

| Gate | Status | Required evidence |
| --- | --- | --- |
| Whole-branch review | **Pending** | Review the complete candidate range for security, mode isolation, persistence/data loss, legacy normalization, pricing de-duplication, exports, responsive accessibility, and CSS cascade; resolve any Critical or Important findings and rerun the gate. |
| Publication | **Pending** | Publish the exact reviewed tree. No branch push or remote mutation was performed for this record. |
| Vercel Preview/runtime | **Pending** | Verify a `READY` Preview for the exact published commit/tree and confirm `/api/auth/me` returns application JSON rather than a platform runtime error. No Preview URL, deployment, or runtime request applies to this candidate. |
| Authenticated functional/visual walkthrough | **Pending** | Verify login; Sales/Expert/Showroom transitions and public isolation; New/Open/Save/Download/refresh/Share; legacy trims and non-duplicated pricing; extras-only Services; units; five camera views; positioning; exports; desktop/tablet/mobile screenshots; and keyboard/focus behavior. |
| Release approval | **Pending** | Obtain explicit user approval after all prior gates are evidenced. |

## Release Boundary

PR #17 must remain unmerged and Production unchanged. No Preview publication, deployment, merge, or Production action was performed by this verification task.

Historical PR #17 Preview evidence in `2026-07-18-studio-correction-verification.md` applies to its recorded historical tree only; it is not evidence for candidate `8835ab6`.
