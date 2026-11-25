---
title: "fix(web): collapsed sidebar footer text peeks on left edge at <= 768px viewports (#919)"
description: "Fix UserFooter CSS Grid horizontal overflow and contain/hide closed off-canvas AppShell sidebar drawer below lg (<1024px) across shared @teacher-os/ui shell."
status: completed
priority: P1
effort: "2.5h"
tags: [bugfix, ui, web, student, a11y, issue-919]
created: 2026-11-25
---

# fix(web): collapsed sidebar footer text peeks on left edge at <= 768px viewports (#919)

## Overview

When the shared `sidebar-07` `AppShell` (`packages/ui/src/components/app-shell/`) renders on viewports below `lg` (`< 1024px`, including `768×1024` and `375×812`) with a long user name/email (e.g. `"Trung tâm Tài Liệu 1795543335456"`), the trailing characters of the footer name and email peek onto the left edge of the viewport (`x >= 0`). On desktop `1440×900`, the same text overflows right across the logout button (`user.trailing`) and past `<aside>`.

Root cause (proven from `#914` screenshots and source):
1. **Primary layout overflow (`packages/ui/src/components/app-shell/user-footer.tsx:134-160`):** `TextBlock` uses `<span className="grid min-w-0 flex-1 leading-tight">` with implicit `grid-template-columns: auto`, and its first grid item `<span className="flex items-center font-medium">` lacks `min-w-0` and has `overflow: visible`. Its CSS Grid auto minimum width resolves to the unwrapped `white-space: nowrap` width of `user.name`, expanding the grid track past the container and pushing both `user.name` and `user.email` over `user.trailing` and outside `<aside>`.
2. **Off-canvas drawer containment, visibility & drawer interaction (`packages/ui/src/components/app-shell/app-shell.tsx:67-147`):**
   - `<aside>` lacks `overflow-hidden` and keeps `visibility: visible`, `pointer-events: auto`, and `shadow-lg` when `!mobileOpen` at `< lg`, allowing overflowing content/shadow to paint at `x >= 0` and leaving closed drawer controls in the Tab order and accessibility tree.
   - `AppShell` unconditionally wrapped `user.onClick` with `closeDrawer()` and `UserFooter` invoked `user.onClick?.()` even when `user.menu` exists (`app-shell.tsx:121-131`, `user-footer.tsx:89-92`). Once closed `<aside>` becomes `invisible pointer-events-none`, tapping `"Tài khoản học viên"` on `< 1024px` would immediately close and hide `AvatarMenuContent` (locking out student logout).
   - Opening the mobile drawer did not shift focus into `<aside>` or mark the backdrop-covered `<header>`/`<main>` wrapper `inert`, did not reset `mobileOpen` when resizing to `>= 1024px`, and shared `Escape` handling with child popovers (`TeamSwitcher`, `UserFooter`).
3. **Direct adjacent hardening (from Kongming + Red-Team reviews):**
   - Adding `overflow-hidden` on `<aside>` would clip `VersionBadge` (`apps/web/src/components/layout/app-shell.tsx:193`, ~58px wide inside `p-2 + px-2`) in the 64px collapsed desktop rail; add `collapsed && "lg:sr-only"` to its wrapper so `data-testid="app-version"` remains in DOM without mid-character clipping.
   - `TeamSwitcher` (`packages/ui/src/components/app-shell/team-switcher.tsx:69,116,125,143,147`) needs `grid-cols-1` on `headerRow`, `shrink-0` on `ChevronsUpDown`, org initials badge, and `<Check>`, plus `max-h-[calc(100svh-5rem)] overflow-y-auto` on `role="menu"`; `AvatarMenuContent` (`apps/student/src/components/layout/avatar-menu.tsx:36`) should use `w-full` instead of fixed `w-56`.

## Outcome & Scope Contract

