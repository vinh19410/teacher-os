---
phase: 2
title: "Phase 2: Web and Student UI"
status: todo
---

# Phase 2: Web and Student UI

> **Goal:** Nối `update-class-status` & lỗi `409 CLASS_PAUSED` qua Kernel command bus, lọc lịch/xung đột/dashboard theo bucket cho lớp `paused`, hoàn thiện UI Teacher Web (`/classes`, `/classes/$classId`, `ClassStatusModal`, điểm danh read-only, roster, `AddStudentModal`, `ClassSessionModal`, `/students/$studentId`) và Student Portal.
> **Skill hints:** TDD (`tdd`) + tuân thủ token trong `DESIGN.md` (không dùng màu đỏ `destructive` cho trạng thái tạm dừng).

## Tasks

- [ ] **Task 2.1: Kernel Store, Action & Outcome Error Mapping cho `CLASS_PAUSED` (`apps/web`)**
  - **Target files & symbols:**
    - `apps/web/src/lib/mock-data.ts` (`ClassGroup` `L196-L215`), `apps/web/src/lib/repos/classes.ts` (`mapClasses` `L70`: chuẩn hóa `row.status === "paused" ? "paused" : "active"`)
    - `apps/web/src/lib/data-actions.ts`: `KernelAction` union (thêm `{ type: "update-class-status"; classId: string; status: ClassStatus }`)
    - `apps/web/src/lib/repos/kernel.ts`: `kernelCommand` (`L43-L364`) map sang `POST /api/classes/:id/status`, `KernelCommandResult` (`definite-failure` mang `code?: string`), `createKernelCommandBus` (`L778-L786` copy `error.code`)
    - `apps/web/src/lib/data-store-reducer.ts`: `case "update-class-status"` (`L343-L399`)
    - `apps/web/src/lib/kernel-outcome.ts`: `DirectOutcomePlan` (`L5-L10`), `planDirectOutcome` (`L59-L72`), `reportDirectOutcome` (`L94-L110` tránh phát `toast.info` thứ 2 sau `toast.error`), `occurrenceSummary` (`L138-L166`)
    - `apps/web/src/lib/use-kernel-form-submit.ts` (`L19-L33, L80-L84`): map `CLASS_ERROR_CODES.CLASS_PAUSED` và gọi `void refresh()` khi dính `409 CLASS_PAUSED`
    - `apps/web/src/lib/repos/daily-attendance.ts` (`L19-L63`): thêm `readonly code?: string` vào `DailyAttendanceApiError` và parse `body.code` trong `throwAttendanceHttpError`
  - **Steps:**
    1. Viết unit tests trước cho `planDirectOutcome`, `reportDirectOutcome`, `occurrenceSummary`, `createKernelCommandBus`, và `throwAttendanceHttpError` với `409 { code: "CLASS_PAUSED" }`.
    2. Cập nhật các file tầng Kernel trên (truyền `code` xuyên suốt, không phát 2 toast mâu thuẫn trên `reportDirectOutcome`, auto-refresh khi form submit gặp `409 CLASS_PAUSED`).
  - **Success criteria:** Mọi write action thua race `pause` trên tab khác đều phát `toast.error` rõ nghĩa (chỉ 1 toast) và tự refetch đồng bộ state.
  - **Verify:** `pnpm --filter web exec vitest run src/lib/`

- [ ] **Task 2.2: Schedule (Bucket-Level), Conflicts & Dashboard Filters (`apps/web`)**
  - **Target files & symbols:**
    - `apps/web/src/lib/schedule-conflicts.ts`: `findScheduleConflicts` (`c.status !== "active"` bị bỏ qua)
    - `apps/web/src/lib/schedule-week.ts` (`rollupSessionStatus` `L86-L98`, `selectProjectedWeekBlocks` `L197-L265`, filter bucket `L303-L395`), `apps/web/src/lib/schedule-day.ts` (`L95-L142`), `apps/web/src/lib/schedule-month.ts` (`L212-L255`)
    - `apps/web/src/routes/_auth/schedule.tsx`: kiểm tra empty state (`L196`) bằng `!data.classes.some(c => c.status === "active") && data.events.length === 0 && !data.lessons.some(l => l.date != null && (l.status === "completed" || l.status === "absent"))` (không che mất lịch sử khi toàn bộ lớp tạm dừng)
    - `apps/web/src/lib/dashboard-from-kernel.ts` & `apps/web/src/routes/_auth/dashboard.tsx`
    - Tests: `schedule-conflicts.test.ts`, `schedule-*.test.ts`, `dashboard-from-kernel.test.ts`, `dashboard.test.tsx`
  - **Steps:**
    1. Viết failing unit tests cho:
       - `findScheduleConflicts` bỏ qua lớp `paused`.
       - `selectProjectedWeekBlocks`: `if (cls.status !== "active") continue;` bỏ cả projection & manual empty sessions trên Week/Day/Month.
       - Filtering cấp bucket cho lớp `paused` trên `buildWeekModel`, `buildDayAgenda`, `buildMonthCells`: bỏ toàn bộ dòng `legacy` (`date == null`); với `dated` bucket có `>= 1` dòng `completed | absent` thì **giữ nguyên full `rows` của bucket** (không cắt bớt HV muộn làm méo sĩ số) và đảm bảo `rollupSessionStatus` không gán nhãn `"upcoming"` cho bucket lịch sử chỉ có `absent` / đã hoàn thành của lớp `paused`.
       - `lessonsToday`, `upcomingLessonsThisWeek`, `atRiskRows` trong `dashboard-from-kernel.ts`: lọc theo `activeClassIds` (ngăn dòng `completed` tuần trước lọt vào `lessonsToday`).
    2. Cài đặt bộ lọc trên, kiểm tra selector phụ của `dashboard.tsx` và empty state của `schedule.tsx:196`.
  - **Success criteria:** Lớp `paused` không sinh ô lịch sắp tới, buổi legacy lặp tuần, hay nhắc việc giả; buổi lịch sử trên `/schedule` giữ nguyên đúng sĩ số.
  - **Verify:** `pnpm --filter web exec vitest run src/lib/ src/routes/_auth/dashboard.test.tsx src/routes/_auth/schedule.test.tsx`

