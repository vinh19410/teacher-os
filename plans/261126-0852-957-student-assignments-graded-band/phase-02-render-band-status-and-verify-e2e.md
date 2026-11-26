---
phase: 2
title: "Phase 2: Render Band & status and verify E2E"
status: completed
priority: P1
effort: "1h15m"
dependencies: [1]
---

# Phase 2: Render Band & status and verify E2E

## Goal

Render graded Band (`formatBand(row.band)`) and `<StatusTag tone="ok">Đã chấm</StatusTag>` for graded `class` rows in `/teacher/students/$studentId` tab **Bài tập**, lock the full kernel-to-DOM flow with deterministic component and SPA E2E tests, and verify `pnpm design:compare` + 3-viewport/2-theme UI quality per `REVIEW.md`.

## Files to Create / Modify

- Modify: `apps/web/src/routes/_auth/students/$studentId.test.tsx`
- Modify: `apps/web/src/routes/_auth/students/$studentId.tsx`
- Modify: `apps/e2e/specs/teacher-grade-submission.spec.ts`

## Tasks & Steps

### Task 2.1 — Add failing TDD component integration tests for student detail tab `Bài tập`

<!-- Updated: Red-Team Session 1 - pin Date clock, use role="tab", typed KernelSnapshot factories, multi-student isolation, and proper beforeEach reset -->
- **Goal:** Exercise the full `snapshotFixture` → `DataProvider` → `mapKernelSnapshot` → `mapClassAssignments` → `studentAssignmentRows` → `assignmentRowCells` chain in `$studentId.test.tsx` with deterministic time and strict wire types.
- **Target files and symbols:** `apps/web/src/routes/_auth/students/$studentId.test.tsx` (`describe("student detail", ...)`).
- **Steps:**
  1. Add local typed factory helpers in `$studentId.test.tsx` matching `KernelSnapshot` wire contracts (`packages/api/src/contracts.ts:2000-2189`):
     - `promptRow(overrides)`: full 21-field `KernelAssignmentPromptRow` (same pattern as `makeReadyPrompt` in `apps/web/src/routes/_auth/classes/$classId.test.tsx`).
     - `classAssignmentRow(overrides)`: full `KernelClassAssignmentRow` with 5-field `targets` (`studentId, submittedAt, attemptId, gradedAt, band`).
     - `legacyAssignmentRow(overrides)`: `KernelAssignmentRow` using `studentId` (NOT `sid`).
  2. In each new tab `Bài tập` test (or nested `describe` with `vi.useFakeTimers({ toFake: ["Date"] })` + `vi.setSystemTime(new Date("2026-11-26T05:00:00.000Z"))` and `vi.useRealTimers()` in `afterEach`):
     - Call `vi.unstubAllGlobals()`, then `startKernelServer(snapshotFixture(...), notFoundPlacementHandler)`, then set `routerState.params = { studentId: "st-1" }`.
     - Render `<StudentDetail />` with `renderWithKernel`.
     - Click `await screen.findByRole("tab", { name: "Bài tập" })` (NOT `button`).
  3. Assert exact per-row Band cell (cell index 3) and Trạng thái cell (cell index 4) for every scenario:
     - Graded Writing assignments (`Homework 2` with `band: 5.5`, `Homework 3` with `band: 6.5`, and boundary `band: 0` with valid ISO `gradedAt`) render `"5.5"`, `"6.5"`, and `"0.0"` in Band and `"Đã chấm"` in Trạng thái.
     - Submitted ungraded class assignments (objective Reading quiz with `attemptId: "att-read"`, `band: null, gradedAt: null`; Writing submitted late after `due: "2026-11-20"`) render `"—"` in Band and preserve `"Đã nộp"` / `"Đã nộp · trễ hạn"`.
     - Unsubmitted class assignments (`due: "2099-12-31"` future vs `due: "2026-11-20"` past) render `"—"` and `"Chưa nộp"` / `"Chưa nộp · quá hạn"`.
     - Flip-first edge case (`due: "2026-11-20"` past due, `submittedAt: null`, `band: 5.5`, valid `gradedAt`) renders `"5.5"` in Band and `"Đã chấm"` in Trạng thái — never `"Chưa nộp · quá hạn"`.
     - Malformed/partial grade rows (`band: 6.5, gradedAt: null`, `band: 9.5` out-of-range, `gradedAt: "invalid"`) render `"—"` in Band and fall back to `studentSubmissionStatus`.
     - Multi-student isolation: on a shared `classAssignment` where `st-2` has `band: 8.0` + valid `gradedAt` and `st-1` has `submittedAt: "2026-11-25T10:00:00.000Z", band: null, gradedAt: null`, viewing `st-1` renders `"—"` and `"Đã nộp"` (never `"8.0"` or `"Đã chấm"`).
     - Legacy `kind: "grading"` row in `snapshot.assignments` preserves its link, averaged Band (`toFixed(1)`), and `"Đã chấm"` text.
  4. Do not edit `$studentId.tsx` yet.
