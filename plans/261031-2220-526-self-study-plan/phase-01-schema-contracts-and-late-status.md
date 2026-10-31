---
phase: 1
title: "Phase 1: Schema, Contracts & Late Status"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Schema, Contracts & Late Status

## Goal

Bổ sung schema Drizzle và migration SQL cho `self_study_plan`, `self_study_plan_day`, `self_study_plan_item` cùng 2 cột nullable `due_at` và `plan_item_id` trên `class_assignment`; mở rộng additive `packages/api/src/contracts.ts`, `packages/api/src/vietnam-date.ts` và nhãn sự kiện trong `apps/web/src/routes/_auth/notifications/index.tsx`; cập nhật `loadClassAssignmentItems` và `deriveAssignmentStatus` để ưu tiên `dueAt` và đối chiếu `quiz_attempt.submittedAt` khi xác định quá hạn / nộp trễ quanh mốc 17:00. <!-- Updated: Red Team RT-6 -->

## Files to Create / Modify

- Create: `packages/db/src/schema/self-study-plan.ts`
- Modify: `packages/db/src/schema/class-assignment.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/migrations/0059_self_study_plan.sql`
- Modify: `packages/db/src/migrations/meta/_journal.json`
- Modify: `packages/api/src/vietnam-date.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/web/src/routes/_auth/notifications/index.tsx`
- Modify: `apps/server/src/routes/student-class.ts`
- Modify: `apps/student/src/lib/assignment-status.ts`
- Modify: `apps/student/src/components/class/class-assignment-table.tsx`
- Modify: `apps/student/test/assignment-status.test.ts`

## Tasks & Steps

### Task 1.1 — Viết test TDD (Red) cho `deriveAssignmentStatus` với `dueAt` quanh mốc 17:00

- **Goal:** Tạo bộ test kiểm chứng tính trạng thái `"Quá hạn"` và `"Nộp trễ"` quanh mốc 16:59:59 / 17:00:00 / 17:00:01 theo `dueAt` trong `apps/student/test/assignment-status.test.ts`.
- **Target files and symbols:**
  - `apps/student/test/assignment-status.test.ts` (thêm `describe("deriveAssignmentStatus with dueAt (#526)", ...)`)
- **Steps:**
  1. Trong `apps/student/test/assignment-status.test.ts`, thêm các test case cho `deriveAssignmentStatus(assignment, todayISO, nowMs)` khi `assignment.dueAt` có mặt (ví dụ `"2026-11-02T10:00:00.000Z"` tức `17:00` giờ Việt Nam ngày `2026-11-02`):
     - Chưa nộp lúc `16:59:59+07:00` (`nowMs = Date.parse("2026-11-02T09:59:59.000Z")`, `todayISO = "2026-11-02"`): trả `status: "due-soon"`, `statusLabel: "Sắp đến hạn"`, `dueText` chứa `"17:00 02/11"`, không bị coi là quá hạn.
     - Chưa nộp đúng `17:00:00+07:00` (`nowMs = Date.parse("2026-11-02T10:00:00.000Z")`, `todayISO = "2026-11-02"`): trả `status: "overdue"`, `statusLabel: "Quá hạn"`, `sortOrder: 0`, `dueText` chứa `"17:00 02/11"` và tuyệt đối không chứa `"quá 0 ngày"`. <!-- Updated: Red Team RT-6 -->
     - Đã nộp đúng `17:00:00+07:00` (`submittedAt = "2026-11-02T10:00:00.000Z"`): không bị gắn nhãn trễ (`isLate: false`, `statusLabel: "Đã nộp"` cho Reading hoặc `"Đã nộp — Đang chờ giáo viên chấm"` cho Writing).
     - Đã nộp lúc `17:00:01+07:00` (`submittedAt = "2026-11-02T10:00:01.000Z"`): gắn nhãn trễ (`isLate: true`, `statusLabel: "Đã nộp · Trễ hạn"` cho Reading và `"Đã nộp trễ — Đang chờ giáo viên chấm"` cho Writing, `badgeClass: "bg-warn-soft text-warn"`).
     - Đã chấm có band nhưng nộp lúc `17:05:00+07:00` (`submittedAt > dueAt`): `status: "graded"`, `isLate: true`, `statusLabel: "Điểm: 7 · Nộp trễ"`.
