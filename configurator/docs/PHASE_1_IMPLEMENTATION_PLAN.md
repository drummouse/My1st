# Phase 1 — Stabilization and Development Plan

Goal: make the existing Configurator safe to extend without rewriting it or touching production.

## Milestone 1 — Environment verification

- Keep all work on `chatgpt/configurator-gpt-lab`.
- Use Vercel preview deployments from that branch.
- Use Neon branch `configurator-gpt-lab` only.
- Verify `/api/health` reports application and database availability.
- Rotate the temporary lab database credential.

## Milestone 2 — Automated smoke coverage

Create repeatable checks for:

- App loads with no fatal console errors.
- Authentication endpoints resolve.
- Project create, read, update, and delete.
- Settings read/update.
- Material, color, custom-service, and attachment routes resolve.
- Public project link loads.
- Customer approval succeeds and remains visible after reload.
- XML import renders geometry.
- Estimate recalculates when an optional service changes.
- Text, HTML, and PDF exports complete.

## Milestone 3 — Database discipline

- Capture the current schema as a baseline migration.
- Stop adding new schema changes only through `ensureSchema()`.
- Add a migrations table and ordered migration runner.
- Test migrations on disposable Neon branches.
- Add design/project version columns and optimistic concurrency.

## Milestone 4 — Domain contracts

Define stable schemas for:

- Project metadata.
- Design state.
- Estimate snapshot.
- Material/color catalogue entries.
- Report input snapshot.
- Approval event.

Add runtime validation at API boundaries before a broader TypeScript conversion.

## Milestone 5 — Project lifecycle and versioning

- Add project lifecycle state.
- Save immutable design versions with thumbnails and timestamps.
- Preserve parent/version lineage.
- Make approval reference a specific design version and estimate snapshot.
- Prevent approval from silently moving when an owner edits the project afterward.

## Milestone 6 — UI foundation

- Introduce theme tokens without redesigning every screen.
- Separate Sales Workspace navigation from Customer Design Studio navigation.
- Keep shared configurator and pricing components.
- Reduce visual emphasis on administrative controls during customer design.

## Milestone 7 — Reports Engine v2 foundation

- Define immutable report snapshot JSON.
- Move repeated report logic into reusable document blocks.
- Keep existing PDF available while the new engine is built in parallel.
- Add customer design book and approval certificate first.

## Working method

For each change:

1. Create or update a test that demonstrates the intended behavior.
2. Implement the smallest change on the GPT branch.
3. Run build, API checks, and browser smoke checks.
4. Verify the Vercel preview.
5. Record architectural decisions in `docs/`.
6. Never merge to `main` without explicit review.

## First implementation sprint

1. Finish and verify health endpoint.
2. Add environment contract validation.
3. Add API route smoke test script.
4. Add Neon CRUD smoke test with automatic cleanup.
5. Add CI workflow running build and non-destructive checks.
6. Report findings and begin lifecycle/versioning design.