- **Outcome:** On `<= 768px` (`< 1024px`) viewports when the mobile drawer is closed, zero sidebar content or shadow peeks onto the viewport and keyboard Tab skips the closed drawer. When the mobile drawer is open, focus moves into `<aside>`, the covered background is `inert`, Tailwind v4 200ms slide animation (`transition-[transform,translate,visibility]`) stays smooth, student `AvatarMenuContent` opens and logs out without collapsing the drawer, and `Escape` closes popovers before closing the drawer. On desktop (`1440×900`) and open drawers, long user names/emails truncate cleanly with ellipsis inside `TextBlock` without overlapping the logout button or chevron, and desktop 64px collapsed rail keeps `VersionBadge` unclipped (`lg:sr-only`) while preserving all DOM/E2E hooks.
- **Constraints:**
  - Do NOT add `aria-hidden={!mobileOpen}` or `inert={!mobileOpen}` on `<aside>` (breaks desktop `>= 1024px` accessibility/Playwright and jsdom unit tests).
  - Do NOT replace `invisible lg:visible` with `hidden lg:flex` (`display: none` breaks the 200ms slide transition), and MUST include `translate` in `transition-[transform,translate,visibility]` (Tailwind v4 compiles `translate-x-*` to CSS `translate`, not `transform`).
  - Preserve all E2E hooks (`aside.sidebar`, `sidebar-user-email`, `sidebar-avatar`, `sidebar-toggle`, `app-version`, `org-switcher-*`) and `apps/student` popovers (`AvatarMenuContent`, `TeamSwitcher`).
  - Follow `AGENTS.md`: do NOT run the full E2E suite locally; run only `specs/sidebar-collapse.spec.ts` with port overrides `8100–8105`, and bind ad-hoc `boot:api` strictly to `E2E_HOSTNAME=127.0.0.1`.
- **Non-Goals:**
  - No changes to `apps/admin` (`AdminShell` is a separate non-drawer layout).
  - No changes to unrelated navigation routes, auth logic, or design tokens in `packages/ui/src/styles/globals.css`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Fix `UserFooter` `TextBlock` truncation, student `user.menu` click behavior, and sibling `TeamSwitcher`/`AvatarMenuContent`/`VersionBadge` containment | P1 |
| 2 | Contain, visually/a11y-hide closed `<aside>` below `lg`, preserve Tailwind v4 slide transition, and isolate focus/`Escape`/resize for open mobile drawer | P1 |
| 3 | Lock regression with exact-token unit tests, teacher + student Playwright E2E (`sidebar-collapse.spec.ts`), `design:compare`, and 3-viewport light/dark POT screenshots | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Fix AppShell, UserFooter & Unit Tests (TDD)](./phase-01-start.md) | Completed |
| 2 | [Phase 2: E2E Regression, Local Gates & 3-Viewport POT](./phase-02-e2e-regression-and-ui-verification.md) | Completed |

## Success Criteria

