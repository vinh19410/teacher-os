---
phase: 1
title: "Phase 1: Pure Dashboard Selectors, Focus State Machine & Risk Details (TDD)"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Pure Dashboard Selectors, Focus State Machine & Risk Details (TDD)

## Goal

Vá lỗi lọc ngày đa tuần của `lessonsToday` và bổ sung toàn bộ hàm selector thuần theo múi giờ `Asia/Ho_Chi_Minh` trong `apps/web/src/lib/dashboard-from-kernel.ts` (Focus Card 6 trạng thái có guard `time`/`dur` bẩn, `formatEndTime` an toàn không sinh `NaN:NaN`, timeline session status, nhóm lịch sắp tới kèm `dateIso` thật, và danh sách chi tiết vấn đề thật dùng `deadline.dueDateISO` + guard `due` legacy) với 100% unit test TDD.

## Files to Create / Modify

- Modify: `apps/web/src/lib/dashboard-from-kernel.ts`
- Modify: `apps/web/src/lib/dashboard-from-kernel.test.ts`

## Tests Before

<!-- Updated: Red Team Session 1 - Thêm test guard formatEndTime/parseTimeToMinutes/resolveDashboardFocus với time bẩn và studentRiskDetails với dueAt + legacy due rỗng/non-ISO -->

