---
phase: 1
title: "Phase 1: Data & Risk Logic (TDD)"
status: done
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Data & Risk Logic (TDD)

## Goal

Cập nhật `apps/web/src/lib/dashboard-from-kernel.ts` để thống nhất mốc ngày theo giờ Việt Nam (`Asia/Ho_Chi_Minh`), `atRiskRows` chỉ trả đúng 2 loại vấn đề (`missed-check-in` và `overdue-assignment`), xử lý đúng buổi dated quá khứ/tương lai/`date: ""`, chống cờ giả `attemptId != null`, loại trừ lớp tạm dừng, và chuyển ngôn ngữ helper sang góc nhìn giáo viên (`buổi dạy`).

## Files to Create / Modify

- Modify: `apps/web/src/lib/dashboard-from-kernel.ts` (`lessonDayFromDate`, `DashboardRiskReason`, `atRiskRows`, `formatDashboardLead`)
- Modify: `apps/web/src/lib/dashboard-from-kernel.test.ts` (unit tests TDD với fixture ngày ISO neo `+07:00`)

## Tasks & Steps

### Task 1.1 — Viết test TDD (Red phase) cho `lessonDayFromDate`, `atRiskRows` và `formatDashboardLead`

<!-- Updated: Red Team Session 1 - Neo fixture Date theo +07:00, thêm case date:"", attemptId!=null, legacy paused filter, và ranh giới múi giờ 00:00-06:59 VN -->