- [ ] **Task 2.3: Teacher Web UI — `/classes`, `ClassStatusModal`, `/classes/$classId`, Điểm danh Read-Only, Roster, `AddStudentModal`, `/schedule`, `/students/$studentId`**
  - **Target files & symbols:**
    - `apps/web/src/routes/_auth/classes/index.tsx` & `apps/web/src/routes/_auth/classes/index.test.tsx` & `apps/web/src/routes/_auth/list-page-filters.test.ts`: thêm chip `"Tạm dừng"`, khai báo `validateSearch` trả về `{ filter?: ClassListFilter }` (bắt buộc optional để mọi `<Link to="/classes">` hợp lệ typecheck, sanitize giá trị lạ), dùng `navigate({ search, replace: true })`; cập nhật `classes/index.test.tsx:99-120` cho chip `"Tạm dừng"` + URL state via `routerState.search`.
    - `apps/web/src/components/modals/class-status-modal.tsx` (mới): modal xác nhận `"Tạm dừng lớp"` / `"Mở lại lớp"`, nút hành động `variant="outline"` / `variant="default"` (KHÔNG `destructive`), nêu rõ: bảo toàn buổi học & học viên, ẩn lịch sắp tới, chặn tuyển sinh/điểm danh mới, và ghi chú kỳ nghỉ toàn trung tâm trong lúc tạm dừng không tự dời lịch / khả năng đụng lịch khi mở lại.
    - `apps/web/src/routes/_auth/classes/$classId.tsx` & `$classId.test.tsx`: truyền `code?: string` + `await refresh()` khi `409 CLASS_PAUSED` trong `runOccurrenceWrite` (`L103-L125`); header badge trạng thái + nút `"Tạm dừng lớp"` / `"Mở lại lớp"` gated bởi `canManageClassStatus(data.viewer?.role ?? "teacher")` (`@teacher-os/auth/role` — bảo toàn fixture thiếu `viewer`); khóa/ẩn `"+ Thêm buổi học"` (`L300` & prop `onAddSession` xuống `ClassSessionsSection`), **giữ mở `"Sắp xếp buổi"`**; khóa/ẩn `"+ Thêm học viên vào lớp"` (`L445-L451`) khi `isPaused`. (Lưu ý rà selector trong `apps/e2e/specs/class-operations.spec.ts:74` nếu badge `"Đang học"` trùng text).
    - `apps/web/src/lib/repos/holidays.ts` (`L32-L42`) & `apps/web/src/components/modals/holiday-modal.tsx` (`L195-L231`): đọc `raw.code ?? raw.error` để hiển thị thông báo tiếng Việt rõ khi apply holiday cho lớp cụ thể dính `409 CLASS_PAUSED`.
    - `apps/web/src/components/class-detail/class-sessions-section.tsx`: tắt empty-state CTA `"+ Thêm buổi học"` (`L143-L156`) khi `isPaused`; `isPastUnmarked = !isPaused && isPast && markedCount + absentCount === 0`; ẩn nút `"Điểm danh"` 1:1 (`"Chưa điểm danh"` khi quá khứ chưa chấm); với lớp nhóm `isPaused`, ẩn `"Điểm danh →"` nếu `markedCount + absentCount === 0` và đổi `"Sửa điểm danh →"` sang `"Xem điểm danh →"` (`readOnly={isPaused}`).
    - `apps/web/src/components/class-detail/session-attendance-modal.tsx`: hỗ trợ `readOnly?: boolean` (không fallback `"Đã học"` tại `L48-L56`; hiện `<Badge variant="muted">Chưa điểm danh</Badge>` cho học viên chưa chấm).
    - `apps/web/src/components/class-detail/session-actions-modal.tsx`: thêm `code?: string` vào `OccurrenceActionResult` (`L29-L35`), handle `CLASS_PAUSED` ở `summarize`, nhận `isPaused?: boolean`, disable `"Hoàn thành buổi"` kèm chú thích, giữ nguyên Chỉnh sửa/Hủy/Xóa.
    - `apps/web/src/components/class-detail/class-roster-tab.tsx`: khi `cls.status !== "active"`, disable nút `"Kích hoạt"` & `ResendInviteButton` cho `invited` (và không resend nếu HV chỉ thuộc lớp `paused`), dời `setConfirmAction(null)` xuống **sau** `await run(...)` (`L258-L275`), giữ nút `"Hủy lời mời"`.
    - `apps/web/src/components/modals/add-student-modal.tsx`: tính `activeClasses = data.classes.filter((c) => c.status === "active")` trước `L224` để ẩn cả field chọn lớp khi chưa có lớp active nào.
    - `apps/web/src/components/schedule/class-session-modal.tsx`: ẩn nút `"Điểm danh"` khi `cls?.status !== "active"` (giữ Sửa/Hủy).
    - `apps/web/src/components/attendance/attendance-session-row.tsx` & `apps/web/src/routes/_auth/attendance.tsx` & `attendance.test.tsx`: cập nhật đủ 5 điểm `!s.recorded` (`L124, L225-235, L246-248, L309-313, L410`) loại trừ `s.classPaused`; khi `session.classPaused`, gắn `<Badge variant="muted">Tạm dừng</Badge>` (thay warn badge `"Chưa điểm danh"` tại `L221`) và khóa toàn bộ input/radio/button qua `isReadOnly = isFutureDate || Boolean(session.classPaused)`; handle `409 CLASS_PAUSED` toast + `await dailyQuery.refetch()`.
    - `apps/web/src/routes/_auth/students/$studentId.tsx`: gắn `<Badge variant="muted">Tạm dừng</Badge>` cạnh lớp `paused`.
  - **Steps:** Viết/bổ sung RTL tests trước cho từng màn/modal trên rồi cài đặt UI đúng `DESIGN.md`.
  - **Success criteria:** UI đồng nhất 2 trạng thái, điểm danh lịch sử xem được read-only, không kẹt modal hay hiện warn badge sai.
  - **Verify:** `pnpm --filter web test && pnpm --filter web check-types`