- **Success criteria:** Test chạy và fail ở các assertion mới vì `deriveAssignmentStatus` chưa xử lý `dueAt` và `nowMs`.
- **Verify:** `pnpm --filter student test` exits non-zero (Red phase).

### Task 1.2 — Thêm schema Drizzle `self_study_plan`, cập nhật `class_assignment` và tạo migration `0059_self_study_plan.sql`

- **Goal:** Định nghĩa 3 bảng `self_study_plan`, `self_study_plan_day`, `self_study_plan_item` cùng partial unique index cho plan `published`, thêm `dueAt` và `planItemId` vào `class_assignment`, và tạo migration SQL `0059_self_study_plan.sql`.
- **Target files and symbols:**
  - `packages/db/src/schema/self-study-plan.ts` (`selfStudyPlan`, `selfStudyPlanDay`, `selfStudyPlanItem`, các hằng `SELF_STUDY_PLAN_STATUSES`, `SELF_STUDY_PLAN_DAY_STATUSES`)
  - `packages/db/src/schema/class-assignment.ts` (`classAssignment.dueAt`, `classAssignment.planItemId`)
  - `packages/db/src/schema/index.ts` (`export * from "./self-study-plan"`)
  - `packages/db/src/migrations/0059_self_study_plan.sql`
  - `packages/db/src/migrations/meta/_journal.json` (thêm entry `idx: 59`, `tag: "0059_self_study_plan"`)
- **Steps:**
  1. Tạo `packages/db/src/schema/self-study-plan.ts`:
     - `selfStudyPlan` (`"self_study_plan"`): `id`, `orgId`, `classId`, `title` (default `"Kế hoạch tự học"`), `startDate`, `endDate`, `releaseTime` (default `"06:00"`), `dueTime` (default `"17:00"`), `status` (`"draft" | "published" | "completed" | "cancelled"`, default `"draft"`), `publishedAt` (`timestamp_ms`), `completedAt` (`timestamp_ms`), `cancelledAt` (`timestamp_ms`), `createdAt` (`timestamp_ms`), `updatedAt` (`timestamp_ms`). Index trên `orgId`, `classId`, và partial unique index `self_study_plan_class_published_uq` trên `(classId) WHERE status = 'published'`.
     - `selfStudyPlanDay` (`"self_study_plan_day"`): `id`, `orgId`, `planId` (FK `selfStudyPlan.id` cascade), `date` (`YYYY-MM-DD`), `releaseAt` (`timestamp_ms` notNull), `dueAt` (`timestamp_ms` notNull), `status` (`"pending" | "released" | "skipped" | "missed"`, default `"pending"`), `holidayOverride` (`integer(..., { mode: "boolean" }).notNull().default(false)`), `warning` (`text("warning").notNull().default("")`), `notifiedAt` (`timestamp_ms`), `releasedAt` (`timestamp_ms`). Unique index `self_study_plan_day_plan_date_uq` trên `(planId, date)`, index `self_study_plan_day_pending_release_idx` trên `(status, releaseAt)`, index `self_study_plan_day_org_idx` trên `(orgId)`.
     - `selfStudyPlanItem` (`"self_study_plan_item"`): `id`, `orgId`, `planId` (FK `selfStudyPlan.id` cascade), `date` (`YYYY-MM-DD`), `promptId` (FK `assignmentPrompt.id` cascade), `position` (`integer("position").notNull().default(0)`), `note` (`text("note").notNull().default("")`). Unique index `self_study_plan_item_plan_date_prompt_uq` trên `(planId, date, promptId)` và index `self_study_plan_item_plan_date_idx` trên `(planId, date, position)`.
  2. Trong `packages/db/src/schema/class-assignment.ts`, thêm `dueAt: integer("due_at", { mode: "timestamp_ms" })` và `planItemId: text("plan_item_id")` vào `classAssignment`, kèm index `class_assignment_plan_item_idx` trên `(table.planItemId)`. Giữ nguyên kiểu `due: text("due").notNull()`.
  3. Export `./self-study-plan` trong `packages/db/src/schema/index.ts`.
  4. Tạo `packages/db/src/migrations/0059_self_study_plan.sql` và cập nhật `packages/db/src/migrations/meta/_journal.json` (`idx: 59`, `tag: "0059_self_study_plan"`).