- **Goal:** Tạo bộ test bất biến với múi giờ máy, đặc tả hành vi mới của `lessonDayFromDate`, `atRiskRows` (2 loại `missed-check-in` + `overdue-assignment`, bỏ `absent`, vá dated future/`date: ""`, bài tập quá hạn chưa nộp vs đã nộp/có `attemptId`, lớp tạm dừng, legacy `assignments` `status === "late"`) và `"buổi dạy"` trong `formatDashboardLead`.
- **Target files and symbols:** `apps/web/src/lib/dashboard-from-kernel.test.ts` (hằng ngày đầu file, `describe("lessonDayFromDate", ...)`, `describe("atRiskRows", ...)`, `describe("formatDashboardLead", ...)`, `describe("paused classes filter (#694)", ...)`).
- **Steps:**
  1. Đổi các hằng thời gian đầu file `apps/web/src/lib/dashboard-from-kernel.test.ts:14-16` và dòng `:711` từ `new Date(year, month, day, ...)` (phụ thuộc TZ máy) sang chuỗi ISO neo giờ VN tường minh:
     - `const monday = new Date("2026-08-17T12:00:00+07:00");`
     - `const wednesday = new Date("2026-08-19T12:00:00+07:00");`
     - `const sunday = new Date("2026-08-23T12:00:00+07:00");`
     - và trong `#694`: `const wed = new Date("2026-10-07T10:00:00+07:00");`
  2. Thêm test trong `describe("lessonDayFromDate", ...)` chứng minh tại `2026-08-19T18:00:00Z` (= `2026-08-20 01:00+07:00`, Thứ Năm giờ VN dù UTC vẫn Thứ Tư), `lessonDayFromDate` trả `4` (nhất quán với `todayISOVietnam`).
  3. Thêm helper tạo `ClassAssignment` mẫu (`id`, `classId: "cl-1"`, `promptId: "pr-1"`, `title: "Essay"`, `due: "2026-08-18"`, `dueAt: null`, `note: ""`, `createdAt: "2026-08-10T00:00:00Z"`, `targets: []`) và `Assignment` legacy mẫu.
  4. Cập nhật `describe("atRiskRows", ...)`:
     - Giữ kiểm tra bỏ qua mock `atRisk` / `tags` và `upcoming` hôm nay không bị gắn cờ.
     - Thay các case kỳ vọng `reasons: ["absent"]` bằng test chứng minh buổi `status: "absent"` hoặc `attendance: "unexcused"` trong 14 ngày KHÔNG xuất hiện trong `atRiskRows`.
     - Thêm test cho `missed-check-in` trên buổi dated:
       - `date < todayISO` (`"2026-08-18"` khi `now = wednesday`, hoặc `"2026-08-14"` khi `now = monday`) + `status: "upcoming"` → có `missed-check-in`.
       - `date > todayISO` dù `day < today` (`date: "2026-08-24"`, `day: 1` khi `now = wednesday`) + `status: "upcoming"` → KHÔNG có `missed-check-in`.
       - `date === todayISO` + `status: "upcoming"` → KHÔNG có `missed-check-in`.
       - `date: ""` (chuỗi rỗng không hợp lệ) + `day: 5` (`> today = 3`) → rơi về nhánh legacy, KHÔNG bị gắn cờ `missed-check-in`; `date: ""` + `day: 1` (`< today = 3`) → có `missed-check-in`.
     - Giữ test buổi legacy `date: null`: `day < today` → `missed-check-in`; Thứ Hai không wrap Chủ Nhật.
     - Thêm test cho `overdue-assignment`:
       - `classAssignment` có `target.submittedAt === null` (và `attemptId: null`) + `due < todayISO` (khi `dueAt: null`) hoặc `nowMs >= Date.parse(dueAt)` (khi có `dueAt`) → có `overdue-assignment`.
       - `classAssignment` chưa quá hạn (`due >= todayISO` hoặc `nowMs < dueAtMs`) → KHÔNG gắn cờ.
       - `classAssignment` đã nộp trễ (`target.submittedAt !== null`) → KHÔNG gắn cờ.
       - `classAssignment` có `target.submittedAt === null` nhưng `target.attemptId: "att-1"` (lỗi D1 flip-first) → KHÔNG gắn cờ.
       - Gộp đúng 2 lý do `["missed-check-in", "overdue-assignment"]` không trùng học viên khi dính cả hai.
       - Legacy `assignments` có `status: "late"` → có `overdue-assignment` khi học viên có lớp active (hoặc không truyền `classes`); `status: "not-submitted"` hoặc `"graded"` → KHÔNG gắn cờ.
  5. Cập nhật `describe("paused classes filter (#694)", ...)`:
     - Thay `l-risk-*` đang dùng `status: "absent"` bằng buổi `upcoming` quá hạn (`date: "2026-10-05"`).
     - Thêm `classAssignment` quá hạn thuộc `cl-paused` và 1 legacy `assignment` `status: "late"` cho học viên `s-pau` (chỉ thuộc lớp `cl-paused`) để chứng minh cả hai đều không lọt vào `atRiskRows`.
  6. Cập nhật `describe("formatDashboardLead", ...)`: kỳ vọng `"Hôm nay có 0 buổi dạy"` thay cho `"Hôm nay có 0 buổi học"`.
