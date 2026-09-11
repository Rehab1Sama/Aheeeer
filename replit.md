# مقرأة سَنا — Sana Quran Platform

نظام إدارة المقرأة القرآنية. منصة لإدارة الحلقات والطالبات وإدخال البيانات اليومية.

## Stack

- **Frontend**: React 19 + Vite + Tailwind CSS 4 + TanStack Query — `artifacts/sana-quran/`
- **Backend**: Express 5 (Node.js) + Drizzle ORM + PostgreSQL — `artifacts/api-server/`
- **Shared libs**: `lib/db/` (schema), `lib/api-client-react/` (hooks), `lib/api-zod/` (validation)
- **Monorepo**: pnpm workspaces

## Run

```
pnpm install          # install all dependencies (run once)
```

Workflows:
- **API Server** (`artifacts/api-server: API Server`): builds with esbuild then starts on port 8080
- **Frontend** (`artifacts/sana-quran: web`): Vite dev server on port 18327

## User preferences

- Arabic UI throughout — all user-facing text in Arabic
- Keep existing project structure and stack — no migrations or restructuring without explicit request
