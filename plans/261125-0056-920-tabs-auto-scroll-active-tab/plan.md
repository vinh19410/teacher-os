---
title: "Auto-scroll active tab into view in horizontally scrollable Tabs"
description: "Automatically keep the active tab horizontally visible inside overflow-x-auto Tabs in web and student apps on mount, tab change, and viewport resize."
status: completed
priority: P2
effort: "2h"
issue: 920
branch: vinh19410/feat-ui-auto-scroll-active-tab-into-view-in-hori
tags: [feature, frontend, ui]
blockedBy: []
blocks: []
created: 2026-11-25
---

# Auto-scroll active tab into view in horizontally scrollable Tabs (#920)

## Overview

When a horizontally scrollable `Tabs` bar (`overflow-x-auto`) holds 5–6 tabs on narrow viewports (`375×812` or `320px`), opening a deep-linked URL (such as `/teacher/classes/$classId?tab=notes`) or resizing the viewport leaves the active `aria-selected="true"` tab clipped or off-screen until the user manually swipes. This plan adds a shared horizontal-only scroll hook (`@teacher-os/ui/hooks/use-scroll-active-tab`) and wires it into both `apps/web/src/components/ui/tabs.tsx` and `apps/student/src/components/ui/tabs.tsx` without ever hijacking vertical page scroll or breaking SSR/direct-child CSS selectors.

## Advisor Scope Lock (`--advice`)

- **Locked Scope:**
  - Create shared pure geometry helper + React hook in `packages/ui/src/hooks/use-scroll-active-tab.ts` with comprehensive jsdom unit tests in `packages/ui/src/hooks/use-scroll-active-tab.test.tsx`.
  - Wire `useScrollActiveTab` into `apps/web/src/components/ui/tabs.tsx` and `apps/student/src/components/ui/tabs.tsx` using horizontal-only container scrolling (`tablist.scrollTo({ left, behavior })` with `try/catch` + `tablist.scrollLeft` fallback), respecting `prefers-reduced-motion: reduce` (`"instant"`), initial mount `"instant"`, subsequent active-tab change `"smooth"`/`"instant"`, `document.fonts.ready` realignment, mid-flight smooth cancellation, dynamic tab label change realignment, and rAF-coalesced width-changing `ResizeObserver` events (`"instant"`).
  - Add component regression tests (`apps/web/src/components/ui/tabs-scroll.test.tsx` in jsdom, keep `apps/web/src/components/ui/tabs.test.tsx` in `node` SSR env, and extend `apps/student/test/class-primitives.test.tsx`).
  - Run local quality gates (`pnpm exec biome check .`, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, targeted + full unit tests) and verify visually across 3 viewports (`1440×900`, `768×1024`, `375×812` + `320px` reflow, light & dark themes, keyboard focus) on unified `apps/lms` (`8100`/`8101` loopback) with non-blank Playwright POT screenshots saved in `plans/reports/`.
- **Explicit Non-Goals:**
  - Do not merge or consolidate `Tabs` into `@teacher-os/ui/components/tabs.tsx` or `web-kit/tabs.tsx`.
  - Do not modify `apps/admin/src/components/library/card-tabs.tsx` (`flex-wrap`, not horizontally scrollable), auth tabs (`apps/lms/src/components/auth/auth-tabs.tsx`, `apps/web/src/components/auth/auth-tabs.tsx`, `apps/student/src/components/auth/auth-tabs.tsx`), or custom tablists (`apps/student/src/components/history/history-list.tsx`, `apps/student/src/components/placement/placement-test-runner.tsx`).
  - Do not alter URL search-param handling in `apps/web/src/routes/_auth/classes/$classId.tsx`, add roving arrow-key `tabIndex`, add scroll-fade gradients, or implement RTL `scrollLeft` mirroring.
  - Do not run the full E2E suite locally (`AGENTS.md` operational rule).

## Handover Note

This plan is **handover-ready** (`--tdd --advice`). Every phase decomposes into self-contained ordered tasks with exact target files/symbols, mechanical `Verify` pass conditions (including red-phase failure conditions), and its own literal **Failure Protocol** block. Stopping immediately on any failed `Verify` step to consult `kongming` is intended behavior, not a stall.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Core Hook & Horizontal Scroll Geometry (TDD)](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Wire Tabs in Web & Student + Verification (TDD)](./phase-02-wire-tabs-and-verification.md) | Completed |

## Success Criteria

