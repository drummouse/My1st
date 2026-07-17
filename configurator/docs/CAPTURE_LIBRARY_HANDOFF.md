# Capture/Scanner → Library Core Handoff

## Objective

The urgent IronWrap Capture/Scanner prototype submits measured profiles, sampled colors, and captured products into a tenant-private review queue. It does not publish directly to the global Library.

## Submission Contract

Every submission uses:

- `scope: tenant` with the authenticated tenant ID.
- `sourceType: capture`.
- `reviewStatus: pending_review`.
- `qualityLevel: test`, `low`, `standard`, or `verified` based on configured evidence rules.
- `captureConfidence` from `0` through `1` inside the versioned scanner metadata namespace.
- Contributor attribution plus non-secret device and session references.
- External HTTP(S) thumbnail, texture, or geometry URLs; binary upload is outside Library Core.
- Stable source lineage retained through review, merge, approval, and future publication.

Valid schema-version-1 example:

```json
{
  "recordType": "profile",
  "scope": "tenant",
  "tenantId": "00000000-0000-0000-0000-000000000001",
  "name": "Captured standing-seam profile",
  "reviewStatus": "pending_review",
  "qualityLevel": "test",
  "sourceType": "capture",
  "attribution": "Contributor display name",
  "geometryUrl": "https://assets.example/profile.glb",
  "metadata": {
    "scanner": {
      "schemaVersion": 1,
      "captureConfidence": 0.82,
      "deviceReference": "device-anonymous-7",
      "sessionReference": "capture-session-42",
      "measurements": { "unit": "mm", "points": [] }
    }
  }
}
```

## Review Lifecycle

1. Capture submits tenant-private `pending_review` data.
2. The submitting tenant may later use its private pending record when contractor Library controls are introduced.
3. A reviewer may approve, reject, request revision, or identify an existing matching record.
4. Merge and global publication are separate privileged actions; review approval alone never publishes globally.
5. Contributor attribution and original capture/session references survive merge through provenance metadata.

## Prototype Acceptance Targets

- Capture one physical profile and produce reproducible geometry/measurements.
- Capture one physical color/finish with source imagery and confidence metadata.
- Resume an interrupted capture session without creating duplicate submissions.
- Submit through Library dry-run validation and receive row-level stable errors.
- Display pending review status and the eventual review outcome.
- Never expose another tenant’s submissions, device identifiers, or raw private capture data.

Contributor incentives remain configurable and inactive until the business rules are approved.
