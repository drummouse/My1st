# IronWrap Configurator — Initial Architecture Audit

Status: Working baseline
Branch: `chatgpt/configurator-gpt-lab`

## System map

- Frontend: React 18 + Vite + Three.js.
- Main build: Vite production bundle, artifact bundle, and snapshot-template generation.
- Hosting/API: Vercel static frontend plus serverless functions under `api/`.
- Database: Neon Postgres through `@neondatabase/serverless`.
- Storage: Vercel Blob for attachments/uploads.
- Authentication: signed session flow using `jose`; password hashing with `bcryptjs`.
- Reports: jsPDF plus QR generation and captured Three.js views.
- Offline/installability: Vite PWA plugin and service worker.

## Core product domains

1. XML import and layer/facet geometry.
2. Three-dimensional viewing and per-facet customization.
3. Material, color, service, pricing, discount, and tax configuration.
4. Projects, customers, sharing, approval, and attachments.
5. Tenant settings, branding, roles, and developer support access.
6. Text, HTML, PDF, and snapshot exports.
7. External approval webhook foundation.

## Current strengths

- The working product already spans configuration, estimating, sharing, and approval.
- Project design data is persisted rather than being limited to local browser state.
- Catalog entries and selected custom-service lines are separated, preserving quoted values.
- Tenant-aware access helpers exist in one shared role module.
- Vercel routing was corrected for a Vite project and is now explicit through rewrites.
- The GPT branch, Vercel preview, and Neon branch are isolated from production.

## Architectural risks

### High priority

- Schema bootstrapping appears to happen from runtime application code. This is convenient for MVP work but should be replaced by versioned migrations before multi-tenant commercialization.
- The Vercel Hobby function-count limit previously drove route consolidation. Route structure must be covered by automated deployment tests because framework-specific filename assumptions already caused silent write failures.
- The frontend has accumulated many business domains rapidly. `App.jsx` and shared registries are likely carrying too much orchestration and global mutable state.
- Reports, live UI, exported HTML, and pricing must remain synchronized; duplicated presentation/business rules could drift.
- Public project and attachment reads are intentional, but their authorization, token model, and data exposure need a formal security review.

### Medium priority

- Health monitoring existed only implicitly; the GPT branch now has an explicit database/environment health endpoint.
- Automated tests are mainly described in historical PRs. A committed repeatable smoke suite is needed.
- Environment-variable contracts are undocumented and were difficult to reproduce when creating the lab.
- Integration delivery is currently centered on one approval webhook and should evolve into a typed event dispatcher only when a second event is implemented.

## Recommended target boundaries

- `domain/geometry`: XML parsing, layers, facets, measurements.
- `domain/catalog`: materials, colors, folders, compatibility.
- `domain/estimate`: services, pricing, taxes, discounts, immutable snapshots.
- `domain/project`: project lifecycle, versions, approvals, attachments.
- `domain/tenant`: users, roles, settings, branding.
- `domain/documents`: report templates and renderers.
- `infrastructure/`: Neon, Blob, Vercel, webhooks.
- `ui/sales-workspace` and `ui/customer-studio`: distinct layouts over shared domain components.

## Immediate conclusion

Do not rewrite the product. Stabilize the existing architecture, introduce tests and migration discipline, then separate domains incrementally while continuing to ship.