- **Success criteria:** File test chạy được và thất bại đúng ở các assertion mới trước khi sửa implementation.
- **Verify:** `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits non-zero với assertion failure (trạng thái TDD Red; nếu pass hết là lỗi).

### Task 1.2 — Implement `lessonDayFromDate`, `atRiskRows` và `formatDashboardLead` (Green phase)

<!-- Updated: Red Team Session 1 - Dùng isoDayNumber & isValidISODate từ week-grid.ts, thống nhất VN timezone trên lessonDayFromDate, kiểm attemptId != null, chặn legacy assignment khi học viên chỉ thuộc lớp paused -->

- **Goal:** Triển khai logic mới trong `dashboard-from-kernel.ts` để mọi test Phase 1 xanh hoàn toàn và đồng bộ múi giờ Việt Nam.
- **Target files and symbols:** `apps/web/src/lib/dashboard-from-kernel.ts` (`lessonDayFromDate`, `DashboardRiskReason`, `atRiskRows`, `formatDashboardLead`).
- **Steps:**
  1. Import `evaluateAssignmentDeadline` từ `@teacher-os/api/vietnam-date`, thêm `isoDayNumber`, `isValidISODate` vào import sẵn có từ `@/lib/week-grid`, và thêm `Assignment`, `ClassAssignment` vào import type từ `@/lib/mock-data`.
  2. Cập nhật `lessonDayFromDate(now = new Date()): number` trả về `isoDayNumber(todayISOVietnam(now))` (nhất quán 100% múi giờ `Asia/Ho_Chi_Minh` cho `lessonsToday`, `upcomingLessonsThisWeek`, `atRiskRows`, không viết thêm helper `isoWeekday` trùng lặp).
  3. Đổi type `export type DashboardRiskReason = "missed-check-in" | "overdue-assignment";` và xóa `isRecentAbsence` / `ABSENT_WINDOW_DAYS` không còn dùng.
  4. Cập nhật chữ ký `atRiskRows`:
     ```ts
     export function atRiskRows(
     	students: Student[],
     	lessons: Lesson[],
     	now = new Date(),
     	classes?: readonly Pick<ClassGroup, "id" | "status" | "studentIds">[],
     	classAssignments: readonly Pick<
     		ClassAssignment,
     		"classId" | "due" | "dueAt" | "targets"
     	>[] = [],
     	assignments: readonly Pick<Assignment, "sid" | "status">[] = [],
     ): DashboardRiskRow[]
     ```
     (Chấp nhận `studentIds?: readonly string[]` tùy chọn trên `classes` để tương thích với các fixture test chỉ truyền `{ id, status }`.)
  5. Trong `atRiskRows`:
     - Tính `todayIso = todayISOVietnam(now)`, `today = isoDayNumber(todayIso)`, `nowMs = now.getTime()`, `pausedIds = pausedClassIdSet(classes)`.
     - Duyệt `lessons`: bỏ qua lớp `paused`, chỉ xét `lesson.status === "upcoming"`:
       - Nếu `lesson.date != null && isValidISODate(lesson.date)`: gắn `"missed-check-in"` khi `lesson.date < todayIso`. (Cố ý giữ toàn bộ quá khứ chưa điểm danh vì đây là hàng chờ cần giáo viên xử lý dứt điểm.)
       - Ngược lại (`null` hoặc chuỗi rỗng/không hợp lệ): gắn `"missed-check-in"` khi `lesson.day < today`.
     - Duyệt `classAssignments`: bỏ qua lớp `paused`; với từng `target` thỏa `target.submittedAt == null && target.attemptId == null`, gọi `evaluateAssignmentDeadline({ due: ca.due, dueAt: ca.dueAt, submittedAt: null, todayISO: todayIso, nowMs })`; nếu `isOverdue`, gắn `"overdue-assignment"` cho `target.studentId`.
     - Duyệt `assignments` (legacy frozen): nếu `a.status === "late"`, bỏ qua nếu học viên chỉ thuộc lớp `paused` (tức xuất hiện trong `studentIds` của lớp `paused` hoặc chỉ có lesson thuộc lớp `paused` mà không thuộc lớp `active` nào); ngược lại gắn `"overdue-assignment"` cho `a.sid`.
     - Tổng hợp theo thứ tự mảng `students`, mỗi học viên xuất tối đa 2 lý do theo thứ tự cố định `["missed-check-in", "overdue-assignment"]`.
  6. Cập nhật `formatDashboardLead` từ `"buổi học"` sang `"buổi dạy"` (giữ export tương thích ngược; lưu ý không có caller production).
- **Success criteria:** Toàn bộ unit tests trong `dashboard-from-kernel.test.ts` pass và không phụ thuộc múi giờ máy.
- **Verify:** `TZ=America/Los_Angeles pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts && pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits 0 và báo toàn bộ test pass.

## Verification

- `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits 0.
- `TZ=America/Los_Angeles pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits 0.

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
