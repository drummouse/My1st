# IronWrap Capture — Stage 0 Repository Audit and Architecture Plan

Status: Stage 0 discovery (no implementation yet)
Date: 2026-07-19
Branch: `claude/ironwrap-capture-stage-0-tnwem9` (cut from `claude/development` at `b99af82`)
Author: Claude (lead engineer, IronWrap Capture)

This document replaces assumptions with a verified architecture plan, per the
Capture master prompt's Stage 0. No packages were installed, no schema was
changed, and no production branch or production database was touched.

---

## 1. Verified baseline (run before any edits)

| Check | Result |
| --- | --- |
| `npm ci` | Clean install from `package-lock.json` |
| `npm test` (node:test) | 69/69 pass |
| `npm run build` (Vite + artifact bundle + snapshot template) | Succeeds |
| `npm run smoke` against the live `claude/development` preview (`ironwrap-estimator-git-claude-development-drummouses-projects.vercel.app`) | 12/12 pass: app shell, `/api/health` (Neon reachable), 401 guards on `/api/projects`, `/api/settings`, `/api/materials`, `/api/colors`, `/api/custom-services`, 4 SuperAdmin routes, and `/api/attachments` write |

## 2. Repository findings

- **App location**: the product lives in `configurator/` (repo root also holds
  `color-chart.html` and `.gpt-lab/`). Vite 5 + React 18.3, plain JSX, no
  TypeScript.
- **Routing**: no router library. The admin shell is a `NAV_SECTIONS` state
  toggle in `App.jsx` (Configurator / Settings / Discounts / Custom Services /
  Materials, plus capability-gated Platform/Library consoles). Customer entry
  points are query params (`?p=<id>`, legacy `?d=`) plus the exported HTML
  snapshot. Deep links are done by query param, not paths.
- **API**: Vercel serverless functions under `configurator/api/`, deliberately
  consolidated (Hobby-plan function-count cap): one file per resource with
  internal dispatch (`api/projects/index.js`, `api/superadmin/index.js`, …) and
  `vercel.json` rewrites mapping pretty URLs onto `?action=`/`?id=` queries.
  Current function count: 10 (health, upload, auth, attachments, colors,
  custom-services, materials, projects, settings, superadmin).
- **Auth**: email+password (`bcryptjs`), stateless JWT session (`jose`, HS256)
  in an httpOnly `ironwrap_session` cookie with `session_version`
  invalidation. Guards: `requireActiveUser` (401/403 with account-status
  checks) and `requireCapability` (role → capability map in
  `api/_lib/superadminPolicy.js`). Roles: `owner`, `reseller`, `superadmin`.
- **Tenancy**: one signed-up user = one tenant (`owner_id` on every tenant
  table). No organization/company/branch/multi-seat model exists. Reseller
  row-scoping (`reseller_id = actor.id`) is the established pattern for
  scoped queries.
- **Database**: Neon Postgres via `@neondatabase/serverless` HTTP driver.
  No migration tool: schema is bootstrapped at runtime by an idempotent
  `ensureSchema()` in `api/_lib/db.js` (additive `create table if not exists`
  / `alter table add column if not exists`), mirrored in `db/schema.sql`, with
  parity asserted by tests. **Environment separation is real and verified**:
  the Vercel↔Neon integration creates one Neon branch per git branch
  (`preview/claude/development` = `br-withered-fog-ad8qehb2`), isolated from
  production `main` (`br-old-dew-adk3nsa4`). Merged DDL auto-applies only to
  the preview's own copy.
- **Library Core already exists** (`library_records` + product/profile/color
  detail tables, relationships, documents, import/export, tenant migration):
  review lifecycle (`draft` → `pending_review` → `approved`/`rejected`),
  quality levels, `source_type` already includes `'capture'`, integer
  `version` with optimistic concurrency, audit into
  `superadmin_audit_events`. It is only reachable through `/api/superadmin`
  behind `catalog.*` capabilities (superadmin, partially reseller). **Owners
  have zero capabilities — there is no contributor-facing Library surface.**
- **Storage**: Vercel Blob with client-side direct upload. `api/upload.js` is
  the single token-issuing route with per-kind content-type/size caps
  (`logo` 5 MB, `photo` 15 MB, `file` 25 MB). Neon stores URLs + metadata
  only (`attachments` table). Blob URLs are public-but-unguessable
  (`addRandomSuffix`), not signed-per-read.
