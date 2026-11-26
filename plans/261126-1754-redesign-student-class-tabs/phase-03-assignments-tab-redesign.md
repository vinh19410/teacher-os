---
phase: 3
title: "Phase 3: Redesign Tab Bài tập"
status: completed
priority: P1
effort: "1.5h"
dependencies: [1, 2]
---

# Phase 3: Redesign Tab Bài tập

## Goal
Xây dựng component mới `ClassAssignmentsTab` cho tab **Bài tập** theo `open-design/student-classes.html` (Todo Priority Strip, Toolbar + bộ lọc 4 trạng thái với badge đếm `aria-hidden`, 3 nhóm co/mở có link 1-click và chi tiết điểm/buổi học thật), giữ nguyên `ClassAssignmentTable` cho `SessionDetailView`, hoàn thiện luồng nhảy 2 pha `"Mở trong Bài tập"` từ Tab 1 sang Tab 2, và cập nhật selector `role="listitem"` tại `apps/e2e/specs/student-practice.spec.ts:546`.

## Files to Create / Modify
- Create: `apps/student/src/components/class/class-assignments-tab.tsx`
- Create: `apps/student/src/components/class/class-assignments-tab.test.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.tsx` (dùng `ClassAssignmentsTab` cho tab `assignments`, nối `af` filter + `focusedAssignmentId`)
- Modify: `apps/student/src/components/class/class-detail-view.test.tsx` (thêm test tích hợp nhảy Tab 1 → Tab 2)
- Modify: `apps/student/test/class-detail.test.tsx` (cập nhật 2 assertion Tab 2 vốn kiểm `getByRole("table")` sang kiểm cấu trúc mới của `ClassAssignmentsTab`, giữ nguyên suite test riêng của `ClassAssignmentTable` ở cuối file)
- Modify: `apps/e2e/specs/student-practice.spec.ts` (<!-- Updated: Red-Team RT-1 --> đổi dòng 546 từ `body.getByRole("row")` sang `body.getByRole("listitem")`)

## TDD Structure

### Tests Before
Viết `apps/student/src/components/class/class-assignments-tab.test.tsx` phủ trước các tình huống:
- Empty state khi `assignments` rỗng: hiển thị `"Chưa có bài tập nào"` (khớp `student-classmates.spec.ts:152`).
- Todo Priority Strip (<!-- Updated: Red-Team RT-10 -->): đếm chính xác `N bài cần làm` và `M quá hạn` (màu destructive), ưu tiên bài `overdue` → `due-soon` → `not-submitted` rồi hạn sớm nhất; nút `"Làm bài này"` chỉ chọn bài có `a.source === "class_assignment"` (ẩn CTA nếu tất cả bài cần làm đều có `source === "grading"` để không sinh link 404) và không trùng `aria-label` với link trên hàng (giữ Playwright strict mode); hiện thẻ yên tĩnh `"Bạn đã hoàn thành hết bài tập"` khi đã nộp/chấm hết.
- Toolbar lọc `Tất cả | Cần làm | Đã nộp | Đã chấm` (`role="group"`, `max-w-full flex-wrap`, `aria-pressed`, count span có `aria-hidden="true"`).
- 3 nhóm: `Cần làm`, `Đã nộp` (giữ trung thực cả bài tự chấm `"Đã nộp"` lẫn bài Writing/Speaking `"Đã nộp — Đang chờ giáo viên chấm"` theo `assignment-status.ts`), và `Đã chấm` (mặc định gập khi filter `all`, mở khi bấm toggle hoặc khi chọn filter `graded`, sort giảm dần an toàn kể cả khi `due` rỗng/free-text).
- Mỗi hàng `<li>`: nút co/mở (`aria-expanded`) hiển thị `Buổi N · Skill` (chỉ ghép dữ liệu thật), tiêu đề, hạn + thời gian còn/trễ (tone destructive/warn), chip trạng thái; sibling link 1-click (`aria-label="Làm bài: <title>"` hoặc `"Xem lại kết quả: <title>"`) chỉ cho `source === "class_assignment"` (ẩn link cho `source === "grading"`).
- Panel chi tiết `.asg-detail` (<!-- Updated: Red-Team RT-10 -->): chỉ render `<Link to="/classes/$classId/sessions/$date">` khi `sessionDate` khớp `/^\d{4}-\d{2}-\d{2}$/` VÀ khớp buổi non-holiday trong `lessons` (tránh link 404); hiển thị card kết quả Band + 4 tiêu chí IELTS (`Task`, `Coherence`, `Lexical`, `Grammar`) khi `scores != null`; khi `gradedAt != null && scores == null` hiển thị thông báo đã chốt trả bài chung cho mọi kỹ năng (không đóng khung chỉ Speaking); hiển thị lời nhắn chờ chấm/đã nộp trung thực theo `hasGradableTask`.
- `focusedAssignmentId` 2 pha (<!-- Updated: Red-Team RT-9 -->): khi bài đích nằm trong nhóm `"Đã chấm"` đang gập, pha 1 bật `gradedOpen = true`, pha 2 sau khi DOM render nút mới mở rộng row, `scrollIntoView?.(...)`, `focus()`, rồi mới gọi `onFocusHandled?.()`.
- Reset `expandedIds` và `gradedOpen` khi `classId` đổi (<!-- Updated: Red-Team RT-7 -->).

