---
phase: 1
title: "Remove Better-T mock UI and reset shell"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Remove Better-T mock UI and reset shell

## Overview
Delete every piece of Better-T-Stack scaffold UI from `apps/web` so the app has a clean, empty shell ready to receive the converted design.

## Requirements
- Functional: `/` no longer renders the ASCII-art scaffold page; the generic global `Header` is gone; the empty dashboard stub is gone; the forced dark theme is gone.
- Functional: auth **flow** (`/login`, sign-in/sign-up forms, `_auth` guard) remains fully working; login screen **visuals** intentionally adopt the export light palette via the Phase 2 token remap (this is accepted, not a regression).
- Non-functional: no dead code, no unused imports left behind; `pnpm run check` and `pnpm run check-types` pass after every deletion.

## Architecture
The scaffold UI lives in exactly three places: `routes/index.tsx` (ASCII home), `components/header.tsx` + `mode-toggle.tsx` (rendered from `__root.tsx`), and `routes/_auth/dashboard.tsx` (stub). The root layout's grid (`grid-rows-[auto_1fr] h-svh` with Header on top) must be removed so the new app shell can own the full viewport. **Delete `ThemeProvider` entirely, not just set light default** — `next-themes` persists `"dark"` in localStorage under `vite-ui-theme`, so returning users would stay dark if only the default changed. `Toaster` works without `ThemeProvider` but silently falls back to the OS theme — pin `<Toaster richColors theme="light" />` or dark-OS users get dark toasts in the light app.

<!-- Updated: Red Team - pin Toaster theme (sonner falls back to system theme otherwise) -->

## Related Code Files
- Modify: `apps/web/src/routes/__root.tsx` — remove Header + grid wrapper + ThemeProvider (keep HeadContent/Toaster/Devtools).
- Modify: `apps/web/src/routes/index.tsx` — replace HomeComponent with a redirect to `/dashboard`.
- Delete: `apps/web/src/components/header.tsx`
- Delete: `apps/web/src/components/mode-toggle.tsx`
- Delete: `apps/web/src/components/theme-provider.tsx` (only if nothing else imports it — verify; sonner's Toaster does not require it)
- Modify: `apps/web/src/routes/_auth/dashboard.tsx` — temporary minimal placeholder (full implementation lands in Phase 5).
- Keep untouched: `login.tsx`, `sign-in-form.tsx`, `sign-up-form.tsx`, `user-menu.tsx` (reused in Phase 4 sidebar footer), `loader.tsx`, `lib/auth-client.ts`. **Exception (red-team):** the two auth form files carry hardcoded stock-palette classes (`text-indigo-600 hover:text-indigo-800`, `text-red-500`) that no token remap can reach — a ~6-line mechanical class swap to `text-accent`/`text-destructive` is permitted here so Phase 2's light-palette claim is achievable; flow/validation/navigation logic stays untouched.

## Implementation Steps
1. Rewrite `routes/index.tsx` to `createFileRoute("/")` with `beforeLoad: () => { throw redirect({ to: "/dashboard" }) }` (no component needed beyond a null render).
2. In `__root.tsx`: remove `Header` import + usage, remove the `grid grid-rows-[auto_1fr] h-svh` wrapper (render `<Outlet />` bare), remove `ThemeProvider` wrapper and its import.
3. Delete `components/header.tsx`, `components/mode-toggle.tsx`, and `components/theme-provider.tsx` (after grep confirms no remaining importers).
4. Reduce `_auth/dashboard.tsx` to a single `<div>Dashboard</div>` placeholder.
5. Run `pnpm run check` and `pnpm run check-types` from repo root; fix any unused-import lint fallout.

## Success Criteria
- [x] Visiting `/` lands on `/dashboard` (or `/login` when signed out) — no ASCII art anywhere
- [x] No global header bar; viewport belongs entirely to the auth layout
- [x] App boots with light background for BOTH fresh profiles and profiles with stale `vite-ui-theme: dark` in localStorage; no theme toggle control exists; no `ThemeProvider` remains
- [x] `git grep -l "TITLE_TEXT\|ModeToggle\|from \"./header\""` returns nothing
- [x] Biome + type-check + build pass

## Risk Assessment
Low risk. All deletions are additive-safe: auth guard chain (`__root` → `_auth.beforeLoad` → login redirect) is untouched. If removing the root grid breaks PWA scroll behavior, the signal is a fixed-viewport bug on mobile in Phase 8 — response: wrap `<Outlet />` in `min-h-svh` instead of a grid.
