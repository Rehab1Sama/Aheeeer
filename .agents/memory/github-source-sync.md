---
name: GitHub source synchronization
description: GitHub API commits must include every dependent source file when the remote branch lags local history.
---

When pushing through the GitHub REST API instead of a normal Git push, each commit tree contains only the explicitly submitted blobs plus the remote base tree. If the remote branch is behind the local workspace, a feature-only update can leave dependent shared schemas or generated API sources stale.

**Why:** A deployment can then compile an updated API route against an older workspace package and fail with a missing-export error, even though the local build succeeds.

**How to apply:** Before reporting a REST-API push as complete, compare the local tracked source tree with the remote GitHub tree and include all changed `artifacts/` and `lib/` source files required by the feature. Exclude user attachments and generated screenshots unless they are deliberately part of the change.