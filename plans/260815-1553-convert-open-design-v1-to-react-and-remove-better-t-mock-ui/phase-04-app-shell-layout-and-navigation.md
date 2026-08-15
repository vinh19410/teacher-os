---
phase: 4
title: "App shell layout and navigation"
status: pending
priority: P1
effort: "4h"
dependencies: [3]
---

# Phase 4: App shell layout and navigation

## Overview
Build the persistent app shell — sidebar (248px), topbar (title, search, notifications), content area — replacing `_auth`'s bare `<Outlet/>` so every screen renders inside the exported chrome, and replace the export's `switchView` JS with real routing.

## Requirements
- Functional: `_auth` layout renders sidebar + topbar + `<Outlet/>`; topbar title derives from the active route (13 titles from export `viewTitles` map).
- Functional: sidebar nav items link to routes with `active` state styled as export (accent-soft bg, accent text); sections "Giảng dạy" / "Phụ huynh" / "Hệ thống" labels as in export.
- Functional: mobile (≤920px): sidebar hidden, hamburger `menu-toggle` opens slide-in drawer (280px, translateX) + scrim; scrim/Escape closes; nav click closes.
- Functional: notification bell opens 360px dropdown panel (export `notif-panel`) listing `D.notifs` with dot colors and channel meta; closes on outside click.
- Functional: topbar search input (hidden ≤920px per export) matches student names case-insensitively and navigates to the first match's detail route (export behavior).
- Functional: sidebar footer teacher card reuses the authenticated session user (name from Better-Auth session, initials avatar, "PRO" plan badge). **Session invariant (red-team):** inside `_auth` a session must exist — the only reachable path for a missing session is a broken guard chain. Missing session ⇒ `throw redirect({ to: "/login" })` in the shell; NO unauthenticated fallback rendering the export placeholder. Dev testing signs in like production.
- Functional: **demo-data disclosure (red-team):** a persistent, unobtrusive "Dữ liệu demo — thay đổi không được lưu" indicator in the AppShell (topbar area), because the app ships with real auth, PWA install, and financial actions whose mutations reset on reload. Non-negotiable Phase 4 deliverable.
- Non-functional: topbar sticky with `backdrop-filter: blur(16px)` + 88% bg; content scrolls independently.

## Architecture
```
apps/web/src/routes/_auth/route.tsx   # AuthLayout → <AppShell/>
apps/web/src/components/layout/
├── app-shell.tsx        # grid [sidebar 1fr], mobile state, DataProvider mount
├── sidebar.tsx          # brand, nav (NavLink), section labels, footer teacher card
├── topbar.tsx           # menu-toggle, route title, search, bell + notif panel
└── notif-panel.tsx      # dropdown list
```
Routing: keep `beforeLoad` auth guard untouched; `Outlet` renders active child. Topbar title via `useMatches()`-derived map or a static `routeTitles` object keyed by route id (export `viewTitles` port). **Composition decision (red-team, resolved):** `AppShell` is a plain component rendered by `_auth/route.tsx`'s layout function; it takes NO children and renders `<Outlet />` directly from `@tanstack/react-router` inside its content area — the same pattern `_auth/route.tsx` already uses, so guard semantics cannot be accidentally detached by a children-wrapping refactor.

**Capture harness (red-team, built here — the Phase 5 gate depends on it):** every screenshot gate must capture an *authenticated* page. Build now: start `dev:server` + `dev:web`, create a throwaway signed-in capture path — either a small Playwright script (email/password sign-in through `/login`, then per-viewport screenshots) or the explicit fallback: a manual DevTools-device-mode checklist with recorded pass/fail per viewport. If Playwright install fails or requires network download of browsers, do not stall — fall back to the manual checklist. The harness decision is made in THIS phase, not Phase 8.

The `DataProvider` from Phase 3 mounts in `AppShell` so all child routes share one store instance.

## Related Code Files
- Modify: `apps/web/src/routes/_auth/route.tsx` (replace `<Outlet/>` with `<AppShell/>`; keep `beforeLoad`)
- Create: `apps/web/src/components/layout/app-shell.tsx`
- Create: `apps/web/src/components/layout/sidebar.tsx`
- Create: `apps/web/src/components/layout/topbar.tsx`
- Create: `apps/web/src/components/layout/notif-panel.tsx`
- Reference: export lines 46–84 (sidebar/topbar CSS), 260–276 (mobile media query), 280–314 (markup), 693–732 (view switching + notif JS)

## Implementation Steps
1. Write `app-shell.tsx`: `display:grid; grid-template-columns:248px 1fr; min-height:100svh`; renders Sidebar, mobile scrim, Topbar, `<main class="content">` with `<Outlet/>`; owns `sidebarOpen` state; mounts `<DataProvider>`; renders the demo-data indicator.
2. `sidebar.tsx`: sticky full-height, brand mark "T" + "Teacher OS"; nav items with export SVG icons (inline SVG, 1.6 stroke); `NavLink` with active detection; footer card with `useSession()` name → initials; if session is somehow missing, redirect to `/login` (hard invariant — no placeholder fallback).
3. `topbar.tsx`: hamburger button (hidden desktop via `menu-toggle` pattern), `routeTitles[routeId]`, demo indicator, search box (desktop only), bell button with `bell-dot`, `notif-panel` toggled by state + `useEffect` outside-click listener.
4. Wire `_auth/route.tsx` layout to render `<AppShell/>` which internally renders `<Outlet/>` (composition resolved per Architecture); keep `beforeLoad` guard byte-identical.
5. Mobile behavior: `useEffect` on route change closes drawer; Escape key listener; body scroll lock while open (export doesn't lock — optional upgrade, skip if it fights the design).
6. Verify: navigate between existing placeholder `/dashboard` and `/login` redirect still works; Devtools stays.
7. Stand up the capture harness (Playwright script or manual checklist — decision recorded here) and capture one authenticated `/dashboard` screenshot as proof the harness works.

<!-- Updated: Red Team - demo banner, session hard invariant, capture harness, Outlet composition resolved -->

## Success Criteria
- [ ] Desktop: sidebar fixed, active nav item accent-styled, title updates per route
- [ ] Mobile 360–920px: hamburger shows drawer over scrim; nav click navigates + closes; no horizontal scroll
- [ ] Bell panel opens/closes correctly, lists 4 notifications with correct dot colors
- [ ] Search typing a student name navigates to their (placeholder) detail route once it exists in Phase 5
- [ ] Auth redirect to `/login` intact when signed out; no session-less fallback branch exists in the shell
- [ ] Demo-data indicator visible in topbar; capture harness produced one authenticated screenshot

## Risk Assessment
- **Risk: TanStack Router `useMatches` title derivation complexity.** Simpler: each route file exports a static `title` via `Route.options` / context and `AppShell` reads `useRouterState({ select: s => s.matches }).at(-1)`. Signal: titles blank — response: fall back to per-route `<PageHead>` component carrying its own h1 (export already renders page-level h1s; topbar title duplicates them).
- **Risk: session-gated footer.** If Better-Auth session shape lacks name (social login), fallback initials "TO". Signal: crash on undefined — response: optional chaining.