- [ ] **Task 2.4: Student Portal UI (`apps/student`)**
  - **Target files & symbols:**
    - `apps/student/src/components/overview/class-card.tsx`: badge `"Tạm dừng"`, disabled `"Tham gia lớp"` + giải thích `"Lớp đang tạm dừng — chưa thể tham gia"` khi `invited` & `paused`, hiển thị `"Lớp đang tạm dừng"` khi `enrolled` & `paused`.
    - `apps/student/src/components/class/class-detail-view.tsx`, `class-info-card.tsx`, `class-lesson-list.tsx`: banner thông báo lớp đang tạm dừng; ép `nextId = null` ở cả `ClassInfoCard` (`L100`) & `ClassLessonList` (`L108`) khi `isPaused`; với buổi `upcoming` quá giờ của lớp `paused`, bỏ qua `isLessonEnded` và hiển thị nhãn trung tính `"Tạm hoãn"` thay vì `"Đã kết thúc"`.
    - `apps/student/src/components/schedule/student-schedule-view.tsx`: badge `"Tạm dừng"` + `"Lớp đang tạm dừng"` ở thẻ lịch định kỳ.
    - `apps/student/src/lib/repos/student.ts` (`L731-L739`): `useAcceptClassEnrollment` onSuccess invalidate `overview`, `schedule`, `class`, `notifications`.
    - `apps/student/src/routes/_auth/index.tsx` (`L41-L50, L150-L156`) & `apps/student/src/routes/_auth/classes/index.tsx` (`L24-L33`): StatCard `"Lớp đang học"` đếm `c.enrollmentStatus === "active" && c.status === "active"`; `acceptMutation.onError` dùng `isHttpError(err)` (`@/lib/query-client`) kiểm `err.code === CLASS_ERROR_CODES.CLASS_PAUSED` / `err.status === 404` sang thông điệp tiếng Việt an toàn (không leak raw HTTP status tiếng Anh `"Failed to accept enrollment: ..."`) và `invalidateQueries(["student", "overview"])`.
  - **Steps:** Bổ sung RTL/unit tests cho Student Portal trước rồi cập nhật components và routes trên.
  - **Success criteria:** Học viên thấy rõ trạng thái tạm dừng, không thấy `"Buổi tới"` hay `"Đã kết thúc"` giả, StatCard chính xác, và cache tự đồng bộ khi gặp race.
  - **Verify:** `pnpm --filter student test && pnpm --filter student check-types && pnpm exec biome check .`

## Failure Protocol

If any verification step fails unexpectedly:
1. STOP immediately — do NOT touch code yet.
2. Invoke `kongming` via `invoke_subagent(TypeName="kongming", Model="inherit")` with the failing command, exact stderr/test diff, and relevant files.
3. Wait for diagnosis and apply the verified fix.
4. Re-run the full verification gate to confirm clean pass.