Trước khi sửa `apps/web/src/lib/dashboard-from-kernel.ts`, bổ sung các nhóm test đỏ trong `apps/web/src/lib/dashboard-from-kernel.test.ts` phủ toàn bộ hợp đồng mới và lỗi rò rỉ đa tuần:
- `lessonsToday`: lớp `dated` có các buổi cùng thứ ở tuần trước, hôm nay và tuần sau → chỉ trả buổi có `lesson.date === todayIso`; buổi `date === ""` hoặc `date === null` fallback về `lesson.day === todayDay`.
- `vietnamNowMinutes`, `parseTimeToMinutes`, `formatEndTime` (chịu chuỗi giờ bẩn/rỗng mà không sinh `NaN:NaN`), `formatDurationVi`, `formatWeekdayLong`.
- `sessionTimelineState` (past / live / next / biên `now === start` / `now === end` / `dur === 0` / `time` bẩn → trả `"next"`).
- `hasPendingTodayAttendance` (phân biệt ca đã điểm danh toàn bộ vs còn bất kỳ dòng `upcoming` nào trong `todayLessons`, cả lớp `dated` lẫn `legacy`).
- `groupUpcomingByDay` (nhóm theo `day`, chỉ gán `dateIso` khi có `isValidISODate(lesson.date)`, giữ `dateIso: null` cho legacy theo #56).
- `resolveDashboardFocus` (đủ 6 trạng thái: `live` với `progress` & `minutesLeft`, `next` với `minutesUntil`, `done-today-with-upcoming` phân biệt `isTomorrow: true` vs `false`, `no-today-with-upcoming`, `done-today-no-upcoming`, `empty`, và bỏ qua buổi có `time` bẩn hoặc `dur <= 0` để không bao giờ sinh `NaN`).
- `studentRiskDetails` (trả danh sách `missed-check-in` dedup theo `(classId, dateIso ?? day, time)` và `overdue-assignment` từ `classAssignments` dùng `deadline.dueDateISO` khi có `dueAt`, lẫn legacy `assignments` giữ nguyên `due` non-ISO/`""` an toàn, tôn trọng `paused` classes và `attemptId != null`).

## Tasks & Steps

### Task 1.1 — Viết unit test TDD (Red phase) cho các selector mới và bug đa tuần `lessonsToday`

- **Goal:** Tạo bộ test đỏ xác minh toàn bộ hành vi mong đợi của `lessonsToday` và các helper mới trước khi viết code triển khai.
- **Target files and symbols:** `apps/web/src/lib/dashboard-from-kernel.test.ts`.
- **Steps:**
  1. Giữ nguyên mọi `describe` / `test` hiện có trong `apps/web/src/lib/dashboard-from-kernel.test.ts` (đảm bảo không vỡ hợp đồng cũ của `atRiskRows`, `groupLessonsByClassSession`, `upcomingLessonsThisWeek`, `formatClassSessionMeta`, `formatDashboardGreeting`).
  2. Thêm test case trong `describe("lessonsToday")` kiểm tra lớp `dated` nhiều tuần cùng Thứ Tư (`2026-08-12`, `2026-08-19`, `2026-08-26`) tại mốc `wednesday` (`2026-08-19`): chỉ trả đúng buổi `2026-08-19`; nếu `2026-08-19` bị `cancelled` còn `2026-08-26` `upcoming` thì trả `[]`; và buổi `date: ""` fallback về `lesson.day === 3`.
  3. Thêm các block `describe` mới import và kiểm thử:
     - `vietnamNowMinutes` (mốc `2026-08-19T01:30:00Z` → `08:30` = `510`; mốc `2026-08-19T17:05:00Z` → `00:05` = `5`).
     - `parseTimeToMinutes` & `formatEndTime` (`"08:00", 90` → `"09:30"`; `"23:30", 60` → `"00:30"`; `"invalid", 90` → `""` không phải `"NaN:NaN"`; `"08:00", 0` → `"08:00"`).
     - `formatDurationVi` (`45` → `"45 phút"`, `60` → `"1 giờ"`, `90` → `"1 giờ 30 phút"`, `0` → `"1 phút"`).
     - `formatWeekdayLong` (`1` → `"Thứ Hai"`, `7` → `"Chủ Nhật"`).
     - `sessionTimelineState` (start `08:00` dur `90`: `479` → `"next"`, `480` → `"live"`, `569` → `"live"`, `570` → `"past"`; `dur: 0` tại `480` → `"past"`; `time: "bad"` → `"next"`).
     - `hasPendingTodayAttendance` (trả `true` nếu có ít nhất 1 row `status === "upcoming"` khớp `(classId, time)`, `false` khi tất cả là `completed`/`absent`).
     - `groupUpcomingByDay` (lớp dated có `dateIso: "2026-08-20"`, lớp legacy có `dateIso: null`, giữ đúng thứ tự).
     - `resolveDashboardFocus` cho đủ 6 trạng thái (`live`, `next`, `done-today-with-upcoming` với `isTomorrow: true` và `isTomorrow: false`, `no-today-with-upcoming`, `done-today-no-upcoming`, `empty`) + case session có `time: "bad"` bị bỏ qua thay vì trả `minutesUntil: NaN`.
     - `studentRiskDetails` cho học viên có đồng thời buổi `missed-check-in` (dated + legacy) và bài `overdue-assignment` (`classAssignments` có `dueAt` xuyên múi giờ + `due` thường + legacy `assignments` có `due: ""` và `due: "18/08"`), kiểm tra bỏ qua lớp `paused` và bỏ qua target đã có `attemptId`.
- **Success criteria:** Test mới biên dịch/chạy và thất bại đúng ở các symbol chưa có hoặc bug `lessonsToday` cũ.
- **Verify:** `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits non-zero với lỗi thiếu export / assertion failure của test mới (pass là thất bại ở red phase).

### Task 1.2 — Vá `lessonsToday` và triển khai các helper thuần trong `dashboard-from-kernel.ts` (Green phase)

<!-- Updated: Red Team Session 1 - Thêm formatEndTime fail-safe, bỏ qua time bẩn trong resolveDashboardFocus, dùng deadline.dueDateISO trong studentRiskDetails -->

- **Goal:** Cài đặt bản vá `lessonsToday` và toàn bộ selector thuần để `dashboard-from-kernel.test.ts` xanh 100%.
- **Target files and symbols:** `apps/web/src/lib/dashboard-from-kernel.ts` (`lessonsToday`, `vietnamNowMinutes`, `parseTimeToMinutes`, `formatEndTime`, `formatDurationVi`, `formatWeekdayLong`, `sessionTimelineState`, `hasPendingTodayAttendance`, `groupUpcomingByDay`, `resolveDashboardFocus`, `studentRiskDetails` và các type export `SessionTimelineState`, `UpcomingDayGroup`, `DashboardFocusState`, `DashboardRiskIssue`).
- **Steps:**
  1. Import thêm `addDays` từ `@/lib/week-grid` (giữ nguyên các import hiện có).
  2. Trong `lessonsToday`: tính `const todayIso = todayISOVietnam(now); const day = isoDayNumber(todayIso);`. Điều kiện khớp ngày:
     ```ts
     const matchesToday =
       lesson.date != null && isValidISODate(lesson.date)
         ? lesson.date === todayIso
         : lesson.day === day;
     ```
     Giữ nguyên lọc `!pausedIds?.has(lesson.classId)`, `status !== "cancelled" && status !== "holiday"` và sort theo `a.time.localeCompare(b.time)`.
  3. Cài đặt `vietnamNowMinutes(now = new Date()): number` dùng `Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })` (normalize `hour === 24 ? 0 : hour`), `parseTimeToMinutes(hhmm: string): number | null` (kiểm `^\d{1,2}:\d{2}$` và `0 <= h <= 23`, `0 <= m <= 59`), `formatEndTime(hhmm: string, dur: number): string` (dùng `parseTimeToMinutes`, trả `""` nếu `start === null || !Number.isFinite(dur)` để không bao giờ sinh `"NaN:NaN"`), `formatDurationVi(minutes: number): string`, `formatWeekdayLong(day: number): string` (mảng hằng `["Thứ Hai", ..., "Chủ Nhật"]`).
  4. Cài đặt `sessionTimelineState(session, nowMin)` (nếu `parseTimeToMinutes(session.time) === null` trả `"next"`; `dur = Number.isFinite(session.dur) ? Math.max(0, session.dur) : 0`; `dur > 0 && nowMin >= start && nowMin < start + dur` → `"live"`, `nowMin >= start + dur` → `"past"`, else `"next"`) và `hasPendingTodayAttendance(todayLessons, classId, time)`.
  5. Cài đặt `groupUpcomingByDay(lessons: Lesson[]): UpcomingDayGroup[]`: gom theo `l.day`, gọi `groupLessonsByClassSession` cho từng nhóm, và gán `dateIso` bằng `l.date` hợp lệ (`isValidISODate`) đầu tiên trong nhóm (hoặc `null` nếu nhóm chỉ có legacy undated lessons — không bịa ngày theo #56).
  6. Cài đặt `resolveDashboardFocus({ todaySessions, upcomingGroups, now = new Date() }): DashboardFocusState`:
     - Chỉ xét `validTodaySessions = todaySessions.filter((s) => parseTimeToMinutes(s.time) !== null)` khi tìm `live` (yêu cầu `dur > 0`) hoặc `next` để không bao giờ tính `NaN`.
     - Tìm `live` trong `validTodaySessions` → tính `progress = Math.min(1, Math.max(0, (nowMin - start) / dur))` và `minutesLeft = Math.max(1, end - nowMin)`.
     - Nếu không có `live`, tìm `next` đầu tiên trong `validTodaySessions` → tính `minutesUntil = Math.max(1, start - nowMin)`.
     - Nếu không còn `live`/`next` hôm nay: lấy `firstUpcomingGroup = upcomingGroups[0]` và `firstSession = firstUpcomingGroup?.sessions[0]`. Nếu có: tính `tomorrowIso = addDays(todayIso, 1)` và `isTomorrow = firstUpcomingGroup.dateIso != null ? firstUpcomingGroup.dateIso === tomorrowIso : firstUpcomingGroup.day === (todayDay % 7) + 1`; trả `todaySessions.length > 0 ? "done-today-with-upcoming" : "no-today-with-upcoming"`.
     - Nếu không có `firstSession`: trả `todaySessions.length > 0 ? "done-today-no-upcoming" : "empty"`.
  7. Cài đặt `studentRiskDetails(...)` trả `DashboardRiskIssue[]` cho 1 `studentId` cụ thể, dùng chung helper `pausedClassIdSet` / `pausedOnlyStudentSet` / `evaluateAssignmentDeadline` với `atRiskRows` (tuyệt đối không đổi kiểu trả về `{ student, reasons }` của `atRiskRows`):
     - Với `missed-check-in`: dedup theo `${lesson.classId}|${validDate ?? lesson.day}|${lesson.time}`, mang `classId`, `className`, `dateIso` (`isValidISODate(lesson.date) ? lesson.date : null`), `day`, `time`.
     - Với `classAssignments`: dùng `deadline.dueDateISO` (từ `evaluateAssignmentDeadline`, phản ánh đúng `dueAt` theo giờ VN) làm trường `due`.
     - Với legacy `assignments` (`status === "late"`): giữ nguyên `assignment.due` (UI tự kiểm `isValidISODate` trước khi format `dd/MM`).
- **Success criteria:** Toàn bộ test cũ và mới trong `dashboard-from-kernel.test.ts` đều pass, không có lỗi type hoặc lint.
- **Verify:** `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts && pnpm --filter web exec tsc --noEmit` exits 0.

## Tests After

Chạy hồi quy toàn bộ test dashboard hiện có để xác nhận bản vá `lessonsToday` không phá vỡ bất kỳ test màn hình nào:
- `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/routes/_auth/dashboard.test.tsx src/components/dashboard/reminder-cards.test.tsx` exits 0.

## Verification

- `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/routes/_auth/dashboard.test.tsx` exits 0.
- `pnpm check && pnpm check-types` exits 0.

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
