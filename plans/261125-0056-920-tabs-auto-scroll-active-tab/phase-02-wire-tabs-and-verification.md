---
phase: 2
title: "Phase 2: Wire Tabs in Web & Student + Verification (TDD)"
status: completed
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Wire Tabs in Web & Student + Verification (TDD)

## Goal

Wire `useScrollActiveTab` into both `apps/web/src/components/ui/tabs.tsx` and `apps/student/src/components/ui/tabs.tsx`, prove behavior with component TDD tests and SSR checks, pass all workspace quality gates, and verify real mobile/tablet/desktop rendering + light/dark themes in Chromium via unified `apps/lms`.

## Files to Create / Modify

- Create: `apps/web/src/components/ui/tabs-scroll.test.tsx`
- Modify: `apps/student/test/class-primitives.test.tsx`
- Modify: `apps/web/src/components/ui/tabs.tsx`
- Modify: `apps/student/src/components/ui/tabs.tsx`
- Existing (keep SSR `node` coverage intact): `apps/web/src/components/ui/tabs.test.tsx`

## Requirements

<!-- Updated: Red-Team Review - fix unified 2-port LMS setup (/teacher & /student), loopback binding, VITE_SERVER_URL, non-phantom student check, keyboard focus check, 1px tolerance, and POT hygiene -->
- Preserve exact `TabsProps` interfaces, class names, `role="tablist"`, `role="tab"`, `aria-selected`, `aria-label`, `data-testid`, and direct `<button>` children inside `<div role="tablist">` (required by `[&>button]:` selector in `apps/web/src/components/vocab/vocab-library-dialog.tsx:608`).
- Keep `apps/web/src/components/ui/tabs.test.tsx` running in vitest's default `node` environment (`renderToStaticMarkup`) with zero React SSR warnings on stderr.
- Verify horizontal auto-scroll on mount, on `active` change (with and without `prefers-reduced-motion: reduce`), and on viewport resize in both `apps/web` and `apps/student`, using pre-render prototype stubs in jsdom and restoring all original property descriptors in `afterEach`.
- Verify visually in Playwright using the repository's unified 2-port E2E architecture (`E2E_API_PORT=8100`, `E2E_LMS_PORT=8101`, `E2E_HOSTNAME=127.0.0.1`, `HOST=127.0.0.1`, `VITE_SERVER_URL=http://localhost:8100`, `LMS_REBUILD_PORTALS=1`) across `1440×900`, `768×1024`, `375×812` (+ `320px` reflow check), light & dark themes, and keyboard focus (`Tab` + `Enter`/`Space` + focus ring per `REVIEW.md`), confirming:
  - Deep-linked `/teacher/classes/<classId>?tab=notes` (6 tabs) shows `Ghi chú` fully inside the tablist at `375×812` (`tabRect.left >= listRect.left - 1` and `tabRect.right <= listRect.right + 1`, `tablist.scrollLeft > 0`), `window.scrollY === 0`, and zero page horizontal overflow (`<= 1px`).
  - Resizing `/teacher/classes/<classId>?tab=notes` from `1440×900` → `768×1024` → `375×812` → `320×812` keeps the active tab horizontally visible (`expect.poll` with `1px` tolerance).
  - Non-phantom student verification: open `/student/classes/<classId>` at `1440×900` (all 4 tabs fit, `scrollLeft === 0`), click `"Tài liệu chung"`, call `window.scrollTo(0, 0)`, then resize viewport to `375×812` — assert via `expect.poll` that `tablist.scrollLeft > 0`, `tabRect.right <= listRect.right + 1`, AND `window.scrollY === 0` (proving below-the-fold `<Tabs>` scrolls horizontally on resize without hijacking vertical scroll).
  - Use synthetic `*.e2e.invalid` accounts only, validate every saved PNG is non-blank (via `assertNonBlankPngFile` / pixel check), never print auth/mail tokens, and clean up temporary servers and scratch scripts.
  - Note on `pnpm design:compare`: this change adds behavioral horizontal scroll with zero visual/token/layout changes on default tab 0; `design:compare` targets `plans/261020-1446-378-redesign-design-v2` static design screens and is not mutated here (documented in PR/completion report).

## Tests Before (Red Phase)

### Task 2.1 — Add failing jsdom component auto-scroll tests for `web` and `student` `Tabs`
- **Goal:** Prove with failing tests that neither `apps/web` nor `apps/student` `Tabs` currently scrolls an off-screen active tab into view on mount, active change, or resize.
- **Target files and symbols:**
  - Create `apps/web/src/components/ui/tabs-scroll.test.tsx` (`// @vitest-environment jsdom`) importing `Tabs` from `./tabs`.
  - Modify `apps/student/test/class-primitives.test.tsx` (`describe("Tabs (student v2 primitive)")`) adding auto-scroll test cases.