- **Tests**: `node --test tests/*.test.mjs`. Two established styles:
  (a) pure unit tests of policy/service modules against in-memory stores
  (`libraryService.test.mjs`), (b) source-contract tests that read source
  files and assert guard ordering, capability maps, rewrite rules, and
  runtime-vs-reference schema parity. No component tests, no E2E, no
  Playwright, no MSW.
- **Smoke**: `scripts/smoke-test.mjs` against `SMOKE_BASE_URL` (+ optional
  `VERCEL_AUTOMATION_BYPASS_SECRET`), covering shell, health/Neon, and 401
  guards. CI (`.github/workflows/gpt-lab-smoke.yml`) runs build + live smoke
  for the GPT lab branch.
- **PWA**: already installed and configured — `vite-plugin-pwa` (autoUpdate,
  manifest, workbox 6 MB cache cap), 60-second update polling in `main.jsx`.
- **Three.js** 0.169 with a working texture pipeline (photo swatches tiled as
  material maps in `src/data/textures/`, live recoloring in `Viewer3D.jsx`).
- **Mobile**: viewport meta with `viewport-fit=cover`; components already
  adapt by pointer type (`ColorPickerButton` bottom-sheet drawer on coarse
  pointers, `AssemblyAdjustment` tap steppers). No dedicated mobile routes.
- **Docs**: `docs/superpowers/specs|plans`, `docs/milestones`,
  `PROJECT_ARTIFACTS.md` register, `TECH_DEBT_AND_BUG_REGISTER.md`,
  `CAPTURE_LIBRARY_HANDOFF.md` (an existing Capture→Library submission
  contract: tenant scope, `pending_review`, `sourceType: capture`, versioned
  `metadata.scanner` namespace with `captureConfidence`). There was **no
  decision-log file**; `docs/CAPTURE_DECISION_LOG.md` is created with this
  audit. No `00 - Project Vision` document exists in the repository — recorded
  as absent, not invented.
- **Branches**: this clone sees `claude/development` (tip `b99af82`) and the
  working branch. `integration/release-candidate` does not exist yet on the
  remote refs visible here; Vercel history confirms `main`,
  `chatgpt/configurator-gpt-lab`, `chatgpt/library-core`, and
  `chatgpt/ui-foundation-design` (a Studio UI foundation effort on PR #17 —
  Capture must not collide with it in `App.jsx`).
- **July 5 single-file Configurator backup**: not present in this repository
  and not used as an architecture source (rule honored).

## 3. Reusable existing systems

| Need | Existing system to reuse |
| --- | --- |
| AuthN + session | `api/_lib/auth.js` cookie JWT, `requireActiveUser` |
| AuthZ | `requireCapability` + `ROLE_CAPABILITIES` (extend additively with `capture.*`) |
| Tenant scoping | `owner_id` columns + reseller-style row scoping in SQL |
| Review lifecycle + publication target | Library Core (`library_records`, `review_status`, `quality_level`, `source_type='capture'`, versioning, `metadata.scanner` namespace) |
| Audit | `superadmin_audit_events` (already used generically by Library Core) |
| Uploads | `api/upload.js` Blob direct-upload with a new `capture` kind |
| Schema evolution | `ensureSchema()` additive DDL + `db/schema.sql` mirror + parity tests |
| API shape | Consolidated serverless function + `vercel.json` rewrites |
| UI shell | `NAV_SECTIONS` tab + panel component pattern, existing design tokens in `index.css` |
| Client API calls | Thin fetch-wrapper module pattern (`libraryClient.js`, `superadminClient.js`) |
| Offline/installability | Existing `vite-plugin-pwa` setup |
| Tests/smoke | node:test conventions + `scripts/smoke-test.mjs` extension |

## 4. Missing foundations (must be added)

1. Contributor-facing capture domain: `capture_sessions`, `capture_assets`,
   `capture_fields` tables and an owner-accessible `/api/capture` function.
2. `capture.*` capabilities for `owner` (currently `owner: []`).
3. A Capture state machine module (pure, tested — same idiom as
   `libraryPolicy.js`).
4. Idempotent draft create/update (`client_ref` key) for retry/resume safety.
5. A review surface usable by the tenant itself (single-seat reality) and
   SuperAdmin; publication path from an approved capture into a
   `library_records` row + version.
6. Capture UI (mobile-first panel + guided flow) inside the existing shell.
7. Smoke checks and tests for all of the above.

## 5. Plugin / dependency decision table

