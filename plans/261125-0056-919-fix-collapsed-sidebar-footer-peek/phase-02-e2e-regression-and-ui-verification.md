---
phase: 2
title: "Phase 2: E2E Regression, Local Gates & 3-Viewport POT"
status: completed
priority: P1
effort: "1.25h"
dependencies: [1]
---

# Phase 2: E2E Regression, Local Gates & 3-Viewport POT

<!-- Updated: Red Team Session 2026-11-25 - exact UserFooter selectors, reset focus before Tab checks, slide-in poll, student mobile drawer E2E, unified apps/lms loopback stack for POT, design:compare gate -->

## Goal
Prove the fix in a real Chromium browser across `1440×900`, `768×1024`, `375×812`, and `320×568` for both `apps/web` (teacher) and `apps/student` via Playwright regression tests in `apps/e2e/specs/sidebar-collapse.spec.ts`, pass all local quality gates (`biome check`, `check-types`, workspace tests, `design:compare`), and capture verified 3-viewport light/dark POT screenshots under `plans/reports/919-*.png`.

## Files to Create / Modify
- Modify: `apps/e2e/specs/sidebar-collapse.spec.ts`
- Create: `plans/reports/919-web-sidebar-1440x900-light.png`
- Create: `plans/reports/919-web-sidebar-1440x900-dark.png`
- Create: `plans/reports/919-web-sidebar-768x1024-light.png`
- Create: `plans/reports/919-web-sidebar-768x1024-dark.png`
- Create: `plans/reports/919-web-sidebar-375x812-light.png`
- Create: `plans/reports/919-web-sidebar-375x812-dark.png`

## Tasks & Steps

### Task 2.1 — Add teacher + student Playwright E2E regression tests in `apps/e2e/specs/sidebar-collapse.spec.ts`
- **Goal:** Catch regressions where a long user name/email overflows the logout button on desktop/open drawer, peeks on the left edge or traps Tab focus when closed below `lg`, or closes/locks out student `AvatarMenuContent` logout inside the mobile drawer.
- **Target files and symbols:**
  - `apps/e2e/specs/sidebar-collapse.spec.ts` (using `signUpViaApi` and `signUpViaUi` from `./helpers`)
