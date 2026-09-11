---
name: Managed workflow port conflict
description: Keep the combined web workflow and artifact-managed API workflow on separate ports.
---

The combined `Start application` workflow runs its API on port 3001 and its Vite frontend on port 5000. The artifact-managed API workflow retains its managed port 8080. Vite receives `API_PORT=3001` so its `/api` proxy reaches the combined workflow's API.

**Why:** Artifact-managed workflows cannot be overridden or removed through the normal workflow controls, and they inject port 8080. Running the combined workflow on the same port causes `EADDRINUSE`.

**How to apply:** Keep `Start application` explicitly on API port 3001 and pass `API_PORT=3001` to its frontend. Leave the artifact-managed API service on 8080; both workflows may run together without conflict.