- **Success criteria:** Schema và migration biên dịch sạch và chạy được trên libsql migrator.
- **Verify:** `pnpm --filter @teacher-os/db check-types` exits 0.

### Task 1.3 — Mở rộng `vietnam-date.ts`, `contracts.ts`, `notifications/index.tsx`, `student-class.ts` và `deriveAssignmentStatus` (Green)

- **Goal:** Bổ sung helper giờ Việt Nam trong `packages/api/src/vietnam-date.ts`, các schema additive trong `packages/api/src/contracts.ts`, nhãn `self_study_released` trong `apps/web/src/routes/_auth/notifications/index.tsx`, trả `dueAt` và `quizAttempt.submittedAt` trong `loadClassAssignmentItems`, và hoàn thiện `deriveAssignmentStatus` để toàn bộ test ở Task 1.1 xanh. <!-- Updated: Red Team RT-6 -->
- **Target files and symbols:**
  - `packages/api/src/vietnam-date.ts` (`vietnamDateTimeMs`, `vietnamWallClockOffsetMs`, `formatVietnamTimeHHMM`, `daysBetweenInclusiveISO`)
  - `packages/api/src/contracts.ts` (`NOTIFICATION_EVENT_TYPES`, `NOTIFICATION_EVENT_GROUP_BY_TYPE`, `studentAssignmentSchema`, `MAX_SELF_STUDY_DAYS`, `MAX_SELF_STUDY_ITEMS_PER_DAY`, `selfStudyPlanCreateSchema`, `selfStudyPlanUpdateHoursSchema`, `selfStudyPlanDayPatchSchema`, `selfStudyPlanReleaseMissedSchema`, `SelfStudyPlanDetailResponse`)
  - `apps/web/src/routes/_auth/notifications/index.tsx` (`EVENT_TYPE_LABELS.self_study_released`)
  - `apps/server/src/routes/student-class.ts` (`loadClassAssignmentItems`)
  - `apps/student/src/lib/assignment-status.ts` (`deriveAssignmentStatus`)
  - `apps/student/src/components/class/class-assignment-table.tsx` (`ClassAssignmentTable`)
