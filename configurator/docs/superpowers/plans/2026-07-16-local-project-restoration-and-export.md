# Local Project Restoration and Share Design Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore an owner-opened project after refresh and make Share Design available under `vercel dev` while preserving hosted behavior.

**Architecture:** Add a small URL-navigation module for the owner-only `edit` query parameter and wire it into App project load/save/new flows. Extend the existing snapshot-template generator with a selectable output path, prepare a public template before local Vite startup, and explicitly make Vercel Dev use the package development command.

**Tech Stack:** React 18, Vite 5, Vercel CLI, Node.js built-in test runner.

## Global Constraints

- Existing `?p=<id>` customer links remain customer-facing and locked.
- Production continues generating `dist/snapshot-template.html`.
- Generated local templates are not committed.
- Vercel, Neon, authentication, hosted environment variables, exported format, and approval behavior remain unchanged.

---

### Task 1: Owner project URL restoration

**Files:**
- Create: `src/lib/projectNavigation.js`
- Create: `tests/projectNavigation.test.mjs`
- Modify: `src/App.jsx`
- Modify: `src/components/ProjectsPanel.jsx`
- Modify: `package.json`

**Interfaces:**
- Produces: `getEditProjectId(search)` and `replaceEditProjectId(id, location, history)`.
- App consumes these helpers to restore, set, and clear the current owner project.

- [ ] **Step 1: Write failing Node tests** proving `getEditProjectId('?edit=abc')` returns `abc`, URL replacement preserves unrelated parameters, setting edit removes customer-share parameters, and clearing edit removes it.
- [ ] **Step 2: Run `npm test`** and verify failure because `src/lib/projectNavigation.js` does not exist.
- [ ] **Step 3: Implement the URL helpers** using `URLSearchParams` and `history.replaceState` without navigation.
- [ ] **Step 4: Run `npm test`** and verify all URL helper tests pass.
- [ ] **Step 5: Wire App flows** so `?edit=` loads a project without customer locking; project open/save sets `edit`; New Project clears it; failed restore logs a clear error.
- [ ] **Step 6: Run `npm test` and `npm run build`**, then commit the project-restoration change.

### Task 2: Local Share Design template

**Files:**
- Create: `tests/localSnapshot.test.mjs`
- Modify: `scripts/build-snapshot-template.mjs`
- Modify: `package.json`
- Modify: `vercel.json`
- Modify: `.gitignore`

**Interfaces:**
- `node scripts/build-snapshot-template.mjs [output-path]` defaults to `dist/snapshot-template.html`.
- `npm run prepare:snapshot:local` produces `public/snapshot-template.html`.
- `npm run dev` prepares that file before starting Vite.

- [ ] **Step 1: Write failing configuration tests** requiring the local preparation script, explicit Vercel dev command, output-path support, and ignored generated public template.
- [ ] **Step 2: Run `npm test`** and verify the new tests fail on the missing local preparation behavior.
- [ ] **Step 3: Implement selectable template output**, add `prepare:snapshot:local`, prepend it to `dev`, set Vercel `devCommand`, and ignore `public/snapshot-template.html`.
- [ ] **Step 4: Run `npm test`** and verify the configuration tests pass.
- [ ] **Step 5: Run `npm run prepare:snapshot:local`** and verify the generated HTML exists, embeds the app, and contains no `./assets/` references.
- [ ] **Step 6: Run `npm run build`** and verify production still creates `dist/snapshot-template.html`, then commit.

### Task 3: Cleanup and full verification

**Files:**
- Modify: the source file containing temporary `AUTH_SECRET`/environment-key diagnostics, if present on the branch.

**Interfaces:**
- No debug environment output remains in tracked source.

- [ ] **Step 1: Search tracked files** with `rg -n "AUTH_SECRET:|ENV KEYS" -g '!node_modules'` and remove only temporary diagnostics if found.
- [ ] **Step 2: Run `npm test`** and verify zero failures.
- [ ] **Step 3: Run `npm run build`** and verify exit code 0 and both artifact-generation stages complete.
- [ ] **Step 4: Inspect `git diff --check` and `git status --short`**, review scope, and commit cleanup if any.
- [ ] **Step 5: Report the exact local restart command and manual refresh/export checks.**
