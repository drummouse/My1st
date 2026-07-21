# Studio Workspace Correction Verification Record

## Milestone

Local visual-contract and build evidence for the red-direction Studio workspace correction. This
record is not publication, deployment, Preview verification, interactive acceptance, or release
approval.

| Field | Value |
| --- | --- |
| Date | 2026-07-20 |
| Verification scope | Local source-contract, complete test-suite, production/PWA/artifact/snapshot build, and whitespace checks |
| Approved visual reference | `ui-concept-04-red-direction.png` |
| Branch | `gpt-pr17-test` |
| Exact implementation commit | `1ae760f5e0b4cdd8885ea0a28e5c917c9b2b1746` (`fix: preserve restrained Studio red direction`) |
| Exact implementation tree | `bb5fac411b93848458712cb6c30530d7bbde9a80` |
| Publication | **Pending — this task did not push or publish.** |
| GPT Preview deployment | **Pending — no Task 7 Preview was created or provided.** |
| Release decision | **HOLD — exact-tree Preview and interactive acceptance remain pending.** |

The correction keeps graphite workspace framing and compact desktop rails, warm-white desktop
inspectors, and red on primary or selected controls rather than page surfaces or full-width
structural dividers. Mobile source contracts retain 44px control geometry, an explicit details
close action, a closable positioning sheet, and viewer fill after details close.

## Test-Driven Visual Contract Evidence

| Phase | Result | Evidence |
| --- | --- | --- |
| RED | Expected failure | `node --test tests/workspaceVisualContract.test.mjs tests/redStyle.test.mjs`: 12 tests, 10 passed and 2 failed. The failures identified the missing scoped `--studio-red` mapping and red full-width shell dividers. |
| GREEN | Pass | `node --test tests/workspaceVisualContract.test.mjs tests/redStyle.test.mjs tests/studioShell.test.mjs`: 53/53 passed. |

The source contracts assert the approved graphite/warm-white/red hierarchy, prohibit a red page
surface, keep structural dividers neutral, and preserve reachable mobile close controls and shared
44px interaction geometry.

## Local Automated Evidence

Runtime: Node `v24.14.0`, npm `11.9.0`.

| Check | Result | Evidence |
| --- | --- | --- |
| Complete test suite | Pass | `npm test` exited 0: 371 tests passed; 0 failed, skipped, cancelled, or todo. One existing non-failing `WebSocket server error: Port is already in use` advisory appeared. |
| Production/PWA/artifact/snapshot build | Pass | `npm run build` exited 0. Main build transformed 709 modules; the PWA service worker transformed 70 modules and generated `dist/sw.js`; the Share artifact transformed 708 modules; `dist/snapshot-template.html` was written at 2491 KB. |
| Whitespace validation | Pass | `git diff --check` exited 0 with no output before the implementation commit. It is rerun against the final documentation change before the documentation commit. |

The build retained the existing non-blocking chunk-size advisory. npm also emitted its existing
`http-proxy` configuration and update notices; none changed a command exit status.

## GPT Preview and Interactive Acceptance

No Task 7 deployment was authorized or created, and no exact-tree Preview URL or deployment ID was
provided. The rows below remain pending; local source contracts and builds do not substitute for
interactive evidence.

| Required behavior | Status | Exact Preview evidence still required |
| --- | --- | --- |
| Settings save and Expert toggle | Pending | Save Settings, reload effective values, and enter/exit Expert under the entitled preference. |
| Account and Project overlays | Pending | Open, operate, dismiss, and keyboard-check both overlays without viewport escape. |
| Full-screen administration | Pending | Open each administration section, verify bounded content, and close back to the prior workspace. |
| New Project Library defaults | Pending | Use Add Product and Add Service and verify the selected defaults survive the new-project flow. |
| Trims/Services boundary | Pending | Confirm Trims owns trim accessories while Services shows extras only, without duplicate pricing. |
| Authenticated Presentation | Pending | Enter Presentation from an authenticated project and edit allowed catalog selections. |
| Public Share | Pending | Open a generated public Share and confirm all catalog/design controls are read-only. |
| Desktop viewer controls | Pending | Exercise Front, Back, Left, Right, Top, and positioning with no rail/inspector/control overlap. |
| Mobile positioning | Pending | Open, scroll, operate, and close the bottom sheet while camera controls remain reachable. |
| Close-details viewer fill | Pending | Close Sales and Expert details and confirm the viewer consumes the released track. |

## Release Boundary

The exact implementation commit must be published to the GPT project, produce a ready Preview, and
pass every pending interactive row before release approval. No database, environment, credential,
Claude-lane, PR #17, Preview, Production, or remote branch change was performed by this milestone.
