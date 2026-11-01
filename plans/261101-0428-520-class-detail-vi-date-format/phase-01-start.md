---
phase: 1
title: "Phase 1: TDD Class Detail Tab Localization, Date Formatting & Caller Migration"
status: completed
priority: P3
effort: "1h"
dependencies: []
---

# Phase 1: TDD Class Detail Tab Localization, Date Formatting & Caller Migration

<!-- Updated: Red Team & Validation Session 1 - Guarded empty cls.startDate, added legacy/empty/?tab= unit assertions, added deterministic Từ 04/01/2027 + 3-viewport + keyboard focus E2E checks in projected-sessions.spec.ts, added class-operations.spec.ts and mechanical grep to Verify, and quoted $classId paths -->

## Goal

Localize the teacher class detail default tab label to `"Buổi học & luyện tập"` and format the student `<StatCard>` `startDate` subtitle as `"Từ dd/mm/yyyy"` via `cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined`, updating all unit test, E2E spec, and documentation callers.

## Overview

1. **`apps/web/src/routes/_auth/classes/$classId.test.tsx` & `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` (TDD Red)**:
   - Update tab name expectations and helper clicks from `"Sessions & practice"` to `"Buổi học & luyện tập"`.
   - Assert that legacy `startDate: "01/08"` renders `"Từ 01/08"`, ISO `startDate: "2026-11-03"` renders `"Từ 03/11/2026"` (`dd/mm/yyyy`, never `"Từ 2026-11-03"`), empty `startDate: ""` omits the `"Từ"` subtitle, and legacy `?tab=assignments` selects the `"Buổi học & luyện tập"` tab (`aria-selected="true"`).
2. **`apps/web/src/routes/_auth/classes/$classId.tsx` & `apps/web/src/components/class-detail/class-sessions-section.tsx` (TDD Green)**:
   - Import `fmtDue` from `"@/components/assignments/assignment-status"` in `$classId.tsx`.
   - Change line 260 from ``sub={`Từ ${cls.startDate}`}`` to ``sub={cls.startDate.trim() ? `Từ ${fmtDue(cls.startDate)}` : undefined}``.
   - Change line 280 from `{ id: "sessions-practice", label: "Sessions & practice" }` to `{ id: "sessions-practice", label: "Buổi học & luyện tập" }`.
   - Update the JSDoc comment in `apps/web/src/components/class-detail/class-sessions-section.tsx:38` to reference `"Buổi học & luyện tập"`.
3. **E2E Specs, Helpers & Docs Migration**:
   - Replace all occurrences of `Sessions & practice` (both quoted and unquoted in test titles/comments) with `Buổi học & luyện tập` across all 13 files in `apps/e2e/specs/`.
   - In `apps/e2e/specs/projected-sessions.spec.ts` (which seeds fixed `START = "2027-01-04"`), assert deterministic `"Từ 04/01/2027"` visibility, zero `"Từ 2027-01-04"` matches, keyboard focus on `"Buổi học & luyện tập"`, and zero horizontal overflow across 3 viewports (`1440×900`, `768×1024`, `375×812`).
   - In `apps/e2e/specs/class-assign.spec.ts`, assert `/^Từ \d{2}\/\d{2}\/\d{4}$/` visibility on the class detail stat card.
   - Update `DESIGN.md`, `.cursor/skills/verify-teacher-os/SKILL.md`, and `.cursor/skills/verify-teacher-os/features/enroll-activate-student.md`.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/classes/$classId.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`
- Modify: `apps/web/src/routes/_auth/classes/$classId.tsx`
- Modify: `apps/web/src/components/class-detail/class-sessions-section.tsx`
- Modify: `apps/e2e/specs/helpers.ts`
- Modify: `apps/e2e/specs/class-assign.spec.ts`
- Modify: `apps/e2e/specs/class-operations.spec.ts`
- Modify: `apps/e2e/specs/class-roster-tuition-debt.spec.ts`
- Modify: `apps/e2e/specs/class-sessions-manage-modal.spec.ts`
- Modify: `apps/e2e/specs/enroll-existing-student.spec.ts`
- Modify: `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`
- Modify: `apps/e2e/specs/notifications-ac-001.spec.ts`
- Modify: `apps/e2e/specs/projected-sessions.spec.ts`
- Modify: `apps/e2e/specs/self-study-plan.spec.ts`
- Modify: `apps/e2e/specs/session-occurrence.spec.ts`
- Modify: `apps/e2e/specs/syllabus-class-curriculum.spec.ts`
- Modify: `apps/e2e/specs/syllabus-test-session-mark.spec.ts`
- Modify: `DESIGN.md`
- Modify: `.cursor/skills/verify-teacher-os/SKILL.md`
- Modify: `.cursor/skills/verify-teacher-os/features/enroll-activate-student.md`

## Requirements

- [x] Write failing unit tests (TDD Red) in `apps/web/src/routes/_auth/classes/$classId.test.tsx` and `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` for the `"Buổi học & luyện tập"` tab label, `"Từ 03/11/2026"` formatted `startDate` subtitle, legacy `"01/08"` passthrough, empty `""` subtitle omission, and `?tab=assignments` tab selection.
- [x] Implement the tab label localization and `cls.startDate.trim() ? \`Từ ${fmtDue(cls.startDate)}\` : undefined` date formatting in `apps/web/src/routes/_auth/classes/$classId.tsx` (TDD Green).
- [x] Migrate all E2E specs, helpers, comments, and docs from `Sessions & practice` to `Buổi học & luyện tập`, add the deterministic `"Từ 04/01/2027"`, keyboard focus, and 3-viewport checks in `apps/e2e/specs/projected-sessions.spec.ts` plus the `/^Từ \d{2}\/\d{2}\/\d{4}$/` check in `apps/e2e/specs/class-assign.spec.ts`, and verify with unit tests, typecheck, lint, grep gate, and Playwright E2E.