Installed today: `react`, `react-dom`, `three`, `@neondatabase/serverless`,
`@vercel/blob`, `jose`, `bcryptjs`, `jspdf`, `qrcode`; dev: `vite`,
`@vitejs/plugin-react`, `vite-plugin-pwa`.

| Candidate | Decision | Reason |
| --- | --- | --- |
| React Hook Form | **Defer** | Existing panels use controlled inputs; step-per-screen capture keeps forms small. Re-evaluate at Stage 3 if field-state wiring grows painful. |
| Zod | **Defer** | Repo has an established shared hand-rolled validation idiom (`libraryPolicy.js` normalize + typed error codes) used client+server. A second validation idiom adds drift risk without new capability. |
| TanStack Query | **Defer** | Thin fetch clients are the convention; MVP has few queries. Offline queue is a separate concern (IndexedDB), not a cache library. |
| Camera wrapper libs | **Reject** | Native `getUserMedia` + `<input type="file" accept="image/*" capture="environment">` fallback covers MVP; required fallbacks are UI states, not a library. |
| react-dropzone | **Defer** | Native file input suffices for MVP; desktop drag-drop is a Stage 4+ nicety. |
| react-easy-crop | **Defer** | Cropping/derived assets arrive with color/texture stages (8–9); canvas-based region sampling may suffice. |
| Uppy / tus | **Reject (MVP)** | Vercel Blob's direct-upload flow already provides signed direct upload with server-enforced type/size; it does not speak tus. Files are ≤15 MB; retry is a small explicit queue, not an orchestration framework. |
| Dexie (IndexedDB) | **Defer to Stage 6** | Stages 1–3 persist drafts server-side with idempotency; a hand-rolled ~100-line IndexedDB helper for queued blobs is planned first, Dexie only if it outgrows that. |
| vite-plugin-pwa / Workbox | **Reuse (installed)** | Already configured with autoUpdate; Stage 6 extends caching strategy, no new plugin. |
| @zxing/browser | **Defer to Stage 7** | Barcode is post-MVP; manual entry is mandatory anyway. |
| OpenCV.js | **Defer (Stages 9–10)** | Quality checks in MVP are cheap canvas heuristics (resolution/blur estimate). |
| Sharp (server) | **Defer** | MVP thumbnails are client-generated canvas derivatives stored as separate Blob objects; server derivatives revisit at Stage 9 with Vercel function constraints in mind. |
| TanStack Table | **Defer** | Review queue volumes are small; existing panel/table markup is accessible enough for MVP. Re-evaluate at Stage 4 exit. |
| Playwright | **Defer** | Nothing exists today; node:test + live smoke is the enforced convention. Re-evaluate at Stage 6 (offline/camera flows) where its mocks would earn their cost. |
| MSW | **Reject** | Services are tested against in-memory stores; no fetch-mocking layer needed. |

**Stage 1 installs zero new dependencies.**

## 6. Capture state machine (server-side, per `capture_sessions.status`)

States: `draft`, `submitted`, `in_review`, `changes_requested`, `approved`,
`publishing`, `published`, `rejected`, `archived`.

Client-side sync states from the spec (`locally_queued`, `syncing`,
`ready_to_submit`) are **client/offline-layer concerns**, not database
statuses; they arrive with Stages 2/6 UI and never round-trip to Neon.
`resubmitted` is modeled as a transition (`changes_requested → submitted`
with a `resubmission: true` audit flag), not a distinct state — fewer states,
same audit trail.

| Transition | Actor | Validation | Side effects |
| --- | --- | --- | --- |
| create → `draft` | contributor (owner) | category valid; `client_ref` idempotency | audit `capture.session.created` |
| `draft` → `draft` (update) | contributor | field/asset validation | audit only on meaningful change |
| `draft` → `submitted` | contributor | completeness validation passes | immutable submission snapshot; audit `capture.session.submitted` |
| `submitted` → `in_review` | reviewer | reviewer authorization | audit `capture.review.started` |
| `in_review` → `changes_requested` | reviewer | reason required | audit; contributor notified state |
| `changes_requested` → `submitted` | contributor | completeness passes | new snapshot; audit flagged resubmission |
| `in_review` → `approved` | reviewer | reviewer ≠ forbidden; edits audited | audit `capture.review.approved` |
| `in_review` → `rejected` | reviewer | reason required | audit `capture.review.rejected` |
| `approved` → `publishing` → `published` | reviewer/system | Library write succeeds | creates/links `library_records` row (tenant scope, `source_type='capture'`, `review_status='approved'`); stores `published_record_id` + version; audit `capture.session.published` |
| `publishing` → `publishing` (retry) | reviewer/system | idempotent by session id | safe retry without re-review |
| `draft`/`rejected`/`published` → `archived` | contributor (own) / superadmin | reason for non-draft | audit `capture.session.archived` |