- **Success criteria:** New tab `Bài tập` tests fail specifically on Band (`"—"` instead of `"5.5"`/`"6.5"`/`"0.0"`) and Trạng thái (`"Đã nộp"`/`"Chưa nộp · quá hạn"` instead of `"Đã chấm"`), NOT on missing tab selector or `notFound()`.
- **Verify:** `pnpm --filter web exec vitest run 'src/routes/_auth/students/$studentId.test.tsx'` exits non-zero with assertion failure on Band / `"Đã chấm"` (passing test is a failure in red phase).

### Task 2.2 — Update `assignmentRowCells` in `$studentId.tsx` to render Band and `"Đã chấm"` status

<!-- Updated: Red-Team Session 1 - use isBandStep + finite Date.parse in defensive type guard -->
- **Goal:** Display `formatBand(row.band)` and `<StatusTag tone="ok">Đã chấm</StatusTag>` for graded `class` rows in tab **Bài tập**, matching `/teacher/grading` and `ClassAssignmentsTab`.
- **Target files and symbols:** `apps/web/src/routes/_auth/students/$studentId.tsx` (`assignmentRowCells`, helper `hasGradedBand`, import `formatBand`, `isBandStep` from `@teacher-os/api/lib/ielts-band`).
- **Steps:**
  1. Import `formatBand, isBandStep` from `@teacher-os/api/lib/ielts-band`.
  2. Define a defensive type-guard helper (consistent with `studentAssignmentRows` validation):
     ```ts
     function hasGradedBand(
     	row: StudentAssignmentRow,
     ): row is StudentAssignmentRow & { band: number; gradedAt: string } {
     	return (
     		row.band !== null &&
     		isBandStep(row.band) &&
     		row.gradedAt !== null &&
     		row.gradedAt.trim().length > 0 &&
     		Number.isFinite(Date.parse(row.gradedAt))
     	);
     }
     ```
  3. In `assignmentRowCells`, inside `if (row.kind === "class")`:
     - Compute `const graded = hasGradedBand(row);`
     - Render Column 3 (Band):
       ```tsx
       graded ? (
       	<span className="font-semibold text-primary tabular-nums">
       		{formatBand(row.band)}
       	</span>
       ) : (
       	"—"
       )
       ```
     - Render Column 4 (Trạng thái):
       ```tsx
       graded ? (
       	<StatusTag tone="ok">Đã chấm</StatusTag>
       ) : (
       	<StatusTag tone={status.tone}>{status.label}</StatusTag>
       )
       ```
     - Keep Column 0 (plain title + className), Column 1 (`row.typeLabel ?? "—"`), Column 2 (`fmtDueDisplay(row.due, row.dueAt)`), and the entire `row.kind === "grading"` branch unchanged.
  4. Update the JSDoc comment above `assignmentRowCells` to describe the current behavior directly.
- **Success criteria:** All tests in `$studentId.test.tsx` and `student-assignments.test.ts` pass.
- **Verify:** `pnpm --filter web exec vitest run src/lib/repos/student-assignments.test.ts 'src/routes/_auth/students/$studentId.test.tsx'` exits 0.

### Task 2.3 — Extend E2E spec (SPA flow), capture opt-in POT screenshots, and run UI gates