## Tasks & Steps

### Task 1.1 — Add TDD Red unit tests for `"Buổi học & luyện tập"` tab label and `dd/mm/yyyy` `startDate` stat subtitle
- **Goal**: Update `$classId.test.tsx` and `$classId.sessions.test.tsx` to expect the Vietnamese tab label `"Buổi học & luyện tập"`, formatted `"Từ 03/11/2026"` subtitle, legacy/empty `startDate` handling, and `?tab=assignments` selection so the tests fail against the unpatched route.
- **Target files and symbols**:
  - `apps/web/src/routes/_auth/classes/$classId.test.tsx` (`describe("class detail tabs")`, `openSessionsTab`)
  - `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx` (`openSessionsTab`)
- **Steps**:
  1. In `apps/web/src/routes/_auth/classes/$classId.test.tsx` (using original pre-edit line numbers):
     - At line 360 (in `"adds a lesson from the class without offering to change its kind"`), change `{ name: "Sessions & practice" }` to `{ name: "Buổi học & luyện tập" }`.
     - At line 230 (in `openSessionsTab`), change `{ name: "Sessions & practice" }` to `{ name: "Buổi học & luyện tập" }`.
     - In `describe("class detail tabs")` (lines 162–175), update the first test to:
       ```tsx
       it("offers Buổi học & luyện tập, roster, curriculum, vocab and notes — sessions & assignments merged (#391, #520)", async () => {
         startKernelServer(twoClasses());
         renderWithKernel(<ClassDetail />);
         const tabs = await screen.findAllByRole("tab");
         expect(tabs.map((t) => t.textContent)).toEqual([
           "Buổi học & luyện tập",
           "Học viên",
           "Giáo trình",
           "Từ vựng",
           "Ghi chú",
         ]);
         expect(screen.getByText("Từ 01/08")).toBeTruthy();
       });
       ```
     - Add two tests inside `describe("class detail tabs")`:
       ```tsx
       it("formats ISO startDate as dd/mm/yyyy in the student stat card subtitle and omits empty startDate (#520)", async () => {
         startKernelServer(
           snapshotFixture({
             classes: [
               classRow({
                 id: "cl-1",
                 name: "IELTS Writing",
                 startDate: "2026-11-03",
               }),
               classRow({
                 id: "cl-2",
                 name: "IELTS Speaking",
                 startDate: "",
               }),
             ],
           }),
         );
         renderWithKernel(<RerenderableClassDetail />);
         expect(await screen.findByText("Từ 03/11/2026")).toBeTruthy();
         expect(screen.queryByText("Từ 2026-11-03")).toBeNull();

         routerState.params = { classId: "cl-2" };
         fireEvent.click(screen.getByTestId("rerender"));
         await screen.findByRole("heading", { name: "IELTS Speaking" });
         expect(screen.queryByText("Từ")).toBeNull();
         expect(screen.queryByText(/^Từ \d/)).toBeNull();
       });

       it("selects Buổi học & luyện tập when opened with legacy ?tab=assignments (#391, #520)", async () => {
         routerState.search = { tab: "assignments" };
         startKernelServer(twoClasses());
         renderWithKernel(<ClassDetail />);
         const tab = await screen.findByRole("tab", {
           name: "Buổi học & luyện tập",
         });
         expect(tab.getAttribute("aria-selected")).toBe("true");
       });
       ```
  2. In `apps/web/src/routes/_auth/classes/$classId.sessions.test.tsx`:
     - Update `openSessionsTab` (line 121) and `"blocks check-in while the curriculum removal is still saving"` (line 206) from `{ name: "Sessions & practice" }` to `{ name: "Buổi học & luyện tập" }`.
