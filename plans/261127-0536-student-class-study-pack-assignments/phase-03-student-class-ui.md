---
phase: 3
title: "Phase 3: Student Class UI"
status: pending
priority: P1
effort: "1h30m"
dependencies: [1, 2]
---

# Phase 3: Student Class UI

## Goal
Cập nhật giao diện chi tiết lớp học viên: Tab `Bài tập` chỉ hiển thị bài bộ đề tự học kèm ngày dự kiến và cho làm trước; `TodoBanner` chỉ đếm bài đến hạn hôm nay cho bộ đề tự học (giữ nguyên homework giao tay); `ClassLessonList` dùng link quiz trực tiếp thay cho `"Mở trong Bài tập"`.

## Files to Create / Modify
- Modify: `apps/student/src/components/class/class-detail-helpers.ts`
- Modify: `apps/student/src/components/class/class-detail-helpers.test.ts`
- Modify: `apps/student/src/components/class/class-detail-view.tsx`
- Modify: `apps/student/src/components/class/class-detail-view.test.tsx`
- Modify: `apps/student/src/components/class/class-lesson-list.tsx`
- Modify: `apps/student/src/components/class/class-lesson-list.test.tsx`
- Modify: `apps/student/src/components/class/class-assignments-tab.tsx`
- Modify: `apps/student/src/components/class/class-assignments-tab.test.tsx`

## Tasks & Steps

### Task 3.1 — TDD Red: Cập nhật và bổ sung unit tests cho helpers, `ClassAssignmentsTab`, `ClassLessonList`, `ClassDetailView`
- Goal: Khóa hành vi UI mới bằng unit tests thất bại trước khi sửa code component.
- Target files and symbols:
  - `apps/student/src/components/class/class-detail-helpers.test.ts`
  - `apps/student/src/components/class/class-assignments-tab.test.tsx`
  - `apps/student/src/components/class/class-lesson-list.test.tsx`
  - `apps/student/src/components/class/class-detail-view.test.tsx`
- Steps:
  1. Trong `class-detail-helpers.test.ts`: thêm test cho `resolveAssignmentExpectedDateISO`, `isStudyPackUpcoming` (trả `false` cho bài manual dù `due > todayISO`), và `isClassAssignmentDueNow` (trả `true` cho bài manual có `due` tương lai, `false` cho bài study-pack có ngày dự kiến tương lai).
  2. Trong `class-assignments-tab.test.tsx`: viết lại/bổ sung tests kiểm tra: lọc bỏ homework (`classStudyPackId == null`), empty state `"Chưa có bộ đề tự học"` (nút `"Xem Hành trình học"` chỉ hiện khi có homework gắn buổi `sessionDate != null`; nếu chỉ có homework `sessionDate == null` thì link tới `/assignments`), hiển thị bài quá hạn + hôm nay (cả trước 17:00 `"Hôm nay"` và sau 17:00 `"Quá hạn"`) + tương lai (+1 ngày trở đi) với `Dự kiến:`, bài tương lai không gắn `"Quá hạn"`/`"Sắp đến hạn"` mà gắn `"Có thể làm trước"` + link `Làm bài` luôn bấm được, sort theo `dayIndex`/`position`/`due`, multi-pack (gồm `cancelled`), 4 bộ lọc, 4 tiêu chí IELTS & nhánh `gradedAt && scores == null`, strip 3 trạng thái.
  3. Trong `class-lesson-list.test.tsx`: cập nhật test dòng 1080–1145 kiểm tra link `Làm bài` / `Xem lại` / `Nhận xét` trỏ thẳng `/learn/quizzes/...` kèm hạn nộp và không còn nút `"Mở trong Bài tập"`.
  4. Trong `class-detail-view.test.tsx`: cập nhật test dòng 271–311 và thêm test kiểm tra `TodoBanner` không đếm bài bộ đề tương lai nhưng vẫn đếm bài homework giao tay hạn tuần sau, `RingStat` đếm toàn khóa (kể cả `gradedAt != null`), Tab `Bài tập` chỉ hiện bộ đề tự học.
- Success criteria: Chạy vitest trên 4 file test ra trạng thái đỏ (failure) đúng chỗ thay đổi.
- Verify: `pnpm --filter student exec vitest run src/components/class/class-detail-helpers.test.ts src/components/class/class-assignments-tab.test.tsx src/components/class/class-lesson-list.test.tsx src/components/class/class-detail-view.test.tsx` exits non-zero.

