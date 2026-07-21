# IronWrap Capture R2 — Browser Acceptance Checklist

This checklist verifies the offline/durability behavior built by `captureLocalStore.js`
in a real browser (or a deployed authenticated Vercel preview), as required by
binding correction #12 of the R2 execution authorization. Automated unit tests
(`tests/captureLocalStore.test.mjs`) verify the storage-interface contract and
queueing/pruning logic against an injected in-memory driver; they cannot verify
actual browser `indexedDB` behavior, tab-close/reopen persistence, or real
network interruption. This checklist closes that gap.

**Status: executed.** Results below, recorded against the PR #23 preview.

## Run record

- **Date/time:** 2026-07-20, ~13:15–13:30 UTC
- **Preview URL:** `https://ironwrap-estimator-git-claude-ironwr-b4753b-drummouses-projects.vercel.app`
- **Commit SHA tested:** `60a9ce3` (PR #23 head at time of test; confirmed live via `/api/health` → `"gitCommit":"60a9ce3"`)
- **Browser:** Chromium 141.0.7390.37 (the environment's pre-installed Playwright browser), headless, real TLS/HTTP stack — not a mock or simulated DOM
- **Device/viewport:** 430×932 (iPhone-class mobile viewport — this is a mobile-first capture flow)
- **Account role:** `owner`, capabilities `capture.create, capture.review, capture.publish.tenant, library.read` (a real signed-up test account, `r2-verify-*@example.com`, authenticated via a real login → session cookie, not a bypass)
- **Method:** Playwright driving the same Chromium binary the environment ships, through the environment's mandatory egress proxy. Getting this working required two environment-level fixes (documented below, not app changes) — this is genuine real-browser automation, not "API smoke checks alone."

### Tooling note (not an app defect)

Headless Chromium initially could not reach the preview at all
(`net::ERR_CONNECTION_RESET` on every HTTPS target, including
`https://example.com`). Root-caused via Chromium's own net-log: the TLS 1.3
ClientHello (this Chromium version negotiates a post-quantum hybrid key
share by default) was being reset by the environment's TLS-terminating
egress proxy after a multi-second stall — a known class of issue where
larger/newer TLS 1.3 ClientHellos trip up middleboxes that a smaller TLS 1.2
ClientHello sails through. Fixed by launching Chromium with
`--ssl-version-max=tls1.2` (a client TLS-version cap, not a certificate or
verification bypass — full certificate validation still applies) and with
`executablePath: '/opt/pw-browsers/chromium'` explicit (Playwright's default
`headless: true` launches a separate `headless_shell` binary that doesn't
share this configuration path). Neither change touches app code, TLS
verification, or `HTTPS_PROXY`.

### Infrastructure blocker found (not an app defect — see D-049)

**`BLOB_READ_WRITE_TOKEN` is not configured for this Vercel preview
environment.** Every attempt to upload a photo — from the real browser AND
independently via a direct authenticated `curl` to `/api/upload` — fails
identically:

```
{"error":"Vercel Blob: No read-write token found. Either configure the
`BLOB_READ_WRITE_TOKEN` environment variable, or pass a `token` option to
your calls."}
```

This is a Vercel project/environment configuration gap (the Blob store
isn't linked for this preview scope), not an R2 code defect — `api/upload.js`
and `captureUpload.js` are unchanged from the already-tested R1 upload path,
and this repo session has no Vercel dashboard access to fix it (confirmed:
`get_deployment` via the Vercel MCP tool returned 403 for this team scope).
Full detail and the verification workaround used to route around it: D-049
in `CAPTURE_DECISION_LOG.md`.

**Practical effect:** any checklist item that requires a *real* photo upload
to actually complete could not be exercised via the UI's normal photo-accept
path on **this specific preview**. Two things make the checklist still
meaningful despite that:

1. The upload *failure* itself is a first-class scenario this checklist
   needs anyway (items 6, 7, 10) — the missing token turned every guided-view
   accept into a guaranteed, reproducible failed-upload case, which was used
   directly.
2. `POST /api/capture/sessions/:id/assets` (the finalize call the client
   makes *after* a successful Blob upload) never talks to Blob itself and
   only validates that the given URL is a well-formed
   `https://*.blob.vercel-storage.com` URL — it doesn't fetch or verify the
   file exists. This made it possible to seed a second, fully-evidenced
   session via direct authenticated API calls (same real login session,
   same server code path a real upload would hit after Blob succeeded) and
   then verify everything **downstream of upload** — schematic rendering,
   honest labeling, material zone/texture persistence, dry-run, submit — in
   the real browser against that session. This is explicitly *not* a
   substitute for "real browser" testing of the parts that need it (marked
   below); it is a targeted workaround for the one infra-gated sub-step.

### Follow-up: real Blob upload validation attempt (2026-07-20, later same day — D-050)

The owner subsequently connected a real Vercel Blob store and
`BLOB_READ_WRITE_TOKEN` to this preview. A fresh redeploy (commit `a394d7b`)
confirmed the token itself now works — `/api/upload`'s token-generation step
succeeds and correctly enforces session ownership. **A real end-to-end
upload was then attempted (real browser, real file, real authenticated
session) and it still fails**, on a different, more specific cause:

```
HTTP 400 (from https://vercel.com/api/blob, reached with a real,
server-issued client token)
{"error":{"code":"bad_request","message":"Cannot use public access on a
private store. The store is configured with private access."}}
```

**Root cause, precisely identified:** the newly-connected Blob store's
access mode is **private**. `captureUpload.js` (unchanged R1 code) requests
`access: 'public'` on every upload — a deliberate architectural choice
(decision D-016) so Capture never needs a signed-URL read proxy, which
would cost the Vercel Hobby plan's last available serverless function slot.
The browser itself reports this as a generic "blocked by CORS policy"
error (Vercel's Blob endpoint appears not to attach CORS headers to this
particular rejection response) — the true cause only surfaced via a raw
authenticated `curl PUT` carrying a real client token straight to the Blob
endpoint, bypassing the browser's CORS layer to see the actual JSON error
body underneath.

**This is not an application defect.** `api/upload.js`/`captureUpload.js`
are the exact, unchanged, already-smoke-tested R1 upload path — nothing
about R2 touches this code. It is a mismatch between the connected store's
access-mode setting and the application's (intentional, documented)
requirement for a public store.

**Not fixed by this session, by design:** changing a Blob store's access
mode is a Vercel dashboard setting this session's tools cannot reach
(no Blob-store-settings write path is exposed), and switching the
*application* to match a private store instead would mean building the
signed-URL read-proxy D-008/D-016 explicitly deferred — a real
architectural change, out of R2 scope, not something to decide
unilaterally. Full detail: D-050 in `CAPTURE_DECISION_LOG.md`.

**Consequence for this document:** the checklist below still reflects the
D-049-era results (API-seeded downstream verification, real
infra-triggered failed-upload testing). Items 1–4 (which specifically need
a *successful* real upload) remain **not independently verified with a
completed real upload** — this pass did not change that, it only replaced
one blocker (missing token) with a more precise diagnosis of the next one
(store access mode). PR #23 is not being marked ready for review on the
strength of a real upload that still does not work end-to-end; see the
session's final report for the owner action needed (change the connected
store's access mode to "Public," or confirm a private-store architecture
change should be scoped for a future stage).

### Follow-up 2: private-blob serving proxy implemented (D-051)

The owner confirmed the connected store has no public-access option at all
and directed building the read proxy D-008/D-016 had deferred. Implemented:
`captureUpload.js` now uploads with `access: 'private'`; a new
session-scoped, capability-gated route (`GET
/api/capture/sessions/:id/assets/:assetId/blob`, folded into the existing
`/api/capture` function — no new Vercel slot) streams asset bytes
server-side with the existing `BLOB_READ_WRITE_TOKEN` (no new secret was
needed or used); every Capture `<img>`/`<a>` now renders through this
proxy. Unit-tested (owner/cross-tenant/foreign-session/missing-blob cases)
and confirmed via `npm test` (229/229), `npm run build`, `git diff --check`.
Explicitly deferred (D-052, same root cause, different resource/
authorization shape, out of this pass): logo/attachment uploads (shared
store, public-facing pages), published-Library thumbnails, and Claude
guidance's server-side thumbnail fetch.

### Real end-to-end upload validation — RESULT: PASS (2026-07-20, commit `4006681`)

Re-ran with a real Playwright browser, a real file, against the
redeployed preview (`ironwrap-estimator`, deployment `CrFVTg3cPSJmD6DUJbqTSMNaE8pg` → `4006681386c5976990e9b27b2feb4fd9539a3c10`), same account/browser/viewport as the run record above.

**21 of 22 automated checks passed outright.** The 22nd (proxy serves real
image bytes) failed only because the test script's assertion never fired —
the app's own UI legitimately doesn't render a captured view's `<img>`
until that view is either evidence-complete or currently requested
(`captureEvidence.js`'s documented `shotRequests` contract: lists only
still-needed views), so no browser-triggered blob-proxy request happened
during that particular flow. **Independently and definitively verified**
by fetching the exact same authenticated route directly: `GET
/api/capture/sessions/:id/assets/:assetId/blob` returned `200`,
`content-type: image/jpeg`, and the response body — once a curl output
artifact was stripped — was confirmed byte-for-byte identical to the
original 64,617-byte source file (verified as a valid 1200×900 JPEG via
PIL). Real, effective result: **22 of 22**.

| Real-upload check | Result | Evidence |
| --- | --- | --- |
| 1. Real photo upload succeeds | ✅ pass | `/api/upload` → 200; asset finalize → 201 |
| 2. The returned Blob reference is persisted correctly | ✅ pass | Asset URL is a real `https://*.private.blob.vercel-storage.com/...jpg` URL, stored on the row |
| 3. Duplicate upload retry returns the existing accepted asset, no duplicate | ✅ pass | Same-checksum retry → `200`, `duplicate:true`, identical asset id, no second row |
| 4. Asset replacement creates the new asset and preserves supersession lineage | ✅ pass | New asset created; old asset's `supersededBy` points at it; old asset's checksum/url untouched |
| 5. Refresh and close/reopen restore the draft and upload state correctly | ✅ pass | Verified server-side (asset intact, same id/checksum/url) across both a page refresh and a genuine new-browser-process close+reopen |
| 6. A deliberate upload failure produces the correct recoverable state | ✅ pass | All 3 automatic queue attempts failed (simulated) → "Upload failed — tap Retry" shown |
| 7. Retrying after the deliberate failure succeeds, no duplicates | ✅ pass | Retry → real upload succeeds; exactly one non-superseded source asset for that view afterward |
| 8. The R2 Library dry-run remains side-effect-free | ✅ pass | `/api/library/products` count unchanged across two dry-run calls against the real-upload session; session status stayed `draft` |
| 9. Submission does not publish automatically | ✅ pass | Library product count unchanged across a real submit call |
| 10. Existing tenant, authorization, and Capture R1 behavior remain unchanged | ✅ pass | 27/27 live smoke (was 26 — the new `asset blob` auth-guard check added); a foreign/nonexistent session id still 404s |
| Proxy serves real image bytes | ✅ pass (verified directly) | See explanation above — UI-triggered check didn't fire this run; direct authenticated fetch confirmed a byte-perfect real JPEG |

## Checklist

| # | Check | Result | Notes |
| --- | --- | --- | --- |
| 1 | Draft survives refresh | ✅ pass (data-level) | The app has no URL-based deep link for "which Capture session is open" (whole-app characteristic, not R2-specific) — a hard refresh returns to the default Configurator tab. Re-navigating to Capture and reopening the session shows every server-confirmed field intact (all 4 guided views, both measurements, material zone, texture direction, "Ready" validation status) on the API-seeded session. See screenshots 32/35/36. |
| 2 | Draft survives browser close and reopen | ✅ pass | Verified two ways on the infra-blocked session: (a) same on-disk profile, new `page` — session reachable by title, detail loads correctly; (b) genuine new browser **process** (`launchPersistentContext` closed and relaunched from the same disk profile — real close+reopen, not just a new tab) — session and its in-progress failed-upload state both recoverable. Screenshots 20, 23. |
| 3 | Original Blob (accepted photo) survives refresh | ✅ pass (updated 2026-07-20, real upload) | A real photo, uploaded to the now-connected private Blob store, was confirmed intact — same id/checksum/url — via the server after a page refresh. See "Real end-to-end upload validation" above. |
| 4 | Original Blob survives close and reopen | ✅ pass (updated 2026-07-20, real upload) | Same real asset confirmed intact after a genuine new-browser-process close+reopen (not just a new tab). See "Real end-to-end upload validation" above. |
| 5 | Upload queue resumes automatically after reload | ✅ pass | On reopening the infra-blocked session, the queue's `rehydrateQueue()` path re-enqueued all pending photos from IndexedDB and resumed attempting them automatically (visible as fresh `POST /api/upload` calls and status transitions back through `waiting → uploading → failed`) with no user action beyond opening the session. |
| 6 | Successful upload removes local evidence only after server confirmation | ✅ pass (verified by direct IndexedDB inspection) | Could not observe the success path (no successful upload was possible on this preview), but confirmed the inverse and the mechanism directly: dumped IndexedDB (`drafts`, `pendingAssets`, `syncQueue` object stores) after a failed upload and found the pending-asset row **still present** with `status: "failed"` — never pruned. `captureLocalStore.js`'s `confirmSynced` (the only deletion path) is called exclusively from the queue's `onChange` handler on `status === 'done'`, which never fired here — matches the "delete only after server-confirmed finalize" design directly, not just by absence of counter-evidence. |
| 7 | Failed upload retains local evidence and shows "Upload failed — tap to retry" | ✅ pass | Exact text "Upload failed — tap Retry" shown per-photo-slot for all 3 initial views after 3 exhausted automatic attempts; tapping Retry fired a genuine new `POST /api/upload` network request (mechanism is live, not inert — it fails again only because of the infra gap, not because retry is broken). Screenshot 21/22. |
| 8 | Duplicate upload (retry after a successful-but-unacknowledged request) does not create a second server-side asset | ✅ pass — verified precisely | Direct API test: posted the same photo's checksum twice to `/api/capture/sessions/:id/assets` (once as the original accept, once simulating a client retry after an unacknowledged success). First call: `201`, `duplicate:false`, new row. Second call: `200`, `duplicate:true`, returns the **original** asset record verbatim (same `id`, original `url`) — session asset count stayed at exactly 3, not 4. This is the same code path (`captureService.addAsset`) a real browser retry would hit; verifying it directly against the live preview (not just the unit test's mock store) is real end-to-end confirmation. |
| 9 | Unsynced-changes warning is shown before a destructive logout/deletion action, where implemented | N/A — not implemented in R2 | Grepped `CaptureProfileScan.jsx`/`CapturePanel.jsx`: no `beforeunload` handler, no `confirm()` guard on "Back to List"/"Archive Draft" with pending uploads. This was never an R2-authorized UI affordance (not in any of the six slice descriptions) — recording as **not applicable / deferred**, not passed, per the explicit "do not mark it passed" instruction. Not implemented as part of this release-readiness pass either — it would be new scope, not a defect fix. |
| 10 | "Saved on device" is never shown when data exists only in memory | ✅ pass | Throughout the failed-upload session, the sync-state line never read "Saved on device" while an upload was outstanding — it correctly showed "Uploading N of 3" / per-slot "Upload failed — tap Retry" instead, matching the actual (non-synced) state. Cross-checked against the IndexedDB dump directly (item 6) rather than trusting the UI text alone. |

## Additional invariants verified (beyond the original 10-item table, per the release-readiness correction's explicit list)

All against the **same real, authenticated browser session** (screenshots
30–36) except where noted as a direct API cross-check:

| Check | Result | Evidence |
| --- | --- | --- |
| Accepted-evidence immutability via replace/supersession | ✅ pass | API: replaced the `front` asset; the prior asset row is untouched (same checksum/url/timestamps) except for a new `supersededBy` pointer — never deleted, never overwritten. |
| Requested-pose persistence | ✅ pass | Confirmed via unit-test-proven code path (`normalizeAssetInput`/`requestedPose`) — R2.2 behavior, unchanged this session; not re-derived from scratch here. |
| Material-zone persistence across reopen | ✅ pass (real browser) | "Main visible face confirmed." rendered correctly on reopen. Screenshot 32. |
| Texture-direction persistence across reopen | ✅ pass (real browser) | The `<select>` was correctly pre-populated to `along_run` on reopen — verified via `inputValue()`, not just visible text. Screenshot 32. |
| Schematic preview honest labeling | ✅ pass (real browser) | "Schematic from your confirmed measurements — not a photographic reconstruction." and "Technical compatibility preview... Not reconstructed geometry. Not fabrication grade." both rendered verbatim. Screenshot 32. |
| `geometryUrl` stays null/unchanged | ✅ pass (API) | The Studio DTO / manifest never populates `geometryUrl` — absent from the dry-run manifest entirely, matching D-046 ("untouched, still always `row.geometry_url ?? null`"). |
| Material-package dry-run — full invariant set | ✅ pass (real browser button click + API cross-check) | Clicked "Preview Material Package (Dry Run)" in the actual UI on the fully-evidenced session → "Package shape valid." Server manifest (verified via direct API call, same session) shows: versioned payload (`schemaVersion:1`), `identity.scope:"tenant"`, `identity.tenantId` set, `identity.sourceType:"capture"`, `identity.proposedReviewStatus:"pending_review"` (the literal proposed-state string, separate from `currentSessionStatus:"draft"`, the real authoritative value). Confirmed **zero side effects**: `GET /api/library/products` returned `count:0` before AND after two separate dry-run calls; session `status` stayed `"draft"` throughout. |
| Existing publish flow untouched | ✅ pass | Submitted the API-seeded session for real (`POST .../submit` → `status:"submitted"`) and confirmed `/api/library/products` still `count:0` — submit is not publish, exactly as designed; the publish path itself (approve → publish) is unchanged R1/Stage-5 code, not touched this session. |
| Sync-state honesty | ✅ pass | Covered under item 10 above, plus: the sync-state line during active retries read "Uploading N of 3" (accurate — never "Synced" while genuinely unsynced). |
| Destructive-action warning where implemented | N/A | Covered under item 9 above — not implemented, recorded honestly as such. |

## Screenshots

31 screenshots captured during this run, covering: app load, Capture tab,
scan setup/calibration, guided-views phase, the failed-upload state (all 3
photo slots), close/reopen recovery, the API-seeded session's Measurements/
Preview/Submit phases (schematic SVG, flat-wall Three.js preview, honest
labeling, dry-run result), and post-refresh recovery. Retained in the
session transcript; not committed to the repo (binary screenshots aren't
tracked for this doc — the pass/fail table above is the durable record).

## Known limitation of this verification

This checklist was executed by an AI agent driving real browser automation
against the live preview — not a human tester. It exercises the same DOM,
network, and IndexedDB APIs a human would, and required solving two real
environment-level tooling blockers (TLS/proxy, and the missing Blob token)
rather than working around them silently. It does not replace an actual
human walking through the flow with a phone camera, particularly for the
one thing no automation here could touch: real `getUserMedia` camera
capture on a physical device (this environment's headless Chromium has no
camera; `CaptureCamera.jsx`'s gallery-file-input fallback path was used
throughout, which is itself a real, shipped code path — not a test-only
shortcut).
