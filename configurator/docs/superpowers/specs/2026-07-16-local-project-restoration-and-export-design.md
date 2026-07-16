# Local Project Restoration and Share Design Export

## Goal

Fix two local-development regressions without changing the working production and Preview behavior:

1. Refreshing an owner-opened project must restore that project instead of loading the sample project.
2. Share Design must generate its standalone HTML file under `vercel dev`.

Remove the temporary environment-variable diagnostics after verification.

## Project restoration

Owner project navigation will use an `edit` query parameter distinct from the existing public customer parameter:

- Opening a project from the Projects panel changes the URL to `?edit=<project-id>` without reloading the page.
- Loading or refreshing a URL containing `edit` fetches the saved design and restores `currentProjectId` in editable owner mode.
- Existing `?p=<project-id>` links remain customer-facing and continue to lock owner-only controls.
- Starting a new project clears `edit` from the URL.
- Invalid or inaccessible edit IDs report an error and leave the app usable.

This avoids browser-storage leakage between accounts and preserves the current customer-sharing contract.

## Local Share Design template

The standalone export template will be generated before the local Vite server starts:

- Extract the existing snapshot build into a reusable script flow.
- Add a local preparation command that builds the artifact bundle and writes the generated template into Vite's locally served public assets.
- Configure the Vercel local development command to run that preparation through the package development script.
- Keep the production build's current `dist/snapshot-template.html` output unchanged.
- Keep generated local template output out of Git.

The running application will continue fetching `/snapshot-template.html`; only the local preparation path changes.

## Testing

Regression checks will cover:

- owner edit URLs are created, restored, and cleared correctly;
- customer `p` URLs retain their existing behavior;
- the local preparation command produces a self-contained template;
- the production build still produces its template;
- the application build and existing smoke checks remain successful.

## Out of scope

- Changes to Vercel, Neon, authentication, or hosted environment variables.
- Changes to the exported design format or customer approval workflow.
- General project-routing refactors.