Publication is separate from approval so a failed Library write retries
without re-reviewing (spec requirement). Published Library records are never
overwritten by a new capture — a new capture of the same product produces a
new record/version through review.

## 7. Permission matrix (mapped onto existing roles — no duplicate role system)

Because tenancy is single-seat (one login = one company), "contributor" and
"reviewer" are capabilities of the same `owner` account in MVP, scoped to the
owner's own tenant. True contributor/reviewer separation arrives if/when
multi-seat accounts exist; the capability names are chosen so that split is
additive.

New capabilities (additive to `ROLE_CAPABILITIES`):

| Capability | owner | reseller | superadmin |
| --- | --- | --- | --- |
| `capture.create` (create/edit/submit own drafts) | ✅ (own tenant) | ❌ | ✅ |
| `capture.review` (review/approve/reject/request changes) | ✅ (own tenant only) | ❌ | ✅ (all tenants) |
| `capture.publish.tenant` (publish approved → tenant-private Library) | ✅ (own tenant) | ❌ | ✅ |
| `catalog.publish` (global publication) | ❌ | ❌ | ✅ (existing) |
| View platform-wide capture queue | ❌ | ❌ | ✅ |

Row-level scoping (`owner_id = actor.id` unless superadmin) is enforced in
SQL exactly like the reseller pattern in `api/superadmin/index.js` — never by
client-side filtering. Visibility values in MVP: draft/private-to-author,
tenant-private (published), archived. Branch/selected-org/manufacturer-global
visibility levels are deferred until the tenancy model can express them.

## 8. Additive database proposal (rollback-safe, additive-only)

