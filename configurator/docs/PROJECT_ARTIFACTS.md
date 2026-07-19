# IronWrap Studio Project Artifacts

## Canonical and Mirror Locations

All approved specifications, implementation plans, milestone reports, verification reports, and release notes must be committed to this repository under `configurator/docs/`. Git is the canonical, versioned source for development artifacts.

The client-facing Windows working mirror is:

`C:\Users\ilyam\OneDrive\Desktop\Estimating app with 3D`

After an artifact is approved or a milestone is completed, copy the committed file into the corresponding subject folder beneath that OneDrive location. Preserve the filename so the Git version and OneDrive mirror can be compared directly.

## Folder Convention

| Artifact | Canonical repository folder | OneDrive subject folder |
| --- | --- | --- |
| Approved design | `configurator/docs/superpowers/specs/` | `<subject>\Design` |
| Implementation plan | `configurator/docs/superpowers/plans/` | `<subject>\Plans` |
| Milestone or verification report | `configurator/docs/milestones/` | `<subject>\Milestones` |
| Operations guide | `configurator/docs/` | `<subject>\Operations` |
| Client/investor document | `configurator/docs/client/` | `<subject>\Client and Investor` |

For Library Core, use the OneDrive subject folder:

`C:\Users\ilyam\OneDrive\Desktop\Estimating app with 3D\IronWrap Studio\Library Core`

## Library Core Artifact Register

| Artifact | Status | Canonical path |
| --- | --- | --- |
| Library Core design | Approved | `configurator/docs/superpowers/specs/2026-07-17-library-core-design.md` |
| Library Core implementation plan | Implemented | `configurator/docs/superpowers/plans/2026-07-17-library-core.md` |
| Library Core operations guide | Prepared | `configurator/docs/LIBRARY_OPERATIONS.md` |
| Capture/Scanner handoff | Prepared | `configurator/docs/CAPTURE_LIBRARY_HANDOFF.md` |
| Library Core verification report | Local automation complete; deployment pending | `configurator/docs/milestones/2026-07-17-library-core-verification.md` |

## IronWrap Capture Artifact Register

| Artifact | Status | Canonical path |
| --- | --- | --- |
| Capture Stage 0 audit and architecture plan | Prepared | `configurator/docs/superpowers/specs/2026-07-19-capture-stage0-architecture.md` |
| Capture decision log | Active | `configurator/docs/CAPTURE_DECISION_LOG.md` |
| Capture Stage 1 foundation verification | Automated checks complete; interactive preview walkthrough pending | `configurator/docs/milestones/2026-07-19-capture-stage1-foundation.md` |
| Capture Stage 2 upload verification | Automated checks complete; phone camera walkthrough pending | `configurator/docs/milestones/2026-07-19-capture-stage2-uploads.md` |

## Completion Rule

A milestone is not complete until its canonical artifact is committed, its automated verification is recorded, and its approved documents are saved in the related Google Drive folder that mirrors the OneDrive working environment.