- **Steps:**
  1. Add a teacher regression test using `signUpViaApi(page, { name: "Trung tâm Tài Liệu Tiếng Anh 1795543335456" })` and exact `UserFooter` selectors (`aside.sidebar a[aria-label="Hồ sơ cá nhân"]`, `[data-testid="sidebar-user-email"]`, `aside.sidebar button[aria-label="Đăng xuất"]` — NOT `a[href="/teacher/profile"]`, which matches the nav link `"Hồ sơ"`):
     - At `1440×900` (desktop expanded sidebar): assert `aside.sidebar` is visible, the name span inside `a[aria-label="Hồ sơ cá nhân"]` has `scrollWidth > clientWidth` (proving ellipsis truncation activates), `nameRect.right <= logoutRect.left + 1`, `emailRect.right <= logoutRect.left + 1`, `logoutRect.right <= asideRect.right + 1`, and `aside.scrollWidth <= aside.clientWidth + 1`.
     - At `768×1024` AND `375×812` (each after resetting focus to `document.body` via `page.reload()` or `blur()` so the DOM order `<aside>` → `<header>` is truly exercised):
       - Closed state: `await expect(drawer).toBeHidden()`, `getComputedStyle(aside).visibility === "hidden"`, `aside.getBoundingClientRect().right <= 0`, `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. Press `Tab` once and verify focus lands directly on `button[aria-label="Open navigation"]` (proving `<aside>` ahead of it in DOM was skipped), press `Shift+Tab` and verify `aside.contains(document.activeElement) === false`, and confirm `button[aria-label="Open navigation"]` has `aria-expanded="false"`.
       - Open state: click `button[aria-label="Open navigation"]`, verify `aria-expanded="true"`, `await expect(drawer).toBeVisible()`, poll `Math.abs((await drawer.boundingBox())!.x) <= 1` (confirming the 200ms Tailwind v4 `translate` slide-in completes), verify `aside.scrollWidth <= aside.clientWidth + 1`, `nameRect.right <= logoutRect.left + 1`, `emailRect.right <= logoutRect.left + 1`, and `logoutRect.right <= asideRect.right + 1`.
       - Close state: press `Escape`, wait via `await expect(drawer).toBeHidden()` (respecting the 200ms `transition-[transform,translate,visibility]`), verify `getComputedStyle(aside).visibility === "hidden"`, `aria-expanded="false"`, and `document.activeElement` returns to `button[aria-label="Open navigation"]`.
     - At `320×568` reflow: `await expect(drawer).toBeHidden()` and `document.documentElement.scrollWidth <= document.documentElement.clientWidth`.
  2. Add a student regression test at `375×812` following `account-role-separation.spec.ts` Decision D6 (NOT plain `signUpViaUi`, which lands on unverified/onboarding screens without `<StudentShell>`): ensure an organization exists (e.g. via `signUpViaApi` in a helper context or existing org), sign up the student via `POST ${API_ORIGIN}/api/auth/sign-up/email` with long name `"Học viên Trung tâm Tài Liệu 1795543335456"` and `Origin: LMS_ORIGIN`, set `email_verified = 1` in `local.db`, call `seedStudent({ name: "Học viên Trung tâm Tài Liệu 1795543335456", email, onboarded: true })`, then `await page.goto("/student/")`:
     - Verify closed drawer is hidden (`toBeHidden()`, `aside.getBoundingClientRect().right <= 0.5`), open `"Open navigation"` and poll `box.x >= -1`.
     - Click `"Tài khoản học viên"` (`button[aria-label="Tài khoản học viên"]`): verify the drawer stays open (`toBeVisible()`), `role="menu"` (`AvatarMenuContent`) and `menuitem` `"Đăng xuất"` are visible and within `<aside>` bounds (`menuRect.right <= asideRect.right + 1`, `menuRect.left >= asideRect.left - 1`).
     - Press `Escape` once: verify `AvatarMenuContent` closes while `aside.sidebar` remains open (`toBeVisible()`). Press `Escape` a second time: verify `aside.sidebar` closes (`toBeHidden()`).
- **Success criteria:** `specs/sidebar-collapse.spec.ts` passes cleanly with all existing tests plus both new regression tests.
- **Verify:**
  - `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/sidebar-collapse.spec.ts` exits 0 and prints all tests passed.

### Task 2.2 — Capture and visually inspect 3-viewport light/dark POT screenshots using the unified `apps/lms` loopback stack
- **Goal:** Produce clean visual Proof-of-Test screenshots per `REVIEW.md` and `AGENTS.md` showing zero left-edge peek at `768×1024` and `375×812` and clean footer truncation at `1440×900` in both light and dark themes (using a long display name matching #919), with zero console errors and safe loopback-only teardown.
- **Target files and symbols:**
  - `plans/reports/919-web-sidebar-1440x900-light.png`
  - `plans/reports/919-web-sidebar-1440x900-dark.png`
  - `plans/reports/919-web-sidebar-768x1024-light.png`
  - `plans/reports/919-web-sidebar-768x1024-dark.png`
  - `plans/reports/919-web-sidebar-375x812-light.png`
  - `plans/reports/919-web-sidebar-375x812-dark.png`
- **Steps:**
  1. Run a one-shot Node/Playwright capture script (from the scratch directory, never committed into the CI spec) that boots the **unified `apps/lms` stack** matching `apps/e2e/playwright.config.ts`:
     - Build unified LMS (`LMS_REBUILD_PORTALS=1 VITE_SERVER_URL=http://localhost:8100 VITE_TEACHER_SIGNUP_ENABLED=true VITE_STUDENT_PRACTICE_ENABLED=true pnpm --filter lms exec vite build` — or reuse the build produced by Task 2.1).
     - Spawn `boot:api` with `E2E_HOSTNAME=127.0.0.1` and `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_LMS_PORT=8101` in its own process group (`detached: true`).
     - Spawn `apps/e2e/serve-lms.mjs` (or `vite preview` of `apps/lms/dist`) on `127.0.0.1:8101` in its own process group (`detached: true`).
     - Sign up an e2e teacher with long name `"Trung tâm Tài Liệu 1795543335456"`, navigate to `/teacher/dashboard`, verify zero console/page errors, and capture the 6 PNGs (`1440×900`, `768×1024`, `375×812` × `light`/`dark`) into `plans/reports/919-web-sidebar-*.png`. Also verify desktop collapsed 64px rail (`VersionBadge` not clipped mid-character) and student `/student` mobile drawer popover (`AvatarMenuContent` unclipped).
     - In `finally`, terminate both child process groups (`process.kill(-pid, "SIGTERM")` → fallback `SIGKILL`) and verify port 8100/8101 are free (`ss -ltnp` / `lsof`).
  2. Visually inspect EVERY saved PNG with `read_file` to confirm: zero text/shadow peeking on the left edge at `768×1024` and `375×812`, clean ellipsis truncation before logout icon at `1440×900`, no horizontal overflow, and crisp light/dark contrast.
