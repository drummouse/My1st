# Studio UI Foundation Verification Record

> Historical foundation evidence only. The current Studio correction release gate is recorded in
> [`2026-07-18-studio-correction-verification.md`](./2026-07-18-studio-correction-verification.md).
> This record does not approve the corrected source for release.

## Milestone

Studio UI foundation: the Sales Mode presentation, its protected configurator behavior, and its release gate.

| Field | Value |
| --- | --- |
| Date | 2026-07-17 |
| Tester | Local automated verification (Codex) |
| Branch | `chatgpt/ui-foundation-design` |
| Verified source commit | `015898d5f9cdefd30230414b9f3f514de559f04c` (`fix: separate fresh projects from legacy restore`) |
| Preview URL | Pending draft PR publication and Vercel Preview creation |

The verified source commit is the implementation revision being released. The separate local documentation/test commit is recorded in the Task 10 execution report after Git assigns it.

## Local Automated Evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Focused final-review contracts | Pass | `node --test tests/startupPersistence.test.mjs tests/newProjectDesignState.test.mjs tests/studioDesignState.test.mjs tests/studioSteps.test.mjs tests/studioTokens.test.mjs tests/studioShell.test.mjs tests/studioRecovery.test.mjs`: 44/44 tests passed, 0 failures |
| Complete test suite | Pass | `npm test`: 115/115 tests passed, 0 failures (2026-07-17) |
| Production and snapshot builds | Pass with existing advisory | `npm run build`: main PWA build, artifact build, and snapshot-template generation completed; the existing Rollup chunks-over-500-kB advisory was emitted |
| Whitespace validation | Pass | `git diff --check`: no whitespace errors |

## Authenticated Preview Gate

The following checks have **not** been performed in an authenticated Preview. Each browser row remains blocked until a tester records direct Preview evidence. `Pending authenticated Preview verification` is not a pass result.

| Protected behavior | Status | Evidence required before release |
| --- | --- | --- |
| login | Blocked | Pending authenticated Preview verification: sign in as the required owner/user role and confirm the Sales Mode entry point. |
| real XML | Blocked | Pending authenticated Preview verification: load a real-world XML design and confirm it renders without fallback/mock data. |
| rotatable 3D | Blocked | Pending authenticated Preview verification: rotate the 3D model and select a facet. |
| products/profiles/colors | Blocked | Pending authenticated Preview verification: change product, profile, and color selections and confirm the viewer/estimate update. |
| facet overrides | Blocked | Pending authenticated Preview verification: apply and clear a facet-level override. |
| measurements | Blocked | Pending authenticated Preview verification: inspect measurements after design changes. |
| estimate | Blocked | Pending authenticated Preview verification: confirm estimate totals and guided-step navigation. |
| save/refresh | Blocked | Pending authenticated Preview verification: save a design, refresh the page, and confirm the saved state returns. |
| Share Design HTML | Blocked | Pending authenticated Preview verification: export Share Design HTML and open the generated result. |
| PDF | Blocked | Pending authenticated Preview verification: export a PDF and confirm the downloaded report. |
| customer context | Blocked | Pending authenticated Preview verification: open the customer Showroom context and confirm it takes precedence over authenticated presentation. |
| Expert toggle | Blocked | Pending authenticated Preview verification: authorize and toggle Expert presentation without resetting design state. |
| Platform | Blocked | Pending authenticated Preview verification: verify capability-guarded Platform access. |
| Library | Blocked | Pending authenticated Preview verification: verify the Library entry and its capability guard. |
| responsive layouts | Blocked | Pending authenticated Preview verification: inspect desktop, tablet, and mobile layouts, including navigation and inspector behavior. |

## External Steps Remaining

1. Use the July 18 correction record for current source, automated totals, Preview state, and blockers.
2. Add direct authenticated evidence to every blocked row above.
3. Obtain explicit release approval before marking the PR ready, merging, or deploying to Production.
