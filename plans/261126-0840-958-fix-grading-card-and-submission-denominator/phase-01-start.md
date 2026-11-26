---
phase: 1
title: "Phase 1: Dashboard Grading Card, Hero Copy & Overdue-Unsubmitted Highlight (TDD)"
status: completed
priority: P1
effort: "1.5h"
dependencies: []
---

# Phase 1: Dashboard Grading Card, Hero Copy & Overdue-Unsubmitted Highlight (TDD)

## Goal
Cập nhật selector dashboard, component `ReminderCards` và route `/teacher/dashboard` để Thẻ 2 (`Chấm bài`) dùng câu chữ đúng phạm vi (`"Không còn bài quá hạn chấm"`), nổi bật số bài quá hạn chưa nộp từ kernel snapshot (khớp 100% `atRiskRows`) và dòng tóm tắt Hero không tuyên bố `"Mọi việc hôm nay đã xong."` khi còn học viên cần kiểm tra.

## Files to Create / Modify
- Modify: `apps/web/src/lib/dashboard-from-kernel.ts`
- Modify: `apps/web/src/lib/dashboard-from-kernel.test.ts`
- Modify: `apps/web/src/components/dashboard/reminder-cards.tsx`
- Modify: `apps/web/src/components/dashboard/reminder-cards.test.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.tsx`
- Modify: `apps/web/src/routes/_auth/dashboard.test.tsx`

## Tasks & Steps

### Task 1.1 — TDD Red + Green: Pure selector `overdueUnsubmittedSummary`
<!-- Updated: Validation Session 1 - Bổ sung tham số students khớp atRiskRows chống cảnh báo ma demo-student:% / target mồ côi (Red-Team F8) -->
- **Goal:** Tạo hàm thuần `overdueUnsubmittedSummary` trong `dashboard-from-kernel.ts` đếm chính xác tổng lượt bài tập quá hạn chưa nộp (`targets`) và số học viên phân biệt bị trễ (`students`), dùng chung bộ lọc `students`, quy tắc loại trừ lớp `paused` và guard `submittedAt != null || attemptId != null` với `atRiskRows`.
- **Target files and symbols:**
  - `apps/web/src/lib/dashboard-from-kernel.test.ts` (thêm suite `describe("overdueUnsubmittedSummary", ...)`)
  - `apps/web/src/lib/dashboard-from-kernel.ts` (export `OverdueUnsubmittedSummary`, `overdueUnsubmittedSummary`)
- **Steps:**
  1. Thêm unit tests trong `apps/web/src/lib/dashboard-from-kernel.test.ts` kiểm tra:
     - Trả `{ targets: 0, students: 0 }` khi không có bài quá hạn chưa nộp.
     - Đếm đúng 2 bài quá hạn chưa nộp của cùng 1 học viên (`{ targets: 2, students: 1 }`) và nhiều học viên trên nhiều lớp `active`.
     - Loại trừ target đã có `submittedAt != null` hoặc `attemptId != null` (D1 flip-first guard).
     - Loại trừ bài thuộc lớp `paused` (`status === "paused"`).
     - Loại trừ target / legacy assignment của học viên không nằm trong mảng `students` (ví dụ `demo-student:*` hoặc target mồ côi — bảo đảm khớp 100% với `atRiskRows`).
     - Tính cả bảng `assignments` legacy có `status === "late"` cho học viên hợp lệ không bị cô lập trong lớp `paused`.
     - Tôn trọng `dueAt` chính xác theo mili-giây (`evaluateAssignmentDeadline`) và ngày Việt Nam (`todayISOVietnam`).
  2. Chạy test để xác nhận trạng thái **Red** (fail vì `overdueUnsubmittedSummary` chưa tồn tại).
  3. Implement `export interface OverdueUnsubmittedSummary { targets: number; students: number }` và `export function overdueUnsubmittedSummary(students: readonly Pick<Student, "id">[], lessons: readonly Lesson[], now = new Date(), classes?: readonly DashboardRiskClassInput[], classAssignments: readonly Pick<ClassAssignment, "classId" | "due" | "dueAt" | "targets">[] = [], assignments: readonly Pick<Assignment, "sid" | "status">[] = []): OverdueUnsubmittedSummary` trong `apps/web/src/lib/dashboard-from-kernel.ts`: dựng `validStudentIds = new Set(students.map((s) => s.id))`, sử dụng chung `pausedClassIdSet`, `pausedOnlyStudentSet`, `todayISOVietnam` và `evaluateAssignmentDeadline`, chỉ đếm target/assignment có `studentId` / `sid` nằm trong `validStudentIds`.
  4. Chạy lại test xác nhận **Green**.