### Task 3.2 — Helpers ngày dự kiến trong `class-detail-helpers.ts`
- Goal: Cung cấp hàm thuần dùng chung cho `TodoBanner` và `ClassAssignmentsTab`.
- Target files and symbols: `apps/student/src/components/class/class-detail-helpers.ts` (`resolveAssignmentExpectedDateISO`, `isStudyPackUpcoming`, `isClassAssignmentDueNow`).
- Steps:
  1. Implement `resolveAssignmentExpectedDateISO(assignment)`: kiểm tra `assignment.due` theo `STRICT_ISO_DATE_RE`, fallback sang `vietnamDateKeyOf` từ `availableAt` hoặc `dueAt`.
  2. Implement `isStudyPackUpcoming(assignment, todayISO)`: chỉ trả `true` khi `Boolean(assignment.classStudyPackId)` và `expectedDateISO != null && expectedDateISO > todayISO` (bài manual luôn trả `false`).
  3. Implement `isClassAssignmentDueNow(assignment, todayISO)`: trả `!isStudyPackUpcoming(assignment, todayISO)` (bài manual luôn `true`; bài study-pack chỉ `true` khi `expectedDateISO == null || expectedDateISO <= todayISO`).
- Success criteria: Helper xử lý chuẩn múi giờ VN (UTC+7), an toàn với chuỗi rỗng/không hợp lệ, không lọc nhầm homework hạn tương lai.
- Verify: no verification needed (covered by Task 3.6).

### Task 3.3 — Cập nhật `ClassDetailView` (`class-detail-view.tsx`)
- Goal: `TodoBanner` chỉ đếm bài homework + bài bộ đề đến hạn đến hôm nay; `RingStat` đếm toàn khóa kể cả `gradedAt`; xóa plumbing `focusedAssignmentId`; truyền `onGoToJourney` cho `ClassAssignmentsTab`.
- Target files and symbols: `apps/student/src/components/class/class-detail-view.tsx` (`computeRingStats`, `TodoBanner`, `ClassDetailView`).
- Steps:
  1. Cập nhật `computeRingStats`: `submitted` kiểm tra `a.submittedAt != null || a.gradedAt != null || a.scores != null`.
  2. Cập nhật `TodoBanner`: thêm `a.gradedAt == null && isClassAssignmentDueNow(a, todayISO)`.
  3. Gỡ `focusedAssignmentId`, `handleOpenAssignmentFromJourney`, `handleAssignmentFocusHandled`; thêm `handleGoToJourney`; cập nhật props truyền xuống `ClassLessonList` và `ClassAssignmentsTab`.
- Success criteria: Không còn state/plumbing dead jump; `TodoBanner` không đếm bài bộ đề tương lai nhưng giữ homework giao tay.
- Verify: no verification needed (covered by Task 3.6).

### Task 3.4 — Cập nhật `ClassLessonList` (`class-lesson-list.tsx`)
- Goal: Thay nút `"Mở trong Bài tập"` bằng `<Link to="/learn/quizzes/$assignmentId">` trực tiếp kèm hạn nộp `derived.dueText`.
- Target files and symbols: `apps/student/src/components/class/class-lesson-list.tsx` (`LessonDetailPanel`, `LessonRow`, `ClassLessonList`).
- Steps:
  1. Gỡ prop `onOpenAssignment` ở `LessonDetailPanel`, `LessonRow`, `ClassLessonList`.
  2. Trong `LessonDetailPanel`: hiển thị `derived.dueText` dưới `item.title` và render `<Link to="/learn/quizzes/$assignmentId" params={{ assignmentId: item.id }}>` khi `item.source === "class_assignment"` với nhãn `Làm bài` / `Xem lại` / `Nhận xét` và `aria-label` duy nhất.
- Success criteria: Học viên làm/xem bài tập gắn buổi trực tiếp trong 1 click ngay từ Tab `Hành trình học`.
- Verify: no verification needed (covered by Task 3.6).

