---
title: "Redesign login sign up page"
description: "Rebuild the /login page (sign in + sign up) to match the approved static design export: two-panel shell with brand panel, accessible segmented tabs, and restyled forms — while keeping all auth wiring (better-auth calls, validation, navigation, error toasts) unchanged."
status: pending
priority: P1
effort: "~1.5-2d"
branch: feat/redesign-login-sign-up-page
issue: 39
tags: [frontend, ui, auth]
blockedBy: []
blocks: []
created: 2026-08-20
---

# Redesign login sign up page

## Overview

Rebuild `/login` as the approved two-panel auth screen: a dark brand panel (logo, headline, static product mock card) and an auth panel with segmented Sign in / Create account tabs, Google button, and redesigned email forms. The single source of truth is the design export at `/Users/vinhtran/Library/Application Support/Open Design/namespaces/release-stable/data/projects/8832c0be-e494-4bb3-a000-7bfe2b889852/auth-redesign.html` (858 lines, all CSS/JS inline; cited below as `auth-redesign.html:<line>`). Its CSS tokens are identical to the app's frozen tokens in `packages/ui/src/styles/globals.css` — no new tokens, no new dependencies, no shared `packages/ui` component changes.

Hard invariant: the existing auth wiring must be preserved unchanged — `authClient.signIn.email` / `authClient.signUp.email` calls (`apps/web/src/components/sign-in-form.tsx:30-46`, `apps/web/src/components/sign-up-form.tsx:31-48`), zod validators and messages, `navigate({ to: "/dashboard" })` on success, and sonner error toasts. The only behavioral deltas are deliberate and listed in Phase 2: success toasts become inline notices, and the mode toggle becomes accessible tabs persisted to localStorage.

## Scope Challenge

- Existing: `/login` is a `useState` toggle rendering one of two TanStack Form components (`apps/web/src/routes/login.tsx:11-19`), styled with shared `packages/ui` Button/Input (h-8, rounded-none — wrong scale for this design). Google button and route guard exist and work (`apps/web/src/components/google-oauth-button.tsx:37-50`, `apps/web/src/routes/_auth/route.tsx:7-15`).
- Requested: match the complete static design export verbatim — shell grid, brand panel with static mock, segmented tabs with sliding thumb, 48px pill controls, password visibility toggle, live password hint, inline notices, motion with `prefers-reduced-motion` guards, full responsive collapse at ≤960px.
- Complexity: ~5 files touched/created, all in `apps/web`; no API, schema, contract, or shared-package changes. Highest-risk area is Phase 2 (TanStack Form error mapping into a new field component + ARIA tabs).
- Selected mode: HOLD SCOPE (fast mode auto-detected). No scope beyond the export; nothing deferred.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | /login matches the design export side-by-side at all breakpoints | P1 |
| 2 | Auth flows (sign in, sign up, Google OAuth) behave exactly as today | P1 |
| 3 | Accessible tabs (ARIA roles, roving tabIndex, arrow keys) + keyboard/focus pass | P1 |
| 4 | Responsive matrix 360–1920 with no horizontal scroll | P1 |
| 5 | `pnpm check` and `pnpm test` stay green | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Auth shell and brand panel](./phase-01-start.md) | Pending |
| 2 | [Phase 2: Auth tabs and forms](./phase-02-auth-tabs-and-forms.md) | Pending |
| 3 | [Phase 3: Polish and verification](./phase-03-polish-and-verification.md) | Pending |

## Success Criteria

- [ ] Auth flows unchanged: real sign-in, sign-up and Google redirect work against the dev server; zod messages identical; errors still surface via sonner toast.
- [ ] Design fidelity: side-by-side screenshot vs `auth-redesign.html` shows no visible deltas at 1280px (typography, spacing, colors, mock card, chips, progress bar).
- [ ] A11y pass: tablist/tab/tabpanel roles correct, arrow-key nav with wrap, roving tabIndex, focus-visible ring on every control, password toggle announces state.
- [ ] Responsive matrix 360/420/768/960/1280/1920: no horizontal scroll, ≤960px collapses per export (brand panel centers, mock/sub/head/foot hidden, mobile-brand row shown), ≤420px tighter padding + 24px title.
- [ ] `pnpm check` and `pnpm test` green; no new dependencies; no `packages/ui` changes.

## Related plans

- `plans/260819-2034-production-readiness` (pending) — touches infra, D1 drills, `/readyz`, UAT only. No file overlap with this plan; not blocking.

## Dependencies

None. Pure frontend page redesign: no API, database, or contract changes. `authClient` (`apps/web/src/lib/auth-client.ts:39-43`) is consumed as-is.

<!-- slug: redesign-login-sign-up-page -->
