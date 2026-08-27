---
title: "Redesign login sign up page"
description: "Rebuild the /login page (sign in + sign up) to match the approved static design export: two-panel shell with brand panel, accessible segmented tabs, and restyled forms — while keeping all auth wiring (better-auth calls, validation, navigation, error toasts) unchanged."
status: completed
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

Rebuild `/login` as the approved two-panel auth screen: a dark brand panel (logo, headline, static product mock card) and an auth panel with segmented Sign in / Create account tabs, Google button, and redesigned email forms. The single source of truth is the design export at `/Users/vinhtran/Library/Application Support/Open Design/namespaces/release-stable/data/projects/8832c0be-e494-4bb3-a000-7bfe2b889852/auth-redesign.html` (858 lines, all CSS/JS inline; cited below as `auth-redesign.html:<line>`). Its base tokens are identical to the app's frozen tokens in `packages/ui/src/styles/globals.css`. Exception: the export defines `--danger-strong` / `--success-strong` (`auth-redesign.html:48-49`) that the app does NOT have — reproduce them as inline arbitrary utilities `text-[color-mix(in_oklab,var(--danger),black_18%)]` / `text-[color-mix(in_oklab,var(--success),black_24%)]` (same computed color as the export's mixes). No new tokens, no new dependencies, no shared `packages/ui` component changes.

Hard invariant: the existing auth wiring must be preserved unchanged — `authClient.signIn.email` / `authClient.signUp.email` calls (`apps/web/src/components/sign-in-form.tsx:28-46`, `apps/web/src/components/sign-up-form.tsx:30-48`), zod validators and messages, `useSearch({ from: "/login" })` returnUrl handling, and on success a **full-page** `window.location.assign(validateReturnUrl(returnUrl))` (default `/dashboard` via `DEFAULT_RETURN_URL`; the full-page load boots the workspace through the kernel load gate — keep the code comment). Sonner error toasts stay. This wiring is locked by contract tests (`apps/web/src/lib/kernel-runtime.contract.test.ts` — `validateSearch`, `useSearch({ from: "/login" })`, `validateReturnUrl(returnUrl)` must keep matching). NEVER replace `window.location.assign` with SPA `navigate`, and NEVER hardcode `/dashboard` in place of `validateReturnUrl(returnUrl)` — that is the open-redirect regression the tests guard. The only behavioral deltas are deliberate and listed in Phase 2: success toasts become inline notices, and the mode toggle becomes accessible tabs persisted to localStorage.

## Scope Challenge

- Existing: `/login` is a `useState` toggle rendering one of two TanStack Form components (`apps/web/src/routes/login.tsx:19-27`, state at `:20`), styled with shared `packages/ui` Button/Input (h-8, rounded-none — wrong scale for this design). Google button and route guard exist and work (`apps/web/src/components/google-oauth-button.tsx:40-55` — its callbackURL is `` `${window.location.origin}${validateReturnUrl(returnUrl)}` ``, NOT a hardcoded `/dashboard`; `apps/web/src/routes/_auth/route.tsx:7-19`). The route also carries `validateSearch` for `returnUrl` (`login.tsx:10-15`) — must be preserved verbatim in every rewrite.
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
| 1 | [Phase 1: Auth shell and brand panel](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Auth tabs and forms](./phase-02-auth-tabs-and-forms.md) | Completed |
| 3 | [Phase 3: Polish and verification](./phase-03-polish-and-verification.md) | Completed |

## Success Criteria

