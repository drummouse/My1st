# IronWrap Platform — GPT/Codex Session Briefing

This repository contains two independent AI development lanes. GPT/Codex must remain isolated from Claude until an explicitly approved integration step.

## Branch discipline

- `main` is production only. Never commit or push directly to it.
- Persistent GPT/Codex integration branch: `chatgpt/configurator-gpt-lab`.
- GPT/Codex feature branches use `chatgpt/*` and target `chatgpt/configurator-gpt-lab`.
- Do not modify `claude/*` branches.
- Approved cross-lane work moves through `integration/release-candidate` only after human review.

## Vercel isolation

- GPT/Codex project: `ironwrap-configurator-gpt-lab`.
- Claude project: `ironwrap-estimator`.
- Do not copy, replace, or expose Claude project secrets in the GPT project.
- GPT/Codex Preview and Development deployments must use GPT-specific database and storage credentials.
- Production promotion is a human release action.

## Neon isolation

- Target GPT/Codex Neon project: `ironwrap-configurator-gpt-lab`.
- It must be a separate Neon project, not a branch inside Claude's Neon project.
- Until the separate project is provisioned and verified, do not repoint the GPT Vercel database variables.
- Never modify or delete the Claude Neon project `neon-chestnut-jacket` or its active branches.
- Initial GPT data must be safe test data only unless the owner explicitly approves a data copy.

## Current migration freeze

- PR #17 (`chatgpt/ui-foundation-design`) is the active Codex release gate.
- The persistent GPT branch may be prepared in parallel, but final database/Vercel cutover waits until PR #17 is complete, tested, deployed, and preserved.
- Do not delete the old GPT database connection until the new environment passes all acceptance checks.

## Required verification

Before claiming the GPT environment is ready:

1. Confirm the branch and commit.
2. Confirm the Vercel deployment belongs to `ironwrap-configurator-gpt-lab`.
3. Confirm the database host/project is the independent GPT Neon project.
4. Run `npm ci`, `npm test`, `npm run build`, and `npm run smoke` from `configurator/`.
5. Verify authenticated login, project load/save, Library access, and Blob upload.
6. Record the exact Vercel project, Neon project, branch, deployment, and commit.

## Safety rules

- Never commit secrets.
- Never copy production customer data without explicit approval.
- Keep rollback credentials and the previous GPT deployment until acceptance.
- Do not merge or deploy to `main` without explicit human approval.
