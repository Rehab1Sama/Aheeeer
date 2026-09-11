---
name: ThemeProvider dark mode
description: How dark mode and the existing white-label theming coexist in ThemeProvider.tsx
---

## Rule
`ThemeProvider.tsx` serves two purposes:
1. **White-label colours** — applies VITE_PRIMARY_HSL / VITE_SECONDARY_HSL / VITE_SIDEBAR_HSL on mount (unchanged).
2. **Dark mode** — `useTheme()` hook exposes `{ isDark, toggleDark }` backed by `localStorage("sana_dark")`. Toggling adds/removes `.dark` class on `<html>`.

**Why:** The original ThemeProvider had no dark mode hook. Adding a combined context avoids two nested providers and keeps the API clean.

**How to apply:**
- Import `useTheme` from `@/components/ThemeProvider` in any component needing dark state.
- The `.dark` CSS class is defined in `index.css` with full HSL variable overrides after the `:root` block.
- `DarkModeToggle` component lives in `Layout.tsx` — renders Moon/Sun icons and calls `toggleDark()`.

## planSync.ts — auto-update memorizedUpToSurah
- File: `artifacts/api-server/src/lib/planSync.ts`
- Exports `syncPlanMemorizedUpTo(studentId, surahEnd, ayahEnd)`.
- Only fires for `trackType === "fixation"` active plans.
- Compares absolute ayah positions (SURAHS array duplicated from reviewPlan.ts — intentional to avoid circular import).
- Called async (`.catch(() => {})`) after POST /records and PATCH /records/:id in `records.ts`.
