---
phase: 1
title: "Phase 1: Student Route CTA Update & Unit Tests (TDD)"
status: completed
priority: P1
effort: "45m"
dependencies: []
---

# Phase 1: Student Route CTA Update & Unit Tests (TDD)

## Goal

Đổi nhãn nút CTA trên `AttemptScoreCard` ở màn hình kết quả làm bài (`apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`) từ `"Xem giải thích chi tiết"` sang `"Xem chi tiết bài làm"`, bảo đảm không hứa hẹn nội dung giải thích khi bài tập không có `explanation` hay `note`; đồng thời cập nhật toàn diện các unit test liên quan theo quy trình TDD.

## Files to Create / Modify

- Modify: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
- Modify: `apps/student/test/attempt-summary.test.tsx`
- Modify: `apps/student/test/quiz-review-item.test.tsx`

## Tasks & Steps

### Task 1.1 — Viết Red test cho nhãn CTA mới và trạng thái rỗng của giải thích
- Goal: Bổ sung assertion kiểm tra nhãn `"Xem chi tiết bài làm"` trong `apps/student/test/attempt-summary.test.tsx` và kiểm tra trạng thái bài không có giải thích trong `apps/student/test/quiz-review-item.test.tsx`.
- Target files:
  - `apps/student/test/attempt-summary.test.tsx`
  - `apps/student/test/quiz-review-item.test.tsx`
- Steps:
  1. Trong `apps/student/test/attempt-summary.test.tsx`:
     - Thêm test case assert CTA mang nhãn `"Xem chi tiết bài làm"` trỏ tới route detail.
     - Xác nhận test fail khi source code tại `$attemptId.tsx` vẫn mang nhãn cũ `"Xem giải thích chi tiết"`.
  2. Trong `apps/student/test/quiz-review-item.test.tsx`:
     - Thêm test case xác nhận khi cả `explanation` và `note` đều rỗng, `QuizReviewItem` chỉ hiển thị `Đáp án` (và `Bạn trả lời` nếu sai), không render `quiz-review-explanation` hay bất kỳ disclosure rỗng nào.
- Success criteria: Test fail có chủ đích do `$attemptId.tsx` chưa cập nhật nhãn mới.
- Verify: `pnpm --filter student test -- attempt-summary.test.tsx` exits non-zero với assertion failure `"Xem chi tiết bài làm"`; nếu exit 0 ngay là chưa đạt điều kiện Red.

### Task 1.2 — Cập nhật nhãn CTA tại `$attemptId.tsx` và đồng bộ unit test (Green)
- Goal: Đổi nhãn nút CTA tại route summary và cập nhật toàn bộ 7 vị trí assert trong `attempt-summary.test.tsx` để test chuyển xanh.
- Target files:
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx` (dòng 284)
  - `apps/student/test/attempt-summary.test.tsx`
- Steps:
  1. Trong `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`:
     - Sửa chuỗi con trong `<Link to="/learn/quizzes/attempt/$attemptId/detail" ...>` từ `"Xem giải thích chi tiết"` thành `"Xem chi tiết bài làm"`.
  2. Trong `apps/student/test/attempt-summary.test.tsx`:
     - Cập nhật dòng 132: đổi `"Xem giải thích chi tiết"` sang `"Xem chi tiết bài làm"`.
     - Cập nhật dòng 153-154: đổi mô tả test và assertion `expect(html).toContain("Xem chi tiết bài làm")`.
     - Cập nhật dòng 227: đổi `expect(html).not.toContain("Xem chi tiết bài làm")` (Writing không hiện CTA).
     - Cập nhật dòng 252: đổi `expect(html).toContain("Xem chi tiết bài làm")`.
     - Cập nhật dòng 308: đổi `expect(html).not.toContain("Xem chi tiết bài làm")` (Speaking không hiện CTA).
     - Cập nhật dòng 330, 338: đổi `expect(html).toContain("Xem chi tiết bài làm")`.
     - Đảm bảo không còn chuỗi `"Xem giải thích chi tiết"` trong file test.
- Success criteria: Toàn bộ unit test của `apps/student` chạy qua thành công.
- Verify: `pnpm --filter student test -- attempt-summary.test.tsx quiz-review-item.test.tsx` exits 0 và output có `passed`.

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
