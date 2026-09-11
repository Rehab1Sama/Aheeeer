---
name: Build pipeline — TypeScript errors don't block build
description: esbuild is used, not tsc; TS errors are pre-existing in many files
---

## Key fact
Vite uses esbuild for compilation, which ignores TypeScript type errors.
Running `tsc --noEmit` shows many errors but the app still builds and runs.

## Pre-existing errors (non-blocking)
- Files using `@workspace/db` and `@workspace/api-zod` show TS6305 (dist not built)
- Many route files have TS7006 (implicit any) — pre-existing style
- These don't affect runtime

## Fixable errors (real bugs)
- Unknown types in `.map()` callbacks: fix with explicit `(t: string)` annotation or `.flatMap()` with type narrowing
- Destructured map params: fix with `({ r, reasons }: { r: any; reasons: string[] })`

**Why:** Type annotations prevent silent runtime bugs and keep IDE support accurate.