### Refactor
Triển khai `ClassAssignmentsTab` bằng token `globals.css` (Light + Dark, không tràn ngang ở `320px`), tái dùng `deriveAssignmentStatus`, `calculateIeltsBand`, `evaluateAssignmentDeadline`, `hasGradableTask`, `formatAssignmentSkillLabel`, nối vào `ClassDetailView`, và cập nhật `student-practice.spec.ts:546`.

### Tests After
Chạy test `ClassAssignmentsTab`, `ClassDetailView`, `SessionDetailView` (bảo đảm `ClassAssignmentTable` không đổi), và `class-detail.test.tsx`.

### Regression Gate
- `pnpm --filter student test -- src/components/class/class-assignments-tab.test.tsx src/components/class/class-detail-view.test.tsx src/components/class/session-detail-view.test.tsx test/class-detail.test.tsx`
- `pnpm --filter student exec tsc --noEmit`

## Tasks & Steps

### Task 3.1 — Viết unit test đỏ cho `ClassAssignmentsTab` (TDD Red)
- **Goal:** Khóa toàn bộ hợp đồng hành vi, a11y và edge case của Tab 2 trước khi viết implementation.
- **Target files and symbols:** `apps/student/src/components/class/class-assignments-tab.test.tsx`.
- **Steps:**
  1. Tạo file test mock `@tanstack/react-router` (`Link`) tương tự `class-detail-view.test.tsx`.
  2. Viết test cho empty state, Todo Priority Strip (overdue + due-soon + `source === "grading"` ẩn CTA + all-done), 4 nút filter + `aria-hidden` counts, nhóm `Đã chấm` gập mặc định / tự mở khi filter `graded` / sort an toàn khi `due` rỗng, 1-click link `Làm bài: <title>` không trùng accessible name với Todo Strip, bảng 4 tiêu chí IELTS vs nhánh `gradedAt && scores === null`, guard link buổi học khi `sessionDate` mồ côi/holiday/invalid, `focusedAssignmentId` 2 pha nhảy vào bài thuộc nhóm `"Đã chấm"`, và reset state khi đổi `classId`.
- **Success criteria:** Test chạy và fail vì `class-assignments-tab.tsx` chưa tồn tại.
- **Verify:** `pnpm --filter student test -- src/components/class/class-assignments-tab.test.tsx` exits non-zero (passing is a failure).