- [x] Unit tests in `packages/ui/src/components/app-shell/user-footer.test.tsx` (6/6) and `apps/web/src/components/layout/app-shell.test.tsx` (13/13) pass using exact token (`classList.contains`) assertions, `hasAttribute("inert")`, `matchMedia("(min-width: 64rem)")`, and clean `localStorage` teardown; `apps/student/test/student-shell.test.tsx` and `apps/student/test/avatar-menu.test.tsx` pass unchanged (66/66 student test files, 640/640 tests).
- [x] `apps/e2e/specs/sidebar-collapse.spec.ts` passes (6/6) with new regression assertions at `1440×900`, `768×1024`, `375×812`, and `320×568` proving zero off-canvas peek, zero off-screen Tab focus (from reset focus), synchronous drawer focus on open (`toBeFocused()`), clean footer truncation without overlapping logout, and working student mobile drawer `AvatarMenuContent` / layered `Escape`.
- [x] `pnpm exec biome check .` (0 errors, 2,513 files), `pnpm check-types` (14/14 tasks), and workspace tests (`@teacher-os/ui` 23/23, `web` 213/213, `student` 66/66) pass with exit code 0; `pnpm design:compare` skipped due to pre-existing `base: "/teacher/"` harness drift from unified `apps/lms` commit `e933d3c2` without dirtying historical screenshots.
- [x] Visual POT screenshots at `1440×900` (light & dark), `768×1024` (light & dark), and `375×812` (light & dark) verified visually and saved under `plans/reports/919-web-sidebar-*.png`.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Fact Checker) — parallel independent subagents.
**Findings:** 8 deduplicated findings (2 Critical, 4 High, 2 Medium) — 8 accepted, 0 rejected.
**Severity breakdown:** 2 Critical, 4 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Tailwind v4 `transition-[transform,visibility]` omits CSS `translate`, breaking 200ms slide animation | Critical | Accept | `plan.md`, Phase 1 (Tasks 1.1, 1.3), Phase 2 (Task 2.1) |
| 2 | Student `AvatarMenuContent` / Logout locked out on `< 1024px` because `AppShell`/`UserFooter` calls `closeDrawer()` even when `user.menu` exists | Critical | Accept | `plan.md`, Phase 1 (Tasks 1.1–1.3), Phase 2 (Task 2.1) |
| 3 | Open mobile drawer focus leak behind backdrop (`inert`), resize `>= 1024px` state leak, and `Escape` conflict with child popovers | High | Accept | `plan.md`, Phase 1 (Tasks 1.1–1.3), Phase 2 (Task 2.1) |
| 4 | Phantom unit tests via `className.toContain` matching `lg:*` tokens + `localStorage` leak in `app-shell.test.tsx` | High | Accept | `plan.md`, Phase 1 (Task 1.1) |
| 5 | Task 2.2 `API+web` stack cannot serve `/student` or `/login` (needs unified `apps/lms`) and `boot:api` defaults to `::` instead of `127.0.0.1` | High | Accept | `plan.md`, Phase 2 (Task 2.2) |
| 6 | Task 2.1 Tab-skip phantom test across reused page, missing slide-in `x` stabilization poll, `a[href="/teacher/profile"]` selector trap, and missing `apps/student` E2E | High | Accept | Phase 2 (Task 2.1) |
| 7 | `TeamSwitcher` menu needs `max-h-[calc(100svh-5rem)] overflow-y-auto` + `<Check>` `shrink-0`; `AvatarMenuContent` should use `w-full` instead of fixed `w-56` | Medium | Accept | `plan.md`, Phase 1 (Task 1.2) |
| 8 | Missing `pnpm design:compare` gate required by `AGENTS.md` / `REVIEW.md` for UI PRs | Medium | Accept | `plan.md`, Phase 2 (Task 2.3) |

### Verification Results
- **Tier:** Light (1–2 phases, Fact Checker across both reviewers)
- **Claims checked:** 26 unique codebase claims
- **Verified:** 26 (all 3 prior failed claims — Tailwind v4 `translate` transition, `user.menu` `closeDrawer()` preservation, and unified `apps/lms` stack topology — resolved and reconciled) | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-e2e-regression-and-ui-verification.md`
- Decision deltas checked: 8
- Reconciled stale references: 8 (replaced all `transition-[transform,visibility]` with `transition-[transform,translate,visibility]`, removed stale `API+web` assumption, updated all unit/E2E criteria across both phases)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
- **Auto-validated:** Scope, technical approach, and all 8 Red-Team findings have unambiguous codebase/evidence resolutions (`Failed: 0`, `Unresolved contradictions: 0`); no open product/business decisions require user interruption under `/ak-vibe --ship --beta --advice`.
- **Kongming Checkpoint 2 (Plan Gate — Conditional GO, 5 empirical refinements applied):**
  1. `jsdom@26` does not implement `HTMLElement.prototype.inert` (`el.inert === undefined`); updated Phase 1 Task 1.1 to assert `hasAttribute("inert")`.
  2. Replaced capture-phase `stopPropagation()` on `document` (which would steal `Escape` from `CommandDialog` / `Modal`) with `document` bubble + `event.preventDefault()` (guarded against active modal/command dialogs) in `UserFooter`/`TeamSwitcher` and `window` bubble (`!event.defaultPrevented`) in `AppShell`.
  3. Guarded `menuButtonRef.current?.focus()` on close so it skips focus restore when closing via `matchMedia("(min-width: 1024px)")` resize.
  4. Updated Phase 2 Task 2.1 student E2E setup to use API sign-up + `email_verified = 1` + `seedStudent({ onboarded: true })` (instead of plain `signUpViaUi`, which lands on unverified/onboarding views without `<StudentShell>`).
  5. Documented `pnpm design:compare` pre-existing `base: "/teacher/"` drift from unified `apps/lms` refactor (`e933d3c2`) and rule against dirtying `plans/261020-1446-378-redesign-design-v2/screenshots/`.
- **Recommendation:** Proceed to issue tracking update and Phase 1 TDD implementation.

<!-- slug: 919-fix-collapsed-sidebar-footer-peek -->