- **Success criteria:** Tất cả ca test mới và cũ trong `dashboard-from-kernel.test.ts` đều pass, số liệu khớp 100% logic của `atRiskRows`.
- **Verify:**
  - Red phase: `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits non-zero với lỗi thiếu export / assertion failure.
  - Green phase: `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts` exits 0 và báo toàn bộ tests passed.

### Task 1.2 — TDD Red + Green: Per-card zero-state copy và cảnh báo quá hạn chưa nộp trong `ReminderCards`
<!-- Updated: Validation Session 1 - Thêm aria-describedby, shrink-0 mt-0.5 + min-w-0 chống vỡ 320px/768px và copy chỉ rõ nơi xem Cần kiểm tra (Red-Team F8) -->
- **Goal:** Thay thế hằng số `DONE_TODAY_LABEL` dùng chung bằng `doneLabel` riêng từng thẻ và hiển thị dòng cảnh báo màu `--warn` không tương tác (nối `aria-describedby` vào `<Link>`) bên trong Thẻ 2 khi `overdueUnsubmitted.targets > 0`, đồng thời không hạ mờ nền Thẻ 2 sang `bg-muted` khi còn bài quá hạn chưa nộp.
- **Target files and symbols:**
  - `apps/web/src/components/dashboard/reminder-cards.test.tsx`
  - `apps/web/src/components/dashboard/reminder-cards.tsx` (`ReminderCards`, `ReminderCard`)
- **Steps:**
  1. Cập nhật & bổ sung tests trong `apps/web/src/components/dashboard/reminder-cards.test.tsx`:
     - Khi 3 thẻ đều đếm 0 và không có bài quá hạn chưa nộp:
       - Thẻ 1 (`reminder-card-attendance`) hiển thị `"Đã hoàn tất hôm nay"` (giữ nguyên hợp đồng `daily-attendance.spec.ts:198`).
       - Thẻ 2 (`reminder-card-grading`) hiển thị `"Không còn bài quá hạn chấm"`, KHÔNG chứa `"Đã hoàn tất hôm nay"`.
       - Thẻ 3 (`reminder-card-tuition`) hiển thị `"Không có khoản đến hạn"`.
     - Khi `overdueGrading.count === 0` nhưng truyền `overdueUnsubmitted={{ targets: 2, students: 1 }}`:
       - Thẻ 2 vẫn hiển thị `"Không còn bài quá hạn chấm"` (đúng phạm vi chờ chấm),
       - Hiển thị cảnh báo `"Còn 2 bài quá hạn chưa nộp (1 học viên) — xem ở Cần kiểm tra"` (`data-testid="reminder-card-grading-overdue-unsubmitted"`),
       - `<Link>` trong Thẻ 2 có thuộc tính `aria-describedby` trỏ tới `id` của banner cảnh báo để screen reader đọc được,
       - Không gắn lớp `bg-muted` làm mờ thẻ và KHÔNG có thẻ `<a>` hoặc `<button>` lồng bên trong `<Link>` (đếm chỉ đúng 1 link trong thẻ).
     - Khi `overdueGrading.count > 0` và `overdueUnsubmitted={{ targets: 2, students: 1 }}`: vẫn hiển thị đủ số bài quá hạn chấm (`3 bài`, `2 Writing · 1 Speaking`) kèm dòng cảnh báo quá hạn chưa nộp.
  2. Chạy test xác nhận **Red**.
  3. Cập nhật `apps/web/src/components/dashboard/reminder-cards.tsx`:
     - Import `AlertTriangle` từ `lucide-react` và `type OverdueUnsubmittedSummary` từ `@/lib/dashboard-from-kernel`.
     - Thêm prop tùy chọn `overdueUnsubmitted?: OverdueUnsubmittedSummary` trên `ReminderCards`.
     - Thêm props `doneLabel: string`, `hasWarning?: boolean`, `warningBanner?: ReactNode`, `warningBannerId?: string` trên `ReminderCard`.
     - Truyền `doneLabel="Đã hoàn tất hôm nay"` cho Thẻ 1, `doneLabel="Không còn bài quá hạn chấm"` cho Thẻ 2, `doneLabel="Không có khoản đến hạn"` cho Thẻ 3.
     - Trên `ReminderCard`: giữ `data-done={props.done ? "true" : "false"}`; chỉ áp `bg-muted shadow-none` khi `props.done && !props.hasWarning`; gắn `aria-describedby={props.hasWarning ? props.warningBannerId : undefined}` lên stretched `<Link>`; render `props.warningBanner` (non-interactive `<div id={...} data-testid="reminder-card-grading-overdue-unsubmitted" className="flex min-w-0 items-start gap-2 border-border border-t pt-3 font-medium text-warn text-xs">` với `<AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />` + `<span className="min-w-0 break-words">...</span>`) cả ở nhánh `props.done` lẫn nhánh `!props.done` khi có cảnh báo.
     - Giữ nguyên `aria-label`, `title="Bài tập quá hạn chấm > 24h"`, `to="/grading"`, `search={{ status: "awaiting" }}` trên Thẻ 2.
  4. Chạy lại test xác nhận **Green**.
- **Success criteria:** Thẻ 2 không bao giờ dùng `"Đã hoàn tất hôm nay"`, nổi bật cảnh báo bài quá hạn chưa nộp đúng token `text-warn`, không vi phạm interactive nesting, và đạt a11y + 320px/768px wrapping.
- **Verify:**
  - Red phase: `pnpm --filter web exec vitest run src/components/dashboard/reminder-cards.test.tsx` exits non-zero với assertion failure.
  - Green phase: `pnpm --filter web exec vitest run src/components/dashboard/reminder-cards.test.tsx` exits 0 và toàn bộ tests passed.

### Task 1.3 — TDD Red + Green: Nối `overdueUnsubmittedSummary` và sửa Hero summary trên `dashboard.tsx`
<!-- Updated: Validation Session 1 - Truyền data.students làm tham số đầu tiên cho overdueUnsubmittedSummary (Red-Team F8) -->
- **Goal:** Truyền `overdueUnsubmitted` vào `<ReminderCards>` và cập nhật Hero summary để không bao giờ nói `"Mọi việc hôm nay đã xong."` khi còn học viên trong danh sách `Cần kiểm tra` (`risk.length > 0`).
- **Target files and symbols:**
  - `apps/web/src/routes/_auth/dashboard.test.tsx`
  - `apps/web/src/routes/_auth/dashboard.tsx` (`DashboardRoute`)
- **Steps:**
  1. Thêm unit tests trong `apps/web/src/routes/_auth/dashboard.test.tsx`:
     - Trường hợp `reminders` trả về 0 ở cả 3 thẻ nhưng học viên Leah có 2 bài `classAssignments` quá hạn chưa nộp:
       - `reminder-card-grading` hiển thị `"Không còn bài quá hạn chấm"` và `"Còn 2 bài quá hạn chưa nộp (1 học viên)"`, KHÔNG hiển thị `"Đã hoàn tất hôm nay"`.
       - `dashboard-hero-summary` hiển thị `"Còn 1 học viên cần kiểm tra."` và KHÔNG hiển thị `"Mọi việc hôm nay đã xong."`.
     - Giữ nguyên test hiện có (lines 486, 492): khi `risk.length === 0` và `openTasks === 0`, `attendanceCard` vẫn chứa `"Đã hoàn tất hôm nay"` và `heroSummary` vẫn chứa `"Mọi việc hôm nay đã xong."`.
  2. Chạy test xác nhận **Red**.
  3. Sửa `apps/web/src/routes/_auth/dashboard.tsx`:
     - Import `overdueUnsubmittedSummary` từ `@/lib/dashboard-from-kernel`.
     - Tính `overdueUnsubmitted = overdueUnsubmittedSummary(data.students, data.lessons, now, data.classes, data.classAssignments, data.assignments)`.
     - Cập nhật nhánh `openTasks === 0` trong `dashboard-hero-summary` (lines 215–229): nếu `risk.length > 0` render `<>Còn <strong className="font-semibold text-foreground">{`${risk.length} học viên`}</strong> cần kiểm tra.</>`; ngược lại giữ `"Mọi việc hôm nay đã xong."`.
     - Truyền `overdueUnsubmitted={overdueUnsubmitted}` vào `<ReminderCards>`.
  4. Chạy lại test xác nhận **Green**.
- **Success criteria:** Toàn bộ test mới và cũ trên `dashboard.test.tsx`, `reminder-cards.test.tsx`, `dashboard-from-kernel.test.ts` pass 100%.
- **Verify:**
  - Red phase: `pnpm --filter web exec vitest run src/routes/_auth/dashboard.test.tsx` exits non-zero với assertion failure.
  - Green phase: `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx` exits 0.

## Verification
- `pnpm --filter web exec vitest run src/lib/dashboard-from-kernel.test.ts src/components/dashboard/reminder-cards.test.tsx src/routes/_auth/dashboard.test.tsx` exits 0.

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
