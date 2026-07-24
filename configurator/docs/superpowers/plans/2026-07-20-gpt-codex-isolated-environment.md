# GPT/Codex Isolated Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an independent GitHub, Vercel, Neon, and Blob development lane for GPT/Codex without changing Claude's environment or interrupting active PR #17.

**Architecture:** GPT/Codex uses `chatgpt/configurator-gpt-lab`, Vercel project `ironwrap-configurator-gpt-lab`, and a new separate Neon project named `ironwrap-configurator-gpt-lab`. Claude remains on `claude/*`, Vercel `ironwrap-estimator`, and Neon `neon-chestnut-jacket`. Preparation is parallel; final Vercel database cutover waits until PR #17 is complete and verified.

**Tech Stack:** GitHub branches and PRs, Vercel Preview/Development environments, Neon Postgres 17, Vercel Blob, Vite/React application under `configurator/`.

## Global Constraints

- Never modify or delete Claude Vercel, Neon, Git, or secret resources.
- Never repoint the GPT Vercel database while PR #17 is active.
- Never copy production customer data without explicit owner approval.
- Never commit secrets.
- Preserve the old GPT connection until the independent setup passes acceptance and rollback checks.
- `main` remains production-only.

---

### Task 1: Preserve the active Codex baseline

**Interfaces:**
- Consumes: PR #17 head commit and `chatgpt/ui-foundation-design`.
- Produces: persistent branch `chatgpt/configurator-gpt-lab` containing the current PR #17 state.

- [x] Verify PR #17 remains open and draft.
- [x] Record PR #17 head: `65308b533cb1cb4c5733a4e9b4abf000bf18303b`.
- [x] Fast-forward `chatgpt/configurator-gpt-lab` to the PR #17 head without touching PR #17.
- [x] Confirm Vercel starts a Preview build for the persistent GPT branch.

### Task 2: Add GPT/Codex operating instructions

**Files:**
- Create: `AGENTS.md`

**Interfaces:**
- Consumes: branch, Vercel, and Neon isolation policy.
- Produces: auto-readable GPT/Codex session briefing.

- [x] Add branch discipline.
- [x] Add Vercel and Neon isolation rules.
- [x] Add PR #17 migration freeze.
- [x] Add verification and rollback requirements.

### Task 3: Provision the independent Neon project

**Interfaces:**
- Consumes: Neon organization access and project quota.
- Produces: separate Neon project `ironwrap-configurator-gpt-lab` with its own primary branch and credentials.

- [x] Attempt project creation through the Neon connector.
- [x] Confirm connector creation is blocked by the current Neon/Vercel organization or project quota (`404`; billing/project-limit link returned).
- [ ] Owner provisions an additional Neon project slot or creates the project through the Vercel Storage/Marketplace integration.
- [ ] Record the new Neon project ID, primary branch ID, database name, role, region, and connection host without exposing passwords.
- [ ] Confirm the project is not `sparkling-dawn-12192874` / `neon-chestnut-jacket`.

### Task 4: Bootstrap schema in the new GPT Neon project

**Interfaces:**
- Consumes: new GPT Neon connection and repository schema bootstrap.
- Produces: schema-compatible, isolated GPT database with safe test data only.

- [ ] Point a temporary non-active validation deployment or local environment at the new Neon project.
- [ ] Run the existing `ensureSchema()` bootstrap through the application.
- [ ] Compare `configurator/db/schema.sql` with the created database.
- [ ] Run database health and schema parity tests.
- [ ] Add only approved test accounts and seed records.
- [ ] Do not copy production customer/project data.

### Task 5: Prepare Vercel GPT project isolation

**Interfaces:**
- Consumes: `ironwrap-configurator-gpt-lab` Vercel project and new Neon credentials.
- Produces: documented environment-variable replacement set, not yet activated.

- [x] Confirm Vercel project ID: `prj_cZqQnIjXkmLJcNBTwQknks9fxvsW`.
- [x] Confirm the project deploys `chatgpt/configurator-gpt-lab`.
- [x] Confirm a branch deployment was triggered from commit `65308b533cb1cb4c5733a4e9b4abf000bf18303b`.
- [ ] Inventory the current GPT Preview/Development environment variable names without exposing values.
- [ ] Prepare replacement values for the new Neon project.
- [ ] Confirm GPT Blob storage is independent and `BLOB_READ_WRITE_TOKEN` is present for Preview/Development.
- [ ] Do not replace database variables until PR #17 passes the release gate.

### Task 6: PR #17 completion gate

**Interfaces:**
- Consumes: final PR #17 commit and test/deployment evidence.
- Produces: approved immutable cutover source.

- [ ] Confirm PR #17 final commit.
- [ ] Run full tests, builds, smoke, and authenticated walkthrough.
- [ ] Preserve the final commit on `chatgpt/configurator-gpt-lab`.
- [ ] Confirm a READY Vercel deployment on the old GPT connection.
- [ ] Record rollback deployment URL and old connection metadata.

### Task 7: Controlled GPT database cutover

**Interfaces:**
- Consumes: verified new Neon project and completed PR #17 gate.
- Produces: GPT Vercel Preview/Development environments connected only to GPT Neon.

- [ ] Replace database variables only in `ironwrap-configurator-gpt-lab` Preview/Development.
- [ ] Trigger a fresh deployment.
- [ ] Verify deployment metadata references `chatgpt/configurator-gpt-lab`.
- [ ] Verify runtime database host is the new GPT Neon project.
- [ ] Confirm Claude Vercel and Neon resources are unchanged.

### Task 8: Acceptance and rollback gate

**Interfaces:**
- Consumes: new GPT deployment.
- Produces: accepted isolated GPT/Codex environment.

- [ ] Run `npm ci`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run smoke` against the READY GPT preview.
- [ ] Verify login, project load/save, Library, and Blob upload.
- [ ] Verify no cross-environment database records.
- [ ] Keep the prior connection and deployment until all checks pass.
- [ ] Document rollback steps and acceptance evidence.

### Task 9: Cleanup after acceptance

**Interfaces:**
- Consumes: accepted GPT environment and owner approval.
- Produces: clean isolated setup without obsolete GPT resources.

- [ ] Obtain explicit owner approval.
- [ ] Remove obsolete GPT-only Neon branches from the old project if any were recreated.
- [ ] Remove stale GPT Preview deployments only when safe and supported.
- [ ] Keep Claude resources untouched.
- [ ] Update project documentation with final IDs and ownership boundaries.