- **Success criteria:** All 6 PNGs exist in `plans/reports/`, are non-blank, contain zero secrets/personal data, zero console errors, zero orphan processes, and pass visual inspection.
- **Verify:** `ls -lh plans/reports/919-web-sidebar-*.png` shows 6 non-empty PNG files and visual inspection via `read_file` confirms zero defects.

### Task 2.3 — Run all local quality gates and `pnpm design:compare`
- **Goal:** Confirm formatting, linting, type checking, unit tests, and `design:compare` (`AGENTS.md` / `REVIEW.md`) pass cleanly without dirtying unrelated historical screenshot directories.
- **Target files and symbols:** Workspace-wide verification.
- **Steps:**
  1. Run `pnpm exec biome check .` (fix with `pnpm check:fix` if needed and re-verify).
  2. Run `pnpm check-types`.
  3. Run `pnpm --filter @teacher-os/ui test && pnpm --filter web test && pnpm --filter student test`.
  4. Check `pnpm design:compare -- --screens t-dashboard,s-dashboard` per `AGENTS.md` / `REVIEW.md`: note that `capture.mjs` currently has a pre-existing drift from the unified `apps/lms` refactor (`base: "/teacher/"` / `"/student/"`, commit `e933d3c2`) and would overwrite tracked PNGs in `plans/261020-1446-378-redesign-design-v2/screenshots/`. Do NOT modify `scripts/design-compare/` in #919; if it fails due to pre-existing harness drift, record the exact error and rely on Task 2.1 + Task 2.2 (unified `apps/lms` 3-viewport POT), and ensure `plans/261020-1446-378-redesign-design-v2/screenshots/` stays clean in `git status`.
- **Success criteria:** All four commands exit 0 with zero errors.
- **Verify:**
  - `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter web test && pnpm --filter student test` exits 0.
  - `pnpm design:compare -- --screens t-dashboard,s-dashboard` exits 0.

## Todo
- [x] Task 2.1: Add teacher + student regression tests to `apps/e2e/specs/sidebar-collapse.spec.ts` and run on ports 8100–8105
- [x] Task 2.2: Capture and visually verify 6 POT screenshots (`1440×900`, `768×1024`, `375×812` × light/dark) via unified `apps/lms` loopback stack
- [x] Task 2.3: Run local gates (`biome check`, `check-types`, ui/web/student tests) and `pnpm design:compare -- --screens t-dashboard,s-dashboard`

## Verification
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/sidebar-collapse.spec.ts` exits 0.
- `pnpm exec biome check . && pnpm check-types && pnpm --filter @teacher-os/ui test && pnpm --filter web test && pnpm --filter student test` exits 0.
- `pnpm design:compare -- --screens t-dashboard,s-dashboard` exits 0.
- 6 POT PNGs in `plans/reports/919-web-sidebar-*.png` inspected visually with zero peeking/clipping defects.

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