### Task 3.5 — Redesign `ClassAssignmentsTab` (`class-assignments-tab.tsx`)
- Goal: Chỉ hiển thị bài bộ đề tự học (`classStudyPackId != null`), hiển thị đầy đủ tất cả ngày kèm ngày dự kiến, nhóm rõ `Cần làm hôm nay & quá hạn` / `Lịch sắp tới · Có thể làm trước` / `Đã nộp` / `Đã chấm`, và không chặn làm trước.
- Target files and symbols: `apps/student/src/components/class/class-assignments-tab.tsx` (`ClassAssignmentsTabProps`, `ClassAssignmentsTab`, `AssignmentRow`).
- Steps:
  1. Lọc `studyPackAssignments = assignments.filter((a) => Boolean(a.classStudyPackId))`; phân biệt `hasSessionHomework = assignments.some((a) => !a.classStudyPackId && Boolean(a.sessionDate))` và `hasUnlinkedHomework = assignments.some((a) => !a.classStudyPackId && !a.sessionDate)`.
  2. Empty state khi `studyPackAssignments.length === 0`: tiêu đề `"Chưa có bộ đề tự học"`; nếu `hasSessionHomework` → mô tả dẫn về Tab `Hành trình học` + nút `"Xem Hành trình học"` gọi `onGoToJourney`; else if `hasUnlinkedHomework` → mô tả dẫn về trang Bài tập chung + `<Link to="/assignments">Xem tất cả bài tập</Link>`; else → mô tả chưa gán bộ đề tự học.
  3. Implement `deriveStudyPackPresentation` theo **đúng thứ tự ưu tiên**:
     1) Đã nộp / đã chấm (`submittedAt || gradedAt || scores`) → giữ `derived.statusLabel`, `statusChipClass(derived)`, dòng `Dự kiến: ...` (+ `" · Làm sớm"` nếu ngày nộp VN `< expectedDateISO`).
     2) Quá hạn (`deadline.isOverdue`) → kiểm tra **trước** nhánh `"Hôm nay"` để bài hôm nay sau giờ `dueAt` (`17:00`) hiển thị badge `"Quá hạn"` (`--danger`) chứ không thành `"Hôm nay"`.
     3) Đến hạn hôm nay (`expectedDateISO === todayISO`) → badge `"Hôm nay"` (`--warn`), dòng `"Dự kiến: Hôm nay (dd/mm)"` (+ `" · hạn HH:mm"`).
     4) Tương lai (`expectedDateISO > todayISO`) hoặc fallback chưa quá hạn → badge outline neutral `"Có thể làm trước"` (**tuyệt đối không** qua `deriveAssignmentStatus` gán amber `"Sắp đến hạn"`), dòng `"Dự kiến: Ngày mai (dd/mm)"` / `"Dự kiến: ${formatVietnamDateFromISO(expectedDateISO)}"` (+ `" · hạn HH:mm"`), nút `"Làm bài"` luôn bấm được.
  4. Cập nhật `assignments-todo-strip` (3 nhánh), bộ lọc `Tất cả | Chưa làm | Đã nộp | Đã chấm` (giữ `af` URL param `all | todo | submitted | graded`), sort xác định theo `dayIndex`, `position`, `due`, `id`, hỗ trợ nhiều bộ đề (gồm pack `cancelled`), bỏ khối `"Xem buổi học"` và prop `lessons`/`focusedAssignmentId`.
- Success criteria: Toàn bộ bài bộ đề tự học hiển thị đúng thứ tự, rõ ngày dự kiến, phân định chính xác Quá hạn / Hôm nay / Có thể làm trước, luôn bấm làm trước được, tuân thủ token `DESIGN.md`.
- Verify: no verification needed (covered by Task 3.6).

### Task 3.6 — Verify toàn bộ student tests & typecheck
- Goal: Xác nhận toàn bộ `apps/student` tests và typecheck xanh.
- Target files and symbols: `apps/student`
- Steps:
  1. Chạy `pnpm --filter student test && pnpm --filter student check-types`.
- Success criteria: Exit code 0, 0 failures.
- Verify: `pnpm --filter student test && pnpm --filter student check-types` exits 0 with 0 failures.

## Todo
- [ ] Task 3.1: TDD Red unit tests
- [ ] Task 3.2: Expected-date helpers
- [ ] Task 3.3: `ClassDetailView` updates
- [ ] Task 3.4: `ClassLessonList` direct quiz link
- [ ] Task 3.5: `ClassAssignmentsTab` study-pack view
- [ ] Task 3.6: Verify `apps/student` tests & types

## Verification
- `pnpm --filter student test && pnpm --filter student check-types`

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