- **Steps:**
  1. In both test files, add a scoped helper that stubs `HTMLElement.prototype.scrollTo`, `scrollWidth`, `clientWidth`, and `getBoundingClientRect` (branching on `this.getAttribute("role")` / `textContent` / `aria-selected`) **before** calling `render()`, sets explicit `paddingLeft`/`paddingRight` when testing insets, and restores every original property descriptor in `afterEach` (so sibling `describe` blocks in `class-primitives.test.tsx` are never polluted).
  2. Create `apps/web/src/components/ui/tabs-scroll.test.tsx` (`// @vitest-environment jsdom`) covering:
     - Mounting `<Tabs>` with 6 tabs (matching teacher class detail) and `active="notes"` where the active tab sits beyond the right edge of `role="tablist"` calls `tablist.scrollTo({ left: expectedLeft, behavior: "instant" })` and never calls `activeTab.scrollIntoView`.
     - Updating `active` calls `tablist.scrollTo` with `behavior: "smooth"` normally and `behavior: "instant"` under `prefers-reduced-motion: reduce`.
     - Resizing `tablist` via `ResizeObserver` (`clientWidth` shrinking from desktop to mobile) brings the clipped active tab into view with `behavior: "instant"`.
     - Direct children of `role="tablist"` remain `<button>` elements (no wrapper `<div>`).
  3. In `apps/student/test/class-primitives.test.tsx`, add tests inside `describe("Tabs (student v2 primitive)")` verifying:
     - Mounting `<Tabs>` with an off-screen right-side active tab (`"materials"`) scrolls the `role="tablist"` container horizontally with `behavior: "instant"` without calling `scrollIntoView`.
     - Switching `active` scrolls horizontally respecting `prefers-reduced-motion`.
     - Resizing the tablist width scrolls the active tab horizontally into view with `behavior: "instant"`.
- **Success criteria:** New tests fail on `expect(scrollToSpy).toHaveBeenCalledWith(...)` (not `TypeError`) because `Tabs` in `apps/web` and `apps/student` do not yet call `useScrollActiveTab`.
- **Verify:** `pnpm --filter web exec vitest run src/components/ui/tabs-scroll.test.tsx` exits non-zero with assertion failure, and `pnpm --filter student exec vitest run test/class-primitives.test.tsx` exits non-zero with assertion failure (passing either before Task 2.2 is a failure).

## Implementation

### Task 2.2 — Wire `useScrollActiveTab` into `apps/web` and `apps/student` `Tabs`
- **Goal:** Connect `useScrollActiveTab` cleanly to both `Tabs` components while preserving every prop, class name, and DOM invariant.
- **Target files and symbols:**
  - Modify `apps/web/src/components/ui/tabs.tsx` (function `Tabs`).
  - Modify `apps/student/src/components/ui/tabs.tsx` (function `Tabs`).
- **Steps:**
  1. In `apps/web/src/components/ui/tabs.tsx`:
     - Import `createTabsSignature` and `useScrollActiveTab` from `@teacher-os/ui/hooks/use-scroll-active-tab`.
     - Compute `const tabsSignature = createTabsSignature(tabs);`.
     - Call `const { tablistRef, activeTabRef } = useScrollActiveTab(active, tabsSignature);`.
     - Attach `ref={tablistRef}` to `<div role="tablist" ...>`.
     - Attach `ref={t.id === active ? activeTabRef : undefined}` directly to `<button type="button" role="tab" ...>`.
     - Do not change props, class names, or wrap `<button>` children.
  2. In `apps/student/src/components/ui/tabs.tsx`:
     - Import `createTabsSignature` and `useScrollActiveTab` from `@teacher-os/ui/hooks/use-scroll-active-tab`.
     - Compute `const tabsSignature = createTabsSignature(tabs);`.
     - Call `const { tablistRef, activeTabRef } = useScrollActiveTab(active, tabsSignature);`.
     - Attach `ref={tablistRef}` to `<div role="tablist" ...>`.
     - Attach `ref={t.id === active ? activeTabRef : undefined}` directly to `<button type="button" role="tab" ...>`.
     - Do not change props, `ariaLabel`, `testIdPrefix`, class names, or wrap `<button>` children.
- **Success criteria:** Both `web` and `student` component tests pass, and `apps/web/src/components/ui/tabs.test.tsx` (`node` SSR env) continues to pass with zero stderr warnings.
- **Verify:** `pnpm --filter web exec vitest run src/components/ui/tabs.test.tsx src/components/ui/tabs-scroll.test.tsx && pnpm --filter student exec vitest run test/class-primitives.test.tsx` exits 0.

## Tests After & Regression Gate