### Task 3.2 — Triển khai `ClassAssignmentsTab` (TDD Green)
- **Goal:** Hoàn thiện component `ClassAssignmentsTab` theo thiết kế `open-design/student-classes.html`, không dựng dữ liệu giả, không dùng hex cứng và reflow sạch ở `320px`.
- **Target files and symbols:** `apps/student/src/components/class/class-assignments-tab.tsx` (`ClassAssignmentsTab`).
- **Steps:**
  1. Nhận props: `classId`, `assignments`, `lessons`, `todayISO`, `nowMs`, `filter?: AssignmentTabFilter`, `onFilterChange?: (next: AssignmentTabFilter) => void`, `focusedAssignmentId?: string | null`, `onFocusHandled?: () => void`. Reset `expandedIds` và `gradedOpen` khi `classId` đổi.
  2. Phân nhóm với `deriveAssignmentStatus` + `evaluateAssignmentDeadline`:
     - `todo`: `overdue | due-soon | not-submitted`, sort theo `sortOrder` rồi hạn sớm nhất (`dueMs ?? Number.POSITIVE_INFINITY`), tie-break `id`.
     - `submitted`: `status === "submitted"`, sort theo hạn sớm nhất (`dueMs ?? Number.POSITIVE_INFINITY`).
     - `graded`: `status === "graded"`, sort theo hạn mới nhất trước (bài có hạn đứng trước bài không hạn: `dueMs ?? Number.NEGATIVE_INFINITY`).
  3. Tính `sessionNumberByDate = buildSessionNumberByDate(lessons)` và `clickableLessonByDate` (chỉ gồm buổi có `date != null && status !== "holiday"`).
  4. <!-- Updated: Red-Team RT-10 --> Render Todo Priority Strip (`border-[1.5px] border-primary` khi còn bài, `border` khi xong hết): chọn `nextActionable = todo.find((item) => item.assignment.source === "class_assignment") ?? null`, chỉ render CTA `<Link to="/learn/quizzes/$assignmentId">` `"Làm bài này"` khi `nextActionable != null` (không gán `aria-label` trùng `"Làm bài: <title>"` của row).
  5. <!-- Updated: Red-Team RT-11 --> Render Toolbar `"Bài tập của bạn"` + `role="group" aria-label="Lọc bài tập"` dùng `inline-flex max-w-full flex-wrap` với 4 nút `Tất cả`, `Cần làm`, `Đã nộp`, `Đã chấm` (count `aria-hidden="true"`).
  6. Render 3 `<section>` nhóm với danh sách `<ul>` viền `rounded-xl border bg-card divide-y`. Mỗi `<li>` có flex row `min-w-0 flex-wrap items-center gap-2` gồm nút co/mở (`aria-expanded`, `aria-controls`) và sibling `<Link>` 1-click (`aria-label="Làm bài: <title>"` hoặc `"Xem lại kết quả: <title>"`, chỉ khi `source === "class_assignment"`).
  7. <!-- Updated: Red-Team RT-10 --> Bên trong panel chi tiết (`bg-muted/50 px-4 py-4`, chỉ render dữ liệu thật): chỉ render liên kết `<Link to="/classes/$classId/sessions/$date">` khi `a.sessionDate` khớp `/^\d{4}-\d{2}-\d{2}$/` và tồn tại trong `clickableLessonByDate`; card kết quả điểm (`Band X.X` + 4 tiêu chí khi `scores != null`, hoặc thông báo đã chốt trả bài chung khi `gradedAt != null && scores == null`), ghi chú chờ chấm / đã nộp theo `hasGradableTask`, và nút hành động.
  8. <!-- Updated: Red-Team RT-9 --> Xử lý `useEffect` 2 pha cho `focusedAssignmentId`: nếu bài đích thuộc nhóm `graded` và `!gradedOpen` (khi `filter !== "graded"`), gọi `setGradedOpen(true)` và `return` (chưa gọi `onFocusHandled`); khi DOM nút row đã tồn tại & hiển thị (`btn != null`), thêm id vào `expandedIds`, gọi `btn.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "center" })`, `btn.focus({ preventScroll: true })`, rồi mới gọi `onFocusHandled?.()`.
- **Success criteria:** Toàn bộ test trong `class-assignments-tab.test.tsx` pass.
- **Verify:** `pnpm --filter student test -- src/components/class/class-assignments-tab.test.tsx` exits 0.

### Task 3.3 — Tích hợp `ClassAssignmentsTab` vào `ClassDetailView`, cập nhật `class-detail.test.tsx` và `student-practice.spec.ts`
- **Goal:** Thay `ClassAssignmentTable` bằng `ClassAssignmentsTab` trong tab `"assignments"` của `ClassDetailView` (giữ nguyên `ClassAssignmentTable` cho `SessionDetailView`), hoàn thiện luồng nhảy từ Tab 1 sang Tab 2, và cập nhật selector `role="listitem"` cho `student-practice.spec.ts:546`.
- **Target files and symbols:**
  - `apps/student/src/components/class/class-detail-view.tsx`
  - `apps/student/src/components/class/class-detail-view.test.tsx`
  - `apps/student/test/class-detail.test.tsx`
  - `apps/e2e/specs/student-practice.spec.ts` (dòng 546)
- **Steps:**
  1. Trong `ClassDetailView`, thay `ClassAssignmentTable` ở nhánh `tab === "assignments"` bằng `ClassAssignmentsTab`, truyền `classId={cls.id}`, `assignments={detail.assignments}`, `lessons={detail.lessons}`, `todayISO={todayISO}`, `nowMs={now.getTime()}`, `filter`, `onFilterChange`, `focusedAssignmentId`, `onFocusHandled`.
  2. Cập nhật `test/class-detail.test.tsx` lines 318-330 và 377-379 (không sửa suite `ClassAssignmentTable` ở lines 440-540).
  3. Thêm test tích hợp trong `class-detail-view.test.tsx` kiểm tra bấm `"Mở trong Bài tập"` ở Tab 1 (kể cả bài đã chấm nằm trong nhóm gập) chuyển sang Tab 2, chọn `aria-selected="true"` cho tab `Bài tập` và mở sẵn bài tương ứng.
  4. <!-- Updated: Red-Team RT-1 --> Cập nhật `apps/e2e/specs/student-practice.spec.ts:546` từ `body.getByRole("row")` sang `body.getByRole("listitem")`, giữ nguyên toàn bộ filter & assertion bên dưới.
- **Success criteria:** Tất cả unit tests liên quan và typecheck pass 100%.
- **Verify:** `pnpm --filter student test -- src/components/class/class-assignments-tab.test.tsx src/components/class/class-detail-view.test.tsx src/components/class/session-detail-view.test.tsx test/class-detail.test.tsx && pnpm --filter student exec tsc --noEmit` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
