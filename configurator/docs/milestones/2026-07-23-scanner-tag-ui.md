# Scanner Tag UI — Live Browser Verification

Date: 2026-07-23
Branch: `claude/scanner-tag-ui` (PR #30 → `claude/development`, draft)
Head verified: `3e4b383646e6f6f4c2c38895a5edec16e3811d79`
Authorization: "do both" — (1) merge PR #29, (2) start the next-smallest Scanner
slice, identified as making PR #25's flexible-tags schema + CRUD (shipped
UI-less, D-053–D-056) actually usable in the guided-product editor.

## Scope delivered

- `CapturePanel.jsx` gains an item-type `<select>` (all `ITEM_TYPES` plus a
  "Not classified" default) and a new `TagPicker` component, both wired into
  the existing draft-patch round trip. `itemType`/`tags` are sent as
  top-level keys in the PATCH body, matching `normalizeDraftPatch`'s
  contract exactly (siblings of `fields`, never nested inside it).
- `TagPicker` fetches the tenant's tag vocabulary on mount
  (`captureApi.listTags()`), lets the user add/remove tags on the session
  (chips + text input + Enter, with vocabulary suggestions), and
  best-effort registers newly-typed tags into the vocabulary
  (`captureApi.createTag`) — non-blocking and wrapped in try/catch, since a
  session's own tags are never validated against the vocabulary at write
  time (D-055). Adding a tag to the session always succeeds even if
  vocabulary registration fails.
- Zero backend changes — `toCaptureSession`/`toCaptureTag` and the tag CRUD
  routes already existed from PR #25. Zero new dependencies. Zero new
  function slots (still 11 of 12).

## Automated verification

| Check | Result |
| --- | --- |
| `npm test` | 312/312 pass (6 new tests in `captureTagUI.test.mjs`, source-text-assertion style matching this repo's `.jsx` test convention — no jsdom/testing-library in this codebase) |
| `npm run build` | Succeeds |
| `git diff --check` | Clean |
| `npm run smoke` against the live PR preview (`ironwrap-estimator-git-claude-scanne-a42d38-drummouses-projects.vercel.app`, READY, `dpl_s8EMfV1D6zBW7LwvsGZXwQW8asv8`) | 32/32 pass |
| Vercel deployment checks on the PR | `ironwrap-estimator` READY; `ironwrap-configurator-gpt-lab` FAILED — separate Codex/GPT-lane project, explicitly out of scope, not investigated |

## Live browser verification (2026-07-23)

Local `npm run dev` has no working backend in this sandbox — Vercel
serverless functions under `/api/*` need a real Neon connection string that
isn't available locally. Genuine UI verification was instead run with
Playwright (pre-installed Chromium) against the live preview deployment,
which has real backend + Neon wiring, as the rigorous equivalent of "start
the dev server and use the feature in a browser."

Authenticated as a real tenant user (`info@iroofalberta.ca`), against a real
Quick-capture session on the preview's Neon branch:

| Step | Result |
| --- | --- |
| Item-type `<select>` and Tags picker render in the editor | Present |
| Select `commercial_product` as item type | Selected value confirmed |
| Add a brand-new tag via the text input + Enter | Chip `playwright smoke tag` appears immediately |
| Save Draft | "Draft saved." status shown |
| Reload the page, reopen the same session | Item type persisted as `commercial_product`; tag chip persisted |
| Remove the tag via its chip button, Save Draft | Chip disappears immediately |
| Reload the page, reopen the same session | Tag removal persisted — chip does not reappear |
| Console/page errors throughout | None |

All 8 steps passed. No real SMS/email was sent; no schema, historical rows,
`main`, or the Codex/GPT lane were touched.

### Environment note (not part of this slice)

Getting Playwright's Chromium to reach the live preview through this
sandbox's outbound proxy required launching with `--ssl-version-max=tls1.2`
(plus disabling TLS 1.3 early data and the post-quantum hybrid key share).
Without that flag, the TLS handshake was reset (`net::ERR_CONNECTION_RESET`,
`SOCKET_READ_ERROR os_error 104`) — the intercepting proxy's TLS stack does
not tolerate Chromium's default TLS 1.3 ClientHello (oversized by the
post-quantum key share). `curl` through the same proxy was unaffected. This
is a local test-tooling detail, not a product defect, and does not affect
end users.

## Honest gaps

- No dedicated Playwright/E2E infra was added to the repo — this was a
  one-off verification script run from the sandbox scratchpad, not a
  checked-in test. The repo's `.jsx` test convention (source-text assertion,
  no jsdom) is unchanged and remains the checked-in coverage.
- Only a single tenant/session was exercised live; the unit suite's
  service-layer tests (already shipped with PR #25) cover
  idempotent-create/tenant-isolation/max-count edge cases.
- PR #30 remains **draft** — no merge instruction has been given for it.
