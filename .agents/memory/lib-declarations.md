---
name: Lib declarations build
description: shared workspace packages must regenerate .d.ts files before dependent TypeScript checks
---

The `lib/api-client-react`, `lib/api-zod`, and `lib/db` packages use `composite: true` with declaration output in their `tsconfig.json`. After a fresh clone or dependency install, run `npx tsc -p tsconfig.json` inside each changed package to generate `dist/index.d.ts`. Without this, dependent projects can resolve stale types even though their runtime build transpiles the source directly.

**Why:** The packages export raw `.ts` source files (no build script), but TypeScript project references require pre-compiled `.d.ts` declaration files to resolve types across workspace boundaries.

**How to apply:** Run once after `pnpm install` on a fresh environment, or whenever the `src/` of a shared lib changes. In particular, after a schema change run `npx tsc -p lib/db/tsconfig.json` before the API's `pnpm --filter @workspace/api-server run typecheck`. The esbuild pipeline (used for actual builds) doesn't need this — it transpiles `.ts` directly. Only `tsc --noEmit` type-checking is affected.