Applied through `ensureSchema()` + `db/schema.sql` mirror + a
`captureSchema.test.mjs` parity test, matching the existing convention. No
existing table or column is altered or dropped. Rollback = stop using the new
tables (consistent with this codebase's "no destructive migrations" rule).

```sql
create table if not exists capture_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id),
  client_ref text,                     -- idempotency key from the client
  capture_type text not null default 'guided_product',
  category text,
  title text,
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','changes_requested',
                      'approved','publishing','published','rejected','archived')),
  current_step text,
  completeness integer not null default 0,
  submitted_snapshot jsonb,            -- immutable copy at submit time
  published_record_id uuid references library_records(id),
  published_version integer,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists capture_sessions_owner_client_ref_key
  on capture_sessions (owner_id, client_ref) where client_ref is not null;
create index if not exists capture_sessions_owner_status_idx
  on capture_sessions (owner_id, status);

create table if not exists capture_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  owner_id uuid not null references users(id),
  purpose text not null check (purpose in ('main','front','back','edge','surface',
    'label','packaging','profile','installed','other')),
  classification text not null default 'source' check (classification in ('source','derived')),
  source_asset_id uuid references capture_assets(id),
  url text not null,                   -- Blob URL; never image bytes/Base64
  checksum text,
  mime_type text,
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  capture_metadata jsonb not null default '{}'::jsonb,
  upload_status text not null default 'complete'
    check (upload_status in ('pending','complete','failed')),
  created_at timestamptz not null default now()
);
create index if not exists capture_assets_session_id_idx on capture_assets (session_id);

create table if not exists capture_fields (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  field_key text not null,
  value jsonb,
  source text not null default 'manual'
    check (source in ('manual','barcode','ocr','ai','imported','reviewer')),
  confidence numeric,
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  source_asset_id uuid references capture_assets(id),
  updated_at timestamptz not null default now(),
  unique (session_id, field_key)
);

create table if not exists capture_review_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references capture_sessions(id) on delete cascade,
  author_id uuid not null references users(id),
  body text not null,
  created_at timestamptz not null default now()
);
```

Deliberate reuse instead of new tables:

- **Audit**: `superadmin_audit_events` (Library Core already writes generic
  `library.*` actions there; Capture writes `capture.*`). The misleading
  table name is recorded as accepted naming debt in the decision log.
- **Measurements**: stored as typed JSON in `capture_fields`
  (`field_key='dimensions'`, value carries unit/method/confidence) for MVP; a
  dedicated `capture_measurements` table is deferred until profile/AR stages
  need per-measurement provenance rows.
- **Processing jobs** (`processing_jobs`/`quality_checks`): deferred until
  Stage 7+ introduces machine assistance; MVP quality checks are synchronous
  client-side heuristics stored in `capture_metadata`.
- **Publication/versioning**: `library_records` + detail tables + existing
  integer `version`; no parallel product tables.

## 9. Upload and object-storage design

1. Client asks `api/upload.js` for a token with `kind: 'capture'`
   (new LIMITS entry: PNG/JPEG/WebP/HEIC/HEIF, 15 MB) — same server-enforced
   constraint pattern as existing kinds; `tokenPayload` carries
   `{ userId, kind, sessionId, purpose }`.
2. Browser uploads the original directly to Vercel Blob (bypasses function
   body limits, same as logo/attachments today).
3. Client finalizes via `POST /api/capture` asset action with URL, checksum
   (client-computed SHA-256), dimensions, purpose; server validates session
   ownership + status and records the `capture_assets` row.
4. Originals are immutable; retake/delete allowed only before submit.
   Thumbnails/crops are separate `classification='derived'` rows pointing at
   `source_asset_id` — never replacements.
5. Neon stores URLs and metadata only. No Base64, ever.
6. Read access: Blob URLs are public-but-unguessable (`addRandomSuffix`) —
   identical to the existing attachments/logo exposure. This does **not**
   meet "private images cannot be accessed without authorization" in the
   strictest sense; recorded as an explicit Stage 2 risk with two candidate
   remedies (authenticated read-proxy function, or storage-provider signed
   reads if/when adopted). Decision deferred to Stage 2 with the default
   being an authenticated proxy only if the client accepts the extra
   function + bandwidth cost.
7. Malware posture: images only, strict content types, size caps, never
   executed/served inline with content-sniffing disabled downstream.

## 10. API route and screen map

One new consolidated serverless function `api/capture/index.js` (total
functions: 11 of 12 allowed on Hobby), dispatched by `?action=` with
`vercel.json` rewrites, matching repo convention:

| Route (rewritten) | Action | Guard |
| --- | --- | --- |
| `GET/POST /api/capture/sessions` | list / idempotent create | `capture.create` |
| `GET/PATCH /api/capture/sessions/:id` | read / draft update / archive | `capture.create` + row scope |
| `POST /api/capture/sessions/:id/assets` | finalize upload metadata | `capture.create` + row scope |
| `POST /api/capture/sessions/:id/submit` | validate + snapshot + transition | `capture.create` + row scope |
| `GET /api/capture/review` | review queue | `capture.review` (+ scope) |
| `POST /api/capture/review/:id/decision` | approve / request changes / reject | `capture.review` |
| `POST /api/capture/review/:id/publish` | publish approved → Library (retryable) | `capture.publish.tenant` |

All writes: server-side validation (shared `capturePolicy.js`), SameSite=Lax
cookie session (existing CSRF posture), idempotency where retried, audit on
every transition. Studio's read of published records continues through
existing Library queries; the Library→Studio DTO contract (stable record id +
immutable version pinned into project `design` JSONB at selection time) is a
Stage 5 deliverable.

Screens (inside the existing shell, mobile-first CSS; no second visual
system):

- **Capture tab** (new `NAV_SECTIONS` entry): dashboard = draft/submission
  list with status chips + "New Capture".
- Guided capture wizard (step shell): category → photos (main/surface/label)
  → identity/details → dimensions → color sample → review summary → submit.
- Submission status + changes-requested view.
- **Review** (desktop-leaning, same tab, gated section): queue → detail
  (images beside metadata) → comment / approve / request changes / reject →
  publish result.
- Deep link to resume a draft via query param (e.g. `?capture=<id>`),
  matching the `?p=` convention.

## 11. First vertical slice (Stage 1)

**Goal**: an authorized contributor creates, edits, closes, and resumes a
draft capture; everything guarded, audited, idempotent, and smoke-covered.
No camera, no uploads, no review UI yet.

Acceptance criteria:

1. Unauthenticated `GET/POST /api/capture/sessions` → 401 (and covered by
   `npm run smoke`).
2. Owner A cannot read/update/archive owner B's session (404, reseller-style
   row scoping) — proven by unit tests of the service with an in-memory
   store.
3. `POST` create with the same `(owner, client_ref)` twice returns the same
   session (idempotent, no duplicate).
4. Draft update persists category/title/fields; `updated_at` moves; audit
   events recorded for create/archive.
5. Invalid state transitions rejected by `capturePolicy` with typed error
   codes (unit-tested exhaustively).
6. Capture tab renders in the shell; create → close app → reopen → resume
   works against the preview.
7. Existing 69 tests, build, and all current smoke checks still pass;
   `/api/health` untouched.

Exact files:

- `configurator/api/_lib/capturePolicy.js` (new — states, transitions, validation)
- `configurator/api/_lib/captureService.js` (new — service + Neon store, Library-Core idiom)
- `configurator/api/capture/index.js` (new consolidated function)
- `configurator/api/_lib/superadminPolicy.js` (add `capture.*` capabilities)
- `configurator/api/_lib/db.js` + `configurator/db/schema.sql` (additive tables)
- `configurator/vercel.json` (capture rewrites)
- `configurator/src/components/CapturePanel.jsx` (new), `configurator/src/lib/captureClient.js` (new)
- `configurator/src/App.jsx` (nav entry only — minimal diff; `chatgpt/ui-foundation-design` touches this file too, so keep the change surgical)
- `configurator/scripts/smoke-test.mjs` (+ `/api/capture/sessions` 401 checks)
- `configurator/tests/capturePolicy.test.mjs`, `captureService.test.mjs`, `captureRoutes.test.mjs`, `captureSchema.test.mjs` (new)
- `configurator/docs/CAPTURE_DECISION_LOG.md`, `configurator/docs/PROJECT_ARTIFACTS.md` (docs)

## 12. Test and smoke-suite changes (across MVP stages)

- Smoke additions: Stage 1 — unauthenticated capture 401s; Stage 2 — upload
  finalize guard; Stage 4 — review-route guards; Stage 5 — published-record
  read guard. The suite is only ever extended, never weakened.
- Unit: state machine (every allowed/forbidden transition + actor),
  completeness validation, idempotency, tenant scoping, audit emission,
  publish idempotency/retry, version pinning (Stage 5).
- Contract tests: capability map entries, guard-before-dispatch ordering in
  `api/capture/index.js`, rewrite rules, runtime-vs-reference schema parity.
- Fixtures (per spec, introduced as stages need them): roof panel, siding
  plank, gutter, downspout, soffit, fascia, trim, solid color, wrinkle,
  woodgrain, label, duplicate, incomplete capture, private tenant record.

## 13. Risks and assumptions

| # | Risk / assumption | Handling |
| --- | --- | --- |
| 1 | Blob URLs are public-unguessable, not authorization-checked reads | Explicit Stage 2 decision point; matches existing attachments exposure today; candidate remedy is an authenticated read-proxy (costs one function slot + bandwidth) |
| 2 | Runtime `ensureSchema()` is the only migration mechanism | Verified per-branch Neon isolation makes preview-safe; keep DDL strictly additive; production applies on first request after a `main` deploy — flagged for release-gate review at Stage 12 |
| 3 | Single-seat tenancy: contributor and reviewer are the same person in MVP | Accepted; capability names chosen so a future multi-seat split is additive; self-review is honest for company-private publication only — global publication still requires superadmin |
| 4 | Vercel Hobby 12-function cap; Capture takes slot 11 | All capture+review actions stay in one consolidated function; adding a read-proxy later would take slot 12 |
| 5 | `App.jsx` (994 lines) is contended — `chatgpt/ui-foundation-design` (PR #17) also edits the shell | Capture UI kept in its own components; `App.jsx` diff limited to a nav entry |
| 6 | `superadmin_audit_events` is the de-facto platform audit table despite its name | Reused (Library Core precedent); renaming deferred as recorded debt |
| 7 | No URL router; resume links use query params | Follow `?p=` precedent; revisit only if a router lands via the Studio UI effort |
| 8 | Phone color capture is approximate | UI copy + stored capture conditions + warning flag from day one (Stage 3/8) |
| 9 | `integration/release-candidate` branch not visible on this clone's remote | Merges beyond `claude/development` are the user's release step; nothing here targets `main` |
| 10 | Legacy product/color migration into Library | Explicitly not a Capture MVP blocker (spec); import script exists for tenant materials/colors already |

## 14. Blocking questions

None. Every question that mattered for Stage 1 (framework, auth, tenancy,
Neon environment separation, storage, function-count headroom, test/smoke
conventions) was answered from the repository, the Vercel project, and the
Neon project directly. Non-blocking decisions are recorded with defaults in
the decision log and can be overridden before their stage begins.