- **Success criteria**: Running Vitest on `$classId.test.tsx` and `$classId.sessions.test.tsx` fails because the route still renders `"Sessions & practice"`, `"Từ 2026-11-03"`, and `"Từ "`.
- **Verify**:
  - `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx' 'src/routes/_auth/classes/$classId.sessions.test.tsx'` exits non-zero with assertion failure (TDD Red; passing test is a failure).

### Task 1.2 — Implement `"Buổi học & luyện tập"` tab label and `fmtDue(cls.startDate)` subtitle in `$classId.tsx` (TDD Green)
- **Goal**: Update `apps/web/src/routes/_auth/classes/$classId.tsx` (and the JSDoc comment in `class-sessions-section.tsx`) so all unit tests in Task 1.1 pass.
- **Target files and symbols**:
  - `apps/web/src/routes/_auth/classes/$classId.tsx` (`ClassDetailRoute`)
  - `apps/web/src/components/class-detail/class-sessions-section.tsx` (`ClassSessionsSection` JSDoc)
- **Steps**:
  1. In `apps/web/src/routes/_auth/classes/$classId.tsx`:
     - Import `fmtDue` from `"@/components/assignments/assignment-status"`.
     - At line 260, replace ``sub={`Từ ${cls.startDate}`}`` with ``sub={cls.startDate.trim() ? `Từ ${fmtDue(cls.startDate)}` : undefined}``.
     - At line 280, replace `{ id: "sessions-practice", label: "Sessions & practice" }` with `{ id: "sessions-practice", label: "Buổi học & luyện tập" }`.
  2. In `apps/web/src/components/class-detail/class-sessions-section.tsx`:
     - At line 38, update `* Tab "Sessions & practice" — cột Sessions (#391):` to `* Tab "Buổi học & luyện tập" — cột Sessions (#391, #520):`.
- **Success criteria**: Both unit test files (`$classId.test.tsx` and `$classId.sessions.test.tsx`) pass completely.
- **Verify**:
  - `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx' 'src/routes/_auth/classes/$classId.sessions.test.tsx'` exits 0.

### Task 1.3 — Migrate E2E specs, helpers, and documentation references to `"Buổi học & luyện tập"`
- **Goal**: Update all Playwright E2E specs/helpers and documentation files that reference `Sessions & practice` so zero stale references remain outside historical `plans/**` and `CHANGELOG.md`, and verify with E2E tests (including 3 viewports + keyboard focus) and repo-wide checks.
- **Target files and symbols**:
  - `apps/e2e/specs/helpers.ts` (`openClassScheduleTab`)
  - `apps/e2e/specs/class-assign.spec.ts`
  - `apps/e2e/specs/class-operations.spec.ts`
  - `apps/e2e/specs/class-roster-tuition-debt.spec.ts`
  - `apps/e2e/specs/class-sessions-manage-modal.spec.ts`
  - `apps/e2e/specs/enroll-existing-student.spec.ts`
  - `apps/e2e/specs/manual-student-and-trial-grading.spec.ts`
  - `apps/e2e/specs/notifications-ac-001.spec.ts`
  - `apps/e2e/specs/projected-sessions.spec.ts`
  - `apps/e2e/specs/self-study-plan.spec.ts`
  - `apps/e2e/specs/session-occurrence.spec.ts`
  - `apps/e2e/specs/syllabus-class-curriculum.spec.ts`
  - `apps/e2e/specs/syllabus-test-session-mark.spec.ts`
  - `DESIGN.md`
  - `.cursor/skills/verify-teacher-os/SKILL.md`
  - `.cursor/skills/verify-teacher-os/features/enroll-activate-student.md`