<!-- Updated: Red-Team Session 1 - SPA navigation, unsubmitted row check, opt-in CAPTURE_POT_ISSUE with try/finally, restore #383 PNGs, add design:compare -->
- **Goal:** Prove end-to-end via SPA navigation that grading a Writing attempt on `/teacher/grading/$attemptId` updates `/teacher/students/$studentId` → tab **Bài tập** with `6.5` and `Đã chấm` (while the unsubmitted Speaking row stays `"—"` and `"Chưa nộp"`), capture 3-viewport × 2-theme POT screenshots cleanly via opt-in `CAPTURE_POT_ISSUE=957`, and pass `pnpm design:compare`, `pnpm check`, `pnpm check-types`, and `pnpm --filter web test`.
- **Target files and symbols:** `apps/e2e/specs/teacher-grade-submission.spec.ts` (inside test `"teacher grades a submitted writing essay and the student sees band and feedback"`).
- **Steps:**
  1. Right after verifying the class detail tab shows `"Đã chấm · Band 6.5"` (around line 262 of `apps/e2e/specs/teacher-grade-submission.spec.ts`), navigate **via SPA** (no `page.goto` reload) so `kernelQueryKey` invalidation is genuinely verified:
     - Click sidebar link `teacherPage.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Học viên", exact: true })`.
     - Click the student row `"Học Viên Chấm"` to open `/teacher/students/${fixture.studentId}`.
     - Click tab `teacherPage.getByRole("tab", { name: "Bài tập", exact: true })`.
     - Locate row `"Writing chấm: city life"` (`getByRole("row").filter({ hasText: "Writing chấm: city life" })`) and assert Band cell (`locator("td").nth(3)`) has text `"6.5"` and Status cell (`locator("td").nth(4)`) has text `"Đã chấm"`.
     - Locate row `"Speaking chấm: a place"` and assert Band cell (`locator("td").nth(3)`) has text `"—"` and Status cell (`locator("td").nth(4)`) has text `"Chưa nộp"`.
  2. Add an opt-in block gated by `if (process.env.CAPTURE_POT_ISSUE === "957")` wrapped in `try { ... } finally { /* restore light theme + 1280x720 */ }` (matching `student-placement-test.spec.ts` precedent) that verifies keyboard Tab/Enter focus on the tab control, zero horizontal overflow at `1440x900`, `768x1024`, `375x812`, and `320x812` across `light` and `dark` themes, and saves the 6 POT screenshots to `plans/reports/957-student-assignments-band-{desktop,tablet,phone}-{light,dark}.png`.
  3. Run the single E2E spec with `CAPTURE_POT_ISSUE=957` and isolated ports:
     `CAPTURE_POT_ISSUE=957 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts`
  4. Immediately restore the unrelated tracked screenshots touched by Test 3:
     `git checkout -- plans/reports/screenshots-383-grading-queue/`
  5. Run `pnpm design:compare` (or scoped to affected screen if supported; verify exit 0) and inspect the 6 generated POT screenshots in `plans/reports/957-student-assignments-band-*.png`.
  6. Run local quality gates: `pnpm check && pnpm check-types && pnpm --filter web test`.
- **Success criteria:** Single E2E spec passes via SPA navigation; all 3 viewports × 2 themes + 320px reflow pass with zero overflow; tracked `#383` PNGs are clean; `pnpm design:compare`, `pnpm check`, `pnpm check-types`, and `pnpm --filter web test` all exit 0.
- **Verify:**
  - `CAPTURE_POT_ISSUE=957 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts && git checkout -- plans/reports/screenshots-383-grading-queue/` exits 0.
  - `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.
  - `pnpm design:compare` exits 0.

## Verification

- `pnpm --filter web exec vitest run src/lib/repos/student-assignments.test.ts 'src/routes/_auth/students/$studentId.test.tsx'` exits 0.
- `pnpm --filter web test` exits 0.
- `pnpm check` exits 0.
- `pnpm check-types` exits 0.
- `CAPTURE_POT_ISSUE=957 E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 E2E_PROFILE_PORT=8105 pnpm --filter e2e e2e specs/teacher-grade-submission.spec.ts && git checkout -- plans/reports/screenshots-383-grading-queue/` exits 0.
- `pnpm design:compare` exits 0.

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
