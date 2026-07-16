# Technical Debt and Bug Register

Status: Initial audit; validate each item before implementation.

## P0 — release safety

1. Add automated API route smoke tests for every bare and parameterized route.
   - Reason: unsupported optional-catch-all filenames previously caused silent 404s for all writes.
2. Add a lab database write/read/delete smoke test.
   - Covers projects, materials, colors, custom services, and attachments metadata.
3. Document and validate the environment-variable contract.
   - Build should fail clearly when required variables are missing.
4. Confirm the GPT Vercel preview uses the Neon `configurator-gpt-lab` branch.
5. Rotate the lab database credential that was exposed during setup.

## P1 — security and data integrity

1. Review all intentionally public project and attachment endpoints.
2. Replace guessable/public identifiers with share tokens if sensitive customer data can be returned.
3. Add request validation and payload-size limits consistently across API routes.
4. Add audit records for approval, project updates, developer cross-tenant actions, and destructive operations.
5. Replace runtime schema mutation with checked-in, versioned migrations.
6. Verify tenant ownership on every read, update, delete, upload, and folder operation.

## P1 — reliability

1. Add centralized API error responses with stable error codes.
2. Add retry-safe/idempotent approval and webhook handling.
3. Add timeout and failure telemetry for Neon, Blob, and external webhooks.
4. Add project/design snapshot version numbers to prevent stale overwrites.
5. Add optimistic-concurrency checks when two sessions edit one project.
6. Ensure service-worker caching never serves stale authenticated API responses.

## P1 — product consistency

1. Establish one estimate snapshot consumed by live UI, HTML, text, and PDF outputs.
2. Establish one selection-state model for locked, included, optional, unavailable, and recommended choices.
3. Add lifecycle states: draft, customer-designing, submitted, pricing-review, approved, production-ready.
4. Add design versions rather than overwriting one mutable design JSON blob.
5. Confirm exported HTML and live project links use the same approval behavior and origin rules.

## P2 — maintainability

1. Reduce orchestration pressure in `App.jsx` by extracting domain hooks/services.
2. Replace global catalog registries with explicit providers or injected catalog context.
3. Split report generation into reusable blocks and an immutable report input schema.
4. Add TypeScript or runtime schemas at API and design-state boundaries.
5. Add linting, formatting, unit tests, and CI checks to the repository.
6. Create a dependency-update policy and lock Node/Vite versions used by Vercel and local development.

## Known historical bug classes to guard against

- Vercel route conventions differing from Next.js conventions.
- Silent save failure producing incomplete exported artifacts.
- Relative API URLs inside standalone HTML exports.
- CSS variables scoped too narrowly, making button text invisible.
- Canvas aspect mismatch after CSS-only resize/fullscreen changes.
- Runtime schema initialization becoming permanently rejected after one transient failure.
- Owner reassignment during developer cross-tenant edits.
- Report surfaces listing enabled services with zero measured quantity.

## Exit criteria for stabilization

- Green build and smoke tests on every GPT branch commit.
- Successful lab CRUD test against Neon.
- No production credentials or endpoints used by the GPT environment.
- Security review completed for public links and attachments.
- Database migrations are reproducible from an empty branch.
- Core owner and customer workflows pass automated browser tests.
