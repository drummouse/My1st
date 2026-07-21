# IronWrap Capture R2.4 — Claude Vision Privacy/Data-Flow Decision

Required before enabling the live Claude image-transfer path (R2 execution
authorization, binding correction #9). This note is the record of that
decision; it does not itself flip anything on — `CAPTURE_CLAUDE_GUIDANCE_ENABLED`
still defaults to `false` in every environment, and no live call happens
without an owner-provisioned `ANTHROPIC_API_KEY` regardless of this note.

## 1. Which image is sent

Only accepted (classification `source`, non-superseded) photos from the
current capture session's guided-view set. Draft/local-only photos never
leave the device before they've synced to the server (they can't — Claude
guidance only runs against server-confirmed session state).

## 2. Original or derived

**A derived image, not the original.** R2.2 already generates and stores an
on-device thumbnail (≤320px, JPEG) as a separate `derived` capture_asset
for every accepted source photo, specifically so a smaller, purpose-built
image already exists without inventing new infrastructure. Claude guidance
reuses that existing thumbnail asset. The original, full-resolution source
asset is never transmitted to Anthropic's API and is never touched by this
feature. If a given accepted photo has no thumbnail (thumbnail generation
is best-effort and can fail without blocking accept — see captureUpload.js),
that photo is simply excluded from the vision request rather than falling
back to the original; the guidance call proceeds with whatever thumbnails
are available, or is skipped entirely if none are.

## 3. Exact resolution/size policy

The existing thumbnail cap: **≤320px on the long edge**, JPEG quality 0.8
(`THUMBNAIL_MAX` in `captureUpload.js`, unchanged by this feature). This is
enough resolution to identify visible profile features (bends, seams,
ribs, hems, locks) and read a ruler's gross position, while keeping
request payload size and per-call cost bounded. It is explicitly **not**
claimed to be sufficient for precise measurement — Claude is never asked
to measure anything (§16 restriction), only to describe and recommend, so
higher resolution is not "genuinely necessary" per the required test in
this note. Reusing the existing thumbnail also means this feature adds
**zero new image-processing code and zero new dependencies** — the Vercel
Node serverless runtime has no built-in image decode/resize capability,
and pulling one in (Sharp, etc.) is exactly the kind of unapproved
dependency the R2 authorization requires stopping for; reusing an asset
that's already generated client-side avoids that question entirely.

## 4. Server-fetched and sent directly, or a temporary URL?

**Server-fetched and sent directly, base64-encoded in the request body.**
The server already holds the Blob URL for each accepted source asset's
thumbnail (it issued the finalize record). It fetches those bytes itself
(a plain `fetch` against the existing Blob URL — no processing, since the
thumbnail is already the right size), base64-encodes the result, and
includes it as an inline image content block in the Anthropic Messages API
request.

## 5. Is a temporary external URL ever generated?

**No.** No new URL — temporary, signed, or otherwise — is ever created or
exposed for this feature. This is a deliberate design choice, not an
oversight: IronWrap's existing Blob posture (D-016) is "public but
unguessable," which is an accepted risk for the existing thumbnail/review
flow, but this feature doesn't need to add to that surface at all. Sending
bytes directly means Claude's access to the image is scoped to exactly this
one API call and nothing is published anywhere.

## 6. Provider API destination

Anthropic's Messages API (`api.anthropic.com`), called directly via
server-side `fetch` — no third-party proxy, no intermediate storage.

## 7. Provider-retention assumptions

Per Anthropic's standard API terms, API inputs/outputs are not used to
train models and are retained only for a limited operational window (abuse
monitoring / trust & safety) unless a data-retention agreement states
otherwise for the account in use. This document does not assert a specific
retention period — the owner should confirm the retention terms attached to
whichever Anthropic account/API key is actually provisioned before treating
this as a compliance conclusion, not just an engineering one.

## 8. Tenant disclosure implications

Sending a tenant's captured photos to a third-party API is a genuine
disclosure that should be reflected in whatever privacy notice / terms
govern the tenant relationship. This is a product/legal decision, not an
engineering one — flagged here so it isn't silently missed, not resolved by
this document. The kill switch existing per-environment (not just a global
constant) means a specific deployment can stay off if that disclosure isn't
in place yet.

## 9. Audit metadata

Every guidance attempt — success, disabled, unavailable, timeout, or error
— is recorded as an immutable row in the new `capture_claude_analyses`
table: `session_id`, `owner_id`, `status`, `model`, `prompt_version`,
`schema_version`, `source_asset_ids` (which assets were analyzed — IDs
only, not the image bytes themselves), and a `diagnostic` jsonb field that
never contains the image, the raw API response, or any secret — only a
short, non-sensitive reason string plus timing.

## 10. Timeout behavior