- [x] Auth flows unchanged: real sign-in, sign-up and Google redirect work against the dev server; zod messages identical; errors still surface via sonner toast; a sign-in from `/login?returnUrl=/classes` lands on `/classes` (returnUrl round-trip preserved); `window.location.assign(validateReturnUrl(returnUrl))` full-page semantics preserved.
- [x] Design fidelity: side-by-side screenshot vs `auth-redesign.html` shows no visible deltas at 1280px (typography, spacing, colors, mock card, chips, progress bar).
- [x] A11y pass: tablist/tab/tabpanel roles correct, arrow-key nav with wrap, roving tabIndex, focus-visible ring on every control, password toggle announces state; hidden panel is not tabbable; no `aria-hidden` on visible content.
- [x] Responsive matrix 360/420/768/960/1280/1920: no horizontal scroll, ≤960px collapses per export (brand panel centers, mock/sub/head/foot hidden, mobile-brand row shown), ≤420px tighter padding + 24px title. (960px is the auth export's own boundary and deliberately diverges from the app-wide `--breakpoint-app: 921px`; use `max-[960px]:` arbitrary variants, do not touch the token.)
- [x] `pnpm check`, `pnpm check-types` (root script: vite build + tsc --noEmit), and `pnpm test` green; no new dependencies; no `packages/ui` changes.

## Red Team Review

### Session — 2026-08-20 (ak:vibe pipeline, autonomous)
**Reviewers:** Security Adversary (Fact Checker), Failure Mode Analyst (Flow Tracer), Assumption Destroyer (Scope Auditor) — 3 parallel hostile reviewers, tier Standard.
**Findings:** 14 deduplicated (14 accepted, 0 rejected)
**Severity breakdown:** 2 Critical, 3 High, 9 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Hard invariant described a nonexistent `navigate({to:"/dashboard"})`; real wiring is full-page `window.location.assign(validateReturnUrl(returnUrl))` with kernel-gate comment, locked by `kernel-runtime.contract.test.ts:146-165` | Critical | Accept | plan.md, phase-02 |
| 2 | `returnUrl` / `validateReturnUrl` / `validateSearch` system (open-redirect protection, deep-return) entirely absent from plan; Google callbackURL misquoted as hardcoded `/dashboard` | Critical | Accept | plan.md, phase-01, phase-02 |
| 3 | `--danger-strong` / `--success-strong` tokens don't exist in globals.css (export `:48-49`) — resolve via inline `color-mix` arbitrary utilities, keeping "no packages/ui edits" | High | Accept | plan.md, phase-02 |
| 4 | `pnpm check` runs Biome only; type-check is separate `pnpm check-types` script — add to all gates | High | Accept | plan.md, phase-02, phase-03 |
| 5 | Phase 3 fallback `key={mode}` remounts forms and wipes typed values — contradicts Phase 2 criterion "typed values survive tab switches" | High | Accept | phase-03 |
| 6 | "Exact mapping" quote (`filter(Boolean)` at `sign-in-form.tsx:93-97`) doesn't exist (actual: JSX map of all errors); ghost class `field-invalid-wrapper`; `errors[0]`-only display is an undocumented delta | Medium | Accept | phase-02 |
| 7 | `cubic-bezier(0.28,0,0,0.22,1)` has 5 args (invalid CSS) in 3 plan strings; correct is `cubic-bezier(0.28,0,0.22,1)` (= `--ease-standard`) | Medium | Accept | phase-02, phase-03 |
| 8 | Success-notice criterion "notice appears" contradicts admitted race with full-page `location.assign`; forbid artificial delay (export's 900ms is fake) | Medium | Accept | phase-02 |
| 9 | Breakpoint 960px diverges from documented app-wide `--breakpoint-app: 921px` (`globals.css:219`) without acknowledgment | Medium | Accept (documented as deliberate) | plan.md, phase-01 |
| 10 | Architecture self-contradiction: "Forms receive `onSwitchMode`" vs "forms no longer need switch props" | Medium | Accept | phase-02 |
| 11 | login.tsx rewrite specs never mention preserving `validateSearch` / `Route` config (3 `useSearch` consumers + contract test depend on it) | Medium | Accept | phase-01, phase-02 |
| 12 | `aria-hidden` on the visible mobile-brand row hides branding from screen readers (a11y anti-pattern; export doesn't hide it) | Medium | Accept | phase-01 |
| 13 | Line citations drifted vs working tree (login.tsx, globals.css, google-oauth-button.tsx, sign-in-form.tsx) — load-bearing ones corrected; cite by symbol going forward | Medium | Accept | plan.md, phase-01, phase-02 |
| 14 | No lock on tabs/switch line while a form `isSubmitting` — both-forms-mounted design opens a double-submit window with a hidden spinner | Medium | Accept | phase-02 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01-start.md, phase-02-auth-tabs-and-forms.md, phase-03-polish-and-verification.md
- Decision deltas checked: 14 (navigate→assign/returnUrl wiring, token color-mix substitution, check-types gate, key={mode} removal, mapping-quote correction, bezier fix, notice criterion softening, 960px divergence note, switch-prop contract, validateSearch preservation, aria-hidden removal, citation corrections, submitting lock)
- Reconciled stale references: all occurrences of `navigate(`, `var(--danger-strong)`, `var(--success-strong)`, `cubic-bezier(0.28,0,0,0.22,1)`, `onSwitchMode`, `key={mode}`, `aria-hidden` mobile-brand, and drifted citations were rewritten in the same session
- Unresolved contradictions: 0

## Related plans

- `plans/260819-2034-production-readiness` (pending) — touches infra, D1 drills, `/readyz`, UAT only. No file overlap with this plan; not blocking.

## Dependencies

None. Pure frontend page redesign: no API, database, or contract changes. `authClient` (`apps/web/src/lib/auth-client.ts:39-43`) is consumed as-is.

<!-- slug: redesign-login-sign-up-page -->
