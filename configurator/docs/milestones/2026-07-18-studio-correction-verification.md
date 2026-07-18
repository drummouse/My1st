# Studio Correction Verification Record

## Milestone

Studio correction and Expert entitlement release gate for PR #17. This record is evidence, not release approval.

| Field | Value |
| --- | --- |
| Date | 2026-07-18 |
| Tester | Local automated verification and read-only Vercel inspection (Codex) |
| Branch | `chatgpt/ui-foundation-design` |
| Local release-candidate source | `5c909149a27ba665d41f0789a813c9053fbb8096` (`fix: neutralize legacy disabled actions`) |
| Remote branch source observed | `a8b0fa50423bf579348352bcdeef5208e59c629b` (`chore: redeploy Studio preview`) |
| Preview URL | `https://ironwrap-configurator-gpt-4vlq2thcz-drummouses-projects.vercel.app` |
| Preview deployment | `dpl_7QQusLSpZHhYs8Kpdi3DuPLP2XxZ`; Vercel state `READY` at 2026-07-18 06:15:53 UTC |
| Release decision | **HOLD — release gate is not satisfied** |

The Preview is 23 commits behind the locally verified release candidate. The attempted branch push was rejected by the execution environment's external-disclosure safety gate, so no Preview for `5c90914` was created. No merge or Production deployment was performed.

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
| Latest source published | **Blocked** | `git push origin chatgpt/ui-foundation-design` was rejected by the execution environment's external-disclosure safety gate. Remote remains `a8b0fa5`; local release candidate is `5c90914`. |
| Preview deployment ready | Partial | Vercel reports the exact URL above as `READY`, but its Git metadata identifies `a8b0fa5`, not the local release candidate. |
| `/api/auth/me` runtime response | **Pending** | A clean request at 2026-07-18 11:31:56 UTC returned HTTP 302 to Vercel SSO. The application endpoint did not return JSON, so absence of a platform runtime error is not established. |
| Authenticated walkthrough | **Pending** | No application credentials were available. No authenticated behavior is marked passed. |

## Authenticated Functional Gate

Every row below requires direct evidence on a Preview built from the release-candidate SHA. `Pending authenticated Preview verification` is not a pass.

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

1. `5c90914` plus this verification evidence is published to `chatgpt/ui-foundation-design`.
2. The resulting Vercel Preview is `READY` and its Git SHA matches the published release candidate.
3. `/api/auth/me` returns application JSON rather than a platform/runtime error or protection redirect in the verification context.
4. Every authenticated functional row above has direct evidence.
5. The user gives explicit release approval.

No Production deployment is authorized by this record.