- [x] Deep-linking `/teacher/classes/$classId?tab=notes` (or any right-half tab) on `375×812` renders with the active tab fully visible inside the `role="tablist"` viewport (`tabRect.left >= listRect.left - 1` and `tabRect.right <= listRect.right + 1`, `tablist.scrollLeft > 0`) and `window.scrollY === 0` (no vertical page jump).
- [x] Resizing the viewport from `1440×900` / `768×1024` to `375×812` while a right-half tab is active automatically scrolls that tab horizontally into view in both teacher (`/teacher/classes/$classId?tab=notes`) and below-the-fold student (`/student/classes/$classId` with `"Tài liệu chung"` selected before resize) while keeping `window.scrollY === 0`.
- [x] Switching `active` after mount scrolls `"smooth"` when motion is allowed and `"instant"` when `prefers-reduced-motion: reduce` is active; initial mount, dynamic label changes, webfont ready, and viewport resize always use `"instant"`.
- [x] Re-rendering a parent that passes a fresh inline `tabs={[...]}` array literal does not snap or override a user's manual horizontal swipe when `active` and tab `[id, label]` pairs have not changed.
- [x] Direct `<button>` children of `role="tablist"` and existing `TabsProps` contracts are preserved in both apps (no breakage of `[&>button]:` selectors or `node` SSR `renderToStaticMarkup` tests).
- [x] `pnpm exec biome check .`, `VITE_SERVER_URL=http://localhost:8000 pnpm check-types`, and `pnpm test` pass with zero errors, and 3-viewport + light/dark + keyboard focus visual verification passes cleanly.

## Red Team Review

### Session — 2026-11-25
**Reviewers:** Security Adversary (Fact Checker) + Assumption Destroyer (Fact Checker)
**Findings:** 11 deduplicated (11 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 8 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Task 2.4 used legacy 3-port split (`8100/8101/8103`) & bare `/classes/...` URLs instead of unified `apps/lms` 2-port stack (`8100/8101`, `/teacher/` & `/student/`) | Critical | Accept | `plan.md`, Phase 2 Task 2.4 |
| 2 | `pnpm --filter <pkg> test -- <file>` drops file filter under pnpm 10 | High | Accept | Phase 1 Tasks 1.1–1.2, Phase 2 Tasks 2.1–2.2 |
| 3 | Unpinned wildcard bind (`"::"`) exposes `/__e2e/*` backdoors during Task 2.4 | High | Accept | Phase 2 Task 2.4 (`E2E_HOSTNAME=127.0.0.1`, `HOST=127.0.0.1`, process-group teardown) |
| 4 | Missing `VITE_SERVER_URL` in Task 2.3 (`check-types` -> `build`) & Task 2.4 (`LMS_REBUILD_PORTALS=1`) | High | Accept | `plan.md`, Phase 2 Tasks 2.3–2.4 |
| 5 | POT screenshot PII/token hygiene, synthetic fixtures, and non-blank PNG check | High | Accept | Phase 2 Task 2.4 |
| 6 | Missed `scrollWidth` growth on `@fontsource/be-vietnam-pro` swap & dynamic tab labels (`placement-test`), uncoalesced `ResizeObserver` during `AppShell` transition, and `\u0000` delimiter collision | High | Accept | Phase 1 Requirements & Tasks 1.1–1.2, Phase 2 Task 2.2 |
| 7 | Phantom student verification on mount (tab 0) & Playwright `.click()` auto-scrolling before React effect | High | Accept | `plan.md`, Phase 2 Task 2.4 |
| 8 | Missing `container.contains`, `parsePx` NaN guard, `matchMedia?.matches`, `scrollTo` `try/catch`, and pre-render jsdom prototype stub restoration | High | Accept | Phase 1 Tasks 1.1–1.2, Phase 2 Task 2.1 |
| 9 | Mid-flight `"smooth"` animation not cancelled when `active` changes to temporarily visible tab | High | Accept | Phase 1 Requirements & Tasks 1.1–1.2 |
| 10 | Unspecified `useEffect` vs `useIsomorphicLayoutEffect`, `"auto"` vs `"instant"` reduced-motion bypass, `0px` float tolerance, and `REVIEW.md` keyboard focus check | Medium | Accept | Phase 1 Task 1.2, Phase 2 Task 2.4 |
| 11 | Inaccurate `noUncheckedIndexedAccess`/`useExhaustiveDependencies` gate claim and ambiguous `auth-tabs.tsx` non-goal paths | Medium | Accept | `plan.md`, Phase 1 Requirements & Task 1.3 |

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-wire-tabs-and-verification.md`
- Decision deltas checked: 11
- Reconciled stale references: 11 (unified 2-port URLs, `exec vitest run`, `"instant"` behavior, `createTabsSignature`, `VITE_SERVER_URL`, non-phantom student check, accurate tsconfig/biome gates)
- Unresolved contradictions: 0

## Validation Log

### Session 1 — 2026-11-25
**Trigger:** Mandatory `/ak-plan validate` gate in `ak-vibe` pipeline after Red-Team revisions
**Questions asked:** 0 (issue #920 scope, constraints, and non-goals are unambiguous; all 11 red-team findings were deterministic engineering/correctness fixes)

### Verification Results
- **Tier:** Light (2 phases — Fact Checker)
- **Claims checked:** 13 (across Phase 1 & Phase 2 + post-red-team updates)
- **Verified:** 13 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-wire-tabs-and-verification.md`
- Decision deltas checked: 11
- Reconciled stale references: 0 remaining
- Unresolved contradictions: 0

<!-- slug: 920-tabs-auto-scroll-active-tab -->