- **Steps**:
  1. Replace every occurrence of `Sessions & practice` (both inside string literals and unquoted inside test names/comments) with `Buổi học & luyện tập` across all 13 files under `apps/e2e/specs/` (`helpers.ts:204,216`, `class-assign.spec.ts:88,90,128,144`, `class-operations.spec.ts:28,29,77,79,128,135,150,190,211,225`, `class-roster-tuition-debt.spec.ts:73,157`, `class-sessions-manage-modal.spec.ts:111`, `enroll-existing-student.spec.ts:268`, `manual-student-and-trial-grading.spec.ts:87,91`, `notifications-ac-001.spec.ts:163`, `projected-sessions.spec.ts:5,42,44,104,122`, `self-study-plan.spec.ts:97,242`, `session-occurrence.spec.ts:3,58,87,126,151`, `syllabus-class-curriculum.spec.ts:150`, `syllabus-test-session-mark.spec.ts:185,210`).
  2. In `apps/e2e/specs/projected-sessions.spec.ts` (around lines 42–46, where `START = "2027-01-04"` is seeded), assert deterministic `dd/mm/yyyy` formatting (`"Từ 04/01/2027"`), keyboard focus on the `"Buổi học & luyện tập"` tab, and zero horizontal overflow across 3 viewports (`1440×900`, `768×1024`, `375×812`):
     ```ts
     const sessionsTab = page.getByRole("tab", {
       name: "Buổi học & luyện tập",
       exact: true,
     });
     await sessionsTab.click();
     await sessionsTab.focus();
     await expect(sessionsTab).toBeFocused();
     await expect(page.getByText("Từ 04/01/2027", { exact: true })).toBeVisible();
     await expect(page.getByText("Từ 2027-01-04")).toHaveCount(0);
     for (const vp of [
       { width: 1440, height: 900 },
       { width: 768, height: 1024 },
       { width: 375, height: 812 },
     ]) {
       await page.setViewportSize(vp);
       await expect(sessionsTab).toBeVisible();
       await expect(
         page.getByText("Từ 04/01/2027", { exact: true }),
       ).toBeVisible();
       const overflow = await page.evaluate(
         () =>
           document.documentElement.scrollWidth >
           document.documentElement.clientWidth,
       );
       expect(overflow, `Overflow at ${vp.width}x${vp.height}`).toBe(false);
     }
     await page.setViewportSize({ width: 1280, height: 720 });
     ```
     And in `apps/e2e/specs/class-assign.spec.ts` (after line 86 `await expect(page.getByText("Trên 0 bài đã giao")).toBeVisible();`), add `await expect(page.getByText(/^Từ \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();`.
  3. In `DESIGN.md` (at the end of `## Lệch có chủ đích so với design v2 — trang chi tiết lớp teacher (#391)`, after line 167), append the following bullet (without embedding the old English tab string):
     ```markdown
     - **Nhãn tab đầu tiên Việt hóa thành "Buổi học & luyện tập" và ngày mở lớp định dạng `Từ dd/mm/yyyy` (#520)**: đồng nhất tiếng Việt cho dải 5 tab của trang chi tiết lớp (giữ nguyên `id: "sessions-practice"` trên URL) và format `cls.startDate` qua `fmtDue` trên thẻ stat học viên.
     ```
  4. In `.cursor/skills/verify-teacher-os/SKILL.md:65` and `.cursor/skills/verify-teacher-os/features/enroll-activate-student.md:27`, replace `Sessions & practice` with `Buổi học & luyện tập`.
- **Success criteria**: Zero matches for `Sessions & practice` remain in `apps/`, `packages/`, `scripts/`, `DESIGN.md`, or `.cursor/`; typecheck, biome check, unit tests, and Playwright E2E specs pass.
- **Verify**:
  - `! grep -rn "Sessions & practice" apps packages scripts DESIGN.md .cursor` exits 0.
  - `pnpm check-types && pnpm exec biome check . && pnpm --filter web test` exits 0.
  - Ensure ports `8100/8101/8103/8104/8105` are free, then run `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/projected-sessions.spec.ts specs/class-assign.spec.ts specs/class-operations.spec.ts` (exits 0).

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

## Verification

- `pnpm --filter web exec vitest run 'src/routes/_auth/classes/$classId.test.tsx' 'src/routes/_auth/classes/$classId.sessions.test.tsx'` exits 0.
- `! grep -rn "Sessions & practice" apps packages scripts DESIGN.md .cursor` exits 0.
- `pnpm check-types && pnpm exec biome check . && pnpm --filter web test` exits 0.
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/projected-sessions.spec.ts specs/class-assign.spec.ts specs/class-operations.spec.ts` exits 0.
