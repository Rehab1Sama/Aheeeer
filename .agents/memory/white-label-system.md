---
name: White-label system
description: Architecture for multi-tenant white-label school deployments via Render API
---

## DB Table: whitelabel_configs
Columns: schoolName, schoolTagline, logoUrl, adminEmail, primaryHsl, secondaryHsl, sidebarHsl, enabledFeatures (JSON), dataEntryRoles (JSON), roleNames (JSON), trackTypes (JSON), circleGenders (JSON), renderServiceId, renderDbId, renderServiceUrl, deployStatus (draft/deploying/deployed/failed), deployError.

## Backend routes
- `GET/POST/PATCH/DELETE /api/white-label/configs` — CRUD
- `POST /api/white-label/configs/:id/deploy` — creates Render Postgres DB + web service
- `GET /api/white-label/configs/:id/deploy-status` — polls Render API, updates deployStatus
- `GET /api/white-label/render-settings` — checks RENDER_API_KEY + RENDER_GITHUB_REPO_URL
- `GET /api/school-config` — returns current instance config from env vars (no auth)

## Env vars pattern for deployed instances
Frontend (VITE_*): VITE_SCHOOL_NAME, VITE_SCHOOL_TAGLINE, VITE_LOGO_URL, VITE_PRIMARY_HSL, VITE_SECONDARY_HSL, VITE_SIDEBAR_HSL, VITE_ENABLED_FEATURES, VITE_DATA_ENTRY_ROLES, VITE_ROLE_NAMES, VITE_DEFAULT_TRACK_TYPES.
Backend: ALLOWED_DATA_ENTRY_ROLES, DEFAULT_TRACK_TYPES, CUSTOM_ROLE_NAMES, CIRCLE_GENDERS, INITIAL_ADMIN_EMAIL.

## Frontend
- `src/lib/schoolConfig.ts` — reads VITE_* env vars; exports schoolConfig object + getRoleName() + canEnterData()
- `src/components/ThemeProvider.tsx` — applies VITE_*_HSL on mount; exports applyThemeFromHex / resetTheme / hslToHex
- `src/pages/white-label.tsx` — 6-section builder: identity, colors (with live preview), data-entry roles, role names, track types, features
- App.tsx uses canEnterData() for /data-entry route guard

**Why:** Render API requires RENDER_API_KEY + RENDER_GITHUB_REPO_URL in Secrets; Render build creates Postgres DB first, then web service with all env vars set.