- **Steps:**
  1. Trong `packages/api/src/vietnam-date.ts`:
     - Thêm `vietnamDateTimeMs(dateISO: string, timeHHMM: string): number` trả `Date.parse(`${dateISO}T${timeHHMM}:00+07:00`)`.
     - Thêm `vietnamWallClockOffsetMs(timeHHMM: string): number` tính `((hh * 60 + mm) - 7 * 60) * 60 * 1000` (offset tính từ `00:00:00Z` của `dateISO`, dùng cho câu lệnh SQL `UPDATE` tính lại `release_at` và `due_at`).
     - Thêm `formatVietnamTimeHHMM(dateOrIso: Date | string | number): string` trả `HH:MM` theo múi giờ `Asia/Ho_Chi_Minh`.
     - Thêm `daysBetweenInclusiveISO(startISO: string, endISO: string): number` tính số ngày từ `startISO` đến `endISO` (inclusive).
  2. Trong `packages/api/src/contracts.ts`:
     - Thêm `"self_study_released"` vào `NOTIFICATION_EVENT_TYPES` và ánh xạ `self_study_released: "assignment"` trong `NOTIFICATION_EVENT_GROUP_BY_TYPE`.
     - Trong `studentAssignmentSchema`, thêm `dueAt: z.string().nullable().optional()`.
     - Thêm các hằng và schema additive cho Self Study Plan: `MAX_SELF_STUDY_DAYS = 366`, `MAX_SELF_STUDY_ITEMS_PER_DAY = 10`, `selfStudyPlanItemInputSchema`, `selfStudyPlanDayInputSchema`, `selfStudyPlanCreateSchema`, `selfStudyPlanUpdateHoursSchema`, `selfStudyPlanDayPatchSchema`, `selfStudyPlanReleaseMissedSchema`, và kiểu trả về `SelfStudyPlanDetailResponse`.
  3. Trong `apps/web/src/routes/_auth/notifications/index.tsx`, thêm `self_study_released: "Bài tự học"` vào `EVENT_TYPE_LABELS`. <!-- Updated: Red Team RT-6 -->
  4. Trong `apps/server/src/routes/student-class.ts` (`loadClassAssignmentItems`):
     - Bổ sung `eq(quizAttempt.orgId, orgId)` vào điều kiện `leftJoin(quizAttempt, ...)`. <!-- Updated: Red Team RT-4 -->
     - Chọn thêm `dueAt: classAssignment.dueAt`, `attemptStatus: quizAttempt.status`, và `attemptSubmittedAt: quizAttempt.submittedAt`.
     - Tính `submittedAt`: ưu tiên `(row.attemptStatus === "submitted" && row.attemptSubmittedAt) ? row.attemptSubmittedAt.toISOString() : (row.submittedAt ?? null)`.
     - Trả `dueAt: row.dueAt ? row.dueAt.toISOString() : null`.
  5. Trong `apps/student/src/lib/assignment-status.ts` và `apps/student/src/components/class/class-assignment-table.tsx`:
     - Cập nhật `deriveAssignmentStatus(assignment: StudentAssignment, todayISO: string = vietnamTodayISO(), nowMs: number = Date.now()): DerivedAssignmentStatus` (thêm `isLate?: boolean` vào `DerivedAssignmentStatus`).
     - Khi `assignment.dueAt` có giá trị hợp lệ (`dueAtMs = Date.parse(assignment.dueAt)`):
       - Định dạng `dueTimeAndDate = "${formatVietnamTimeHHMM(dueAtMs)} ${formatDayMonth(assignment.due || vietnamDateKeyOf(new Date(dueAtMs)))}"` cho `dueText` ở tất cả các nhánh (`graded`, `submitted`, `overdue`, `due-soon`, `not-submitted`).
       - Nếu đã nộp (`assignment.submittedAt`): tính `isLate = Date.parse(assignment.submittedAt) > dueAtMs`. Khi `bandScore != null` trả `statusLabel: isLate ? "Điểm: ${bandScore} · Nộp trễ" : "Điểm: ${bandScore}"`; khi `assignment.gradedAt` trả `isLate ? "Đã chấm · Nộp trễ" : "Đã chấm"`; khi chờ chấm hoặc tự chấm trả `isLate ? (needsTeacherGrading ? "Đã nộp trễ — Đang chờ giáo viên chấm" : "Đã nộp · Trễ hạn") : (needsTeacherGrading ? "Đã nộp — Đang chờ giáo viên chấm" : "Đã nộp")` và `badgeClass: isLate ? "bg-warn-soft text-warn" : "bg-success-soft text-success"`.
       - Nếu chưa nộp: khi `nowMs >= dueAtMs` trả `status: "overdue"`, `statusLabel: "Quá hạn"`, `sortOrder: 0`, và nếu `diff < 0` thì `dueText: "Hạn: ${dueTimeAndDate} · quá ${Math.abs(diff)} ngày"`, ngược lại (`diff === 0` cùng ngày sau 17:00) thì `dueText: "Hạn: ${dueTimeAndDate} · quá hạn"` (không bao giờ trả `"quá 0 ngày"`). <!-- Updated: Red Team RT-6 -->
- **Success criteria:** Toàn bộ unit test của `apps/student` và typecheck của `packages/api`, `packages/db`, `apps/student` đều pass.
- **Verify:** `pnpm --filter student test && pnpm --filter @teacher-os/api check-types && pnpm --filter student check-types` exits 0.

## Verification

- `pnpm --filter student test` exits 0.
- `pnpm --filter @teacher-os/db check-types && pnpm --filter @teacher-os/api check-types && pnpm --filter student check-types` exits 0.

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