8-second `AbortController` timeout on the Anthropic API call. On timeout,
the request is abandoned, a `timeout` row is recorded, and the service
returns a "deterministic guidance only" response — the caller (client) sees
no difference in kind from Claude being disabled, just a different
diagnostic reason.

## 11. Failure behavior

Any failure — network error, non-2xx response, malformed response, or a
response that fails `validateClaudeGuidanceResponse` — is caught, recorded
(`error` or `invalid` status with the stable error code, never a stack
trace or raw payload) and the same deterministic fallback is returned.
**Claude availability is never a mandatory-evidence requirement** — the
existing R1 deterministic evidence gate (calibration + guided views +
confirmed measurement) is completely unaffected by whether this feature is
enabled, reachable, or working.

## 12. Deletion and retention behavior

`capture_claude_analyses` rows follow the same lifecycle as every other
Capture evidence row — retained with the session, deleted only if the
session itself is deleted (there is no separate/independent retention
policy for this table in R2). No image bytes are ever stored in this table
— only asset ID references, which is consistent with the rest of Capture's
"URLs and metadata, never bytes" posture.

## 13. Is full-resolution evidence genuinely necessary?

**No — this is the core reason the answer to §2 is "derived."** Claude's
authorized role here is semantic description and shot recommendation, not
measurement or pixel-level analysis (§16 restriction: Claude must not be
authoritative for scale, coordinates, or geometry). A capped-resolution
JPEG is sufficient for "what feature is unclear" and "what shot would help"
— the same judgment a human reviewer could make from a decent-quality
photo, not from forensic-grade pixels.

## 14. Model configuration (release-readiness correction, 2026-07-20)

The Anthropic model identifier is **not hardcoded anywhere in the code**.
It is read exclusively from a third, independent, server-only environment
variable: `CAPTURE_CLAUDE_MODEL`.

**Required-value matrix, by state:**

| `CAPTURE_CLAUDE_GUIDANCE_ENABLED` | `ANTHROPIC_API_KEY` | `CAPTURE_CLAUDE_MODEL` | Result |
| --- | --- | --- | --- |
| not `'true'` | (any) | (any) | `disabled` — no network call, model is irrelevant and never checked |
| `'true'` | absent | (any) | `unavailable` — no network call |
| `'true'` | present | absent/empty | `configuration_error` — no network call, deterministic fallback preserved, workflow not blocked |
| `'true'` | present | a non-empty string | The call proceeds; that exact string is sent as `model` in the Anthropic Messages API request body, unmodified |

**Failure behavior:** a `configuration_error` outcome is recorded as an
immutable `capture_claude_analyses` row (`status: 'configuration_error'`,
`findings: null`, a short non-sensitive `diagnostic`), exactly like every
other non-`advisory` outcome (`disabled`, `unavailable`, `timeout`,
`error`, `invalid`, `no_images_available`). It is surfaced to the client as
an ordinary unsuccessful-guidance response — the deterministic evidence
gate (calibration + guided views + confirmed measurement) is completely
unaware this ever happened.

**Changing the model without a code deployment:** because the value is
read fresh from `process.env` on every call (never cached, never
compiled in), an operator changes which Anthropic model is used by editing
`CAPTURE_CLAUDE_MODEL` in the hosting platform's environment-variable
settings and redeploying (or, on platforms supporting live env-var
updates without a rebuild, immediately) — no source change, no new
release, no PR.

**Recommended value once the owner is ready to provision this:** at the
time of this decision, a current, valid Anthropic Messages API model
identifier is `claude-sonnet-5` (the latest generally-available Sonnet
tier, per Anthropic's own model-naming guidance to default to the latest
capable model for new integrations). This is a **documentation
recommendation only** — nothing in the code defaults to it, silently
substitutes it, or requires it. The owner may configure any valid
Anthropic Messages API model identifier for their account.

## Conclusion

The design above already follows the stated default recommendation in
full: original preserved and never sent, minimum-sufficient derived image
generated and sent, derivative never represented as the original, no new
public/temporary URL created, audit metadata recorded for every attempt
(including failures), timeout/failure paths that never block capture
completion. Model selection is now a pure, server-only, no-default
environment concern (§14), closing the "hardcoded model" release-readiness
finding.

**Decision: implementation may proceed** (kill switch off by default,
building the integration code and its tests is not itself "enabling" it).
**Going live in any real environment still requires**, separately from this
document: (a) the owner provisioning a real `ANTHROPIC_API_KEY` as an
environment secret (this session does not do that and cannot — no secrets
are committed), (b) the owner setting `CAPTURE_CLAUDE_MODEL` to a valid
Anthropic Messages API model identifier for that environment, and (c) the
owner explicitly setting `CAPTURE_CLAUDE_GUIDANCE_ENABLED=true` for that
environment, ideally after confirming §7/§8 (provider retention terms,
tenant disclosure) for that specific deployment. Recorded as decisions
D-043 and D-048 in `CAPTURE_DECISION_LOG.md`.