### Task 2.3 — Run workspace lint, typecheck, and test gates
- **Goal:** Confirm zero regressions across the monorepo.
- **Target files and symbols:** Workspace-wide (`@teacher-os/ui`, `web`, `student`, and root gates).
- **Steps:**
  1. Run `pnpm exec biome check .` (read-only lint/format check) and verify `--diagnostic-level=info` on all touched files has 0 diagnostics.
  2. Run `VITE_SERVER_URL=http://localhost:8000 pnpm check-types` across the monorepo (matching `.github/workflows/quality.yml:22-23` so Turbo's `web#build`/`student#build` deps have a valid URL).
  3. Run `pnpm test` across the monorepo (unit/integration tests; never full E2E).
- **Success criteria:** All three commands exit 0 with zero errors or skipped assertions.
- **Verify:** `pnpm exec biome check . && VITE_SERVER_URL=http://localhost:8000 pnpm check-types && pnpm test` exits 0.

### Task 2.4 — Visual, responsive & keyboard verification (unified LMS 2-port stack + POT screenshots)
- **Goal:** Verify real browser behavior at `1440×900`, `768×1024`, `375×812` (+ `320px` reflow) in light and dark modes + keyboard focus on teacher (`/teacher/classes/<classId>?tab=notes`) and student (`/student/classes/<classId>`) pages, and capture non-blank POT screenshots under `plans/reports/`.
- **Target files and symbols:** Read-only runtime verification via a temporary Playwright script in scratch directory (cleaned up/outside repo) against isolated loopback ports `8100`/`8101`, and screenshot outputs in `plans/reports/920-tabs-*.png`.
- **Steps:**
  1. Assert ports `8100` and `8101` are free before booting (fail loud if occupied — never reuse an existing dev server).
  2. Build unified `apps/lms` with `VITE_SERVER_URL=http://localhost:8100 VITE_TEACHER_SIGNUP_ENABLED=true VITE_STUDENT_PRACTICE_ENABLED=true LMS_REBUILD_PORTALS=1 pnpm --filter lms exec vite build`.
  3. Spawn `E2E_API_PORT=8100 E2E_LMS_PORT=8101 E2E_HOSTNAME=127.0.0.1 pnpm --filter e2e run boot:api` and `PORT=8101 HOST=127.0.0.1 pnpm --filter lms run serve` inside a `try/finally` + signal-handler wrapper with process-group teardown (`killProcessGroup` semantics).
  4. Seed synthetic accounts (`*.e2e.invalid`, `"E2E Teacher"`, `"E2E Student"`) and a dated class with an enrolled student via existing E2E helpers/endpoints (`signUpViaApi`, `seedDatedClass`, `seedStudent`, `acceptEnrollment`, `verifyStudentEmailFromMailLog` — never logging `verifyUrl` or tokens).
  5. In headless Chromium:
     - **Teacher deep-link mount (`375×812`, light & dark):** Navigate directly to `http://localhost:8101/teacher/classes/<classId>?tab=notes`. Assert active `"Ghi chú"` tab (`aria-selected="true"`) is fully within `role="tablist"` (`tabRect.left >= listRect.left - 1` and `tabRect.right <= listRect.right + 1`), `tablist.scrollLeft > 0`, `window.scrollY === 0`, and page horizontal overflow `<= 1px`.
     - **Teacher viewport resize + keyboard focus:** Open `http://localhost:8101/teacher/classes/<classId>?tab=notes` at `1440×900`, resize to `768×1024`, then `375×812`, then `320×812` — assert via `expect.poll` that `"Ghi chú"` remains within `role="tablist"` bounds (`1px` tolerance) and page overflow `<= 1px`. Verify `Tab` focuses tabs with visible `:focus-visible` ring and `Enter`/`Space` activates a tab.
     - **Student below-the-fold resize (non-phantom):** Open `http://localhost:8101/student/classes/<classId>` at `1440×900` (4 tabs fit, `scrollLeft === 0`), click `"Tài liệu chung"`, call `window.scrollTo(0, 0)`, then resize to `375×812` — assert via `expect.poll` that `tablist.scrollLeft > 0`, active `"Tài liệu chung"` satisfies `tabRect.right <= listRect.right + 1`, AND `window.scrollY === 0` (proving zero vertical hijack). Also verify `768×1024`, `320×812` reflow, and dark mode.
     - Capture screenshots to `plans/reports/920-tabs-*.png` (3 viewports + light/dark) and validate every PNG via `assertNonBlankPngFile` from `scripts/design-compare/harness-lib.mjs`.
  6. Tear down both temporary servers in `finally` and verify ports `8100` and `8101` have zero lingering listeners.
- **Success criteria:** Every browser assertion passes, every captured PNG passes non-blank validation and visually shows the active tab scrolled cleanly into view, zero PII/tokens appear in logs or images, and zero orphan processes remain.
- **Verify:** Verification script exits 0, `ls plans/reports/920-tabs-*.png` lists all expected screenshots, and `ss -ltn | grep -E ':(8100|8101)\b'` returns no listeners.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
