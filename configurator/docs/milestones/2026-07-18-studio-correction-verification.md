# Studio Correction Verification Record

## Milestone

Studio correction and Expert entitlement release gate for PR #17. This record is evidence, not release approval.

| Field | Value |
| --- | --- |
| Date | 2026-07-18 |
| Tester | Local automated verification and read-only Vercel inspection (Codex) |
| Branch | `chatgpt/ui-foundation-design` |
| Current local implementation candidate | `8835ab6c17bb66bf4cb81a1da736ee32839cd45a` (`fix: resolve workspace static review gaps`) |
| Status of PR #17 Preview evidence | **Historical only — it does not cover the current implementation candidate.** |
| Verified local evidence source | `c533e71b541609f680e1e4b02f07831cef46a045` (`docs: verify Studio correction preview`) |
| Published remote source | `155e07dab010f355858f9b0f3f73d6df8f294f50` (squashed publication of the verified tree) |
| Verified tree | `71be1f80e7e1da468e28046d629755d8ff0e97c0` (identical locally and remotely) |
| Preview URL | `https://ironwrap-configurator-gpt-3hroq3fix-drummouses-projects.vercel.app` |
| Preview deployment | `dpl_A5VamP8iYfwANDb5DyuqE3qxcLP8`; Vercel state `READY` |
| Release decision | **HOLD — the current candidate still requires whole-branch review, publication, Vercel runtime verification, authenticated walkthrough, and user approval.** |

The verified tree was published as one squashed commit through the GitHub integration. Vercel built that exact tree successfully. No merge or Production deployment was performed. That evidence applies only to the historical tree `71be1f8`; it must not be treated as a Preview, runtime, or functional verification of current candidate `8835ab6`. The current local evidence is recorded separately in `2026-07-18-three-mode-workspace-verification.md`.

## Local Automated Evidence

Runtime: Node `v24.14.0`, npm `11.9.0`.

| Check | Result | Evidence |
| --- | --- | --- |
| Exact release-gate command | **Fail** | `npm test && npm run build && git diff --check` exited 1. Tests completed first; the build then failed, so the chained whitespace step did not run. |
| Complete test suite | Pass | `npm test`: 187/187 tests passed, 0 failures, 0 skipped, 0 cancelled. |
| Main production/PWA build | **Fail — not marked passed** | `npm run build`: Vite transformed 692 modules and wrote the main bundle, then Workbox service-worker generation failed at Terser `renderChunk` with `Unexpected early exit`; command exited 1 before the artifact/snapshot stages. This is the known local Node 24/Workbox baseline, but it is not an exact build pass. The existing chunk-over-500-kB advisory was also emitted. |
| Artifact and snapshot builds | Pass | `./node_modules/.bin/vite build --config vite.artifact.config.js && node scripts/build-snapshot-template.mjs` exited 0: 691 modules transformed; artifact bundle completed; `dist/snapshot-template.html` was written at 2394 KB. The existing chunk advisory was emitted. |
| Whitespace validation | Pass | Separate `git diff --check` exited 0 with no whitespace errors. |

## Preview and Runtime Evidence

| Check | Status | Evidence |
| --- | --- | --- |
| Latest source published | Historical — not current candidate | Remote commit `155e07d` has tree `71be1f8`, matching the historical verified tree only. Current candidate `8835ab6` has not been published by this record. |
| Preview deployment ready | Historical — not current candidate | Vercel reported deployment `dpl_A5VamP8iYfwANDb5DyuqE3qxcLP8` as `READY` for historical commit `155e07d`; no current-candidate deployment was checked. |
| `/api/auth/me` runtime response | Historical — not current candidate | The historical Preview returned HTTP 401 with `application/json` and `{"error":"Not authenticated"}`. No current-candidate runtime request was made. |
| Authenticated walkthrough | **Pending** | No application credentials were available. No authenticated behavior is marked passed. |

## Authenticated Functional Gate

Every row below requires direct authenticated evidence on the exact-tree Preview. `Pending authenticated Preview verification` is not a pass.

| Behavior | Status | Evidence required before release |
| --- | --- | --- |
| Login | Pending | Sign in with an approved account and confirm authenticated Studio entry. |
| New project | Pending | Create a project and confirm account defaults and catalog defaults populate. |
| Open project | Pending | Open a project and confirm its identity and design apply after defaults settle. |
| Save project | Pending | Save, observe the saved state, and confirm the stored project identity. |
| Download/export | Pending | Exercise the supported download/export action and inspect the result. |
| Refresh restoration | Pending | Refresh a saved edit URL and confirm the saved design restores exactly once. |
| Share Design | Pending | Generate the standalone HTML, open it, and confirm design/runtime units. |
| Existing saved projects | Pending | Open representative existing projects, including a legacy snapshot, without data loss. |
| Expert entitlement and preferences | Pending | Verify SuperAdmin, entitled owner preference on/off, unentitled owner, and effective Expert visibility combinations. |
| Company units | Pending | Switch Imperial/metric company units and confirm labels/conversions while canonical quantities remain stable. |
| Trims and accents | Pending | Edit standard and additional trims across product, profile, color, quantity, unit, and lock state; save and reopen. |
| Custom optional services | Pending | Edit standardized and custom optional services, including quantity and lock behavior; save and reopen. |
| 3D positioning | Pending | Move the model with bounded positioning controls and confirm Front remains independently reachable. |
| Five camera controls | Pending | Exercise Front, Back, Left, Right, and Top and confirm distinct visible/accessibility labels. |
| Internal brand preservation | Pending | Confirm the authenticated brand switch stays hidden while saved brand state/assets survive load, save, and export. |
| Desktop/tablet/mobile layouts | Pending | Inspect workflow navigation, viewer, inspector, project menu, estimate dock, and touch targets at all three layout classes. |

## Release Boundary

PR #17 must remain unmerged until all of the following are true:

1. The current candidate receives a whole-branch review that resolves all Critical and Important findings.
2. The reviewed current tree is published and its Preview is `READY` for the exact published commit/tree.
3. The current-candidate `/api/auth/me` response is application JSON rather than a platform/runtime error.
4. Every authenticated functional row above has direct evidence on that exact Preview.
5. The user gives explicit release approval.

No Production deployment is authorized by this record.
