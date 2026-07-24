# IronWrap Platform — Session Briefing

The application lives in `configurator/` (Vite + React 18, Vercel serverless
API, Neon Postgres, Vercel Blob). This file is loaded automatically at
session start; follow it before doing anything else.

## Branch discipline (non-negotiable)

- `main` is **production only**. Never commit to it, never push to it, never
  open a PR against it. Promotion to `main` is a human release step.
- All development starts from **`claude/development`** and returns to it via
  a draft PR from your session's working branch.
- `chatgpt/*` branches belong to a parallel effort — do not modify them.

## Before changing anything

Read, in order:
1. `configurator/docs/superpowers/specs/2026-07-20-scanner-ux-revision-impact.md` — current Scanner plan and remaining slices.
2. `configurator/docs/CAPTURE_DECISION_LOG.md` — binding decisions (D-001…D-036). Do not re-litigate them; add new entries instead.
3. `configurator/docs/CAPTURE_STUDIO_CONTRACT.md` and the latest `configurator/docs/milestones/*`.

The Google Drive doc `Claude_prompt_UX_Design` (folder
`04 - Scanner & Material Library`) is the Scanner UX source of truth.

Then run the baseline from `configurator/` and confirm it is green before
editing: `npm ci`, `npm test`, `npm run build`, and
`SMOKE_BASE_URL=https://ironwrap-estimator-git-claude-development-drummouses-projects.vercel.app npm run smoke`.

## Engineering rules

- **Scope**: implement only the slice the user explicitly authorized in this
  session. Nothing speculative.
- **Schema**: additive or widen-in-place only, applied via `ensureSchema()`
  in `configurator/api/_lib/db.js` AND mirrored in `configurator/db/schema.sql`
  (parity tests enforce this). Runtime bootstrap means merged DDL applies to
  the per-branch Neon preview automatically; production Neon is only reached
  by a `main` deploy. Never run migrations against production.
- **Dependencies**: zero new packages unless first justified in the decision
  log's plugin table.
- **Function cap**: Vercel Hobby allows 12 serverless functions; the repo
  uses 11. Warn the user BEFORE any change would claim slot 12 — new API
  surface goes inside existing consolidated functions (`?action=` dispatch +
  `vercel.json` rewrites).
- **Idioms**: pure policy/evidence modules shared verbatim by client and
  server; capability map + `requireCapability` before dispatch; tenant
  row-scoping in SQL (cross-tenant reads as not-found); audited state-machine
  transitions; contract tests that read source files; no image bytes/Base64
  in Neon (Blob URLs + metadata only); originals immutable, derivatives
  reference their source.
- **Verification**: extend `npm run smoke`, never weaken it. After pushing,
  wait for the Vercel preview, run the smoke suite against it live, and
  record a milestone doc in `configurator/docs/milestones/` plus decision-log
  entries before claiming completion. Do not claim a deployment verified
  while it is still building.
