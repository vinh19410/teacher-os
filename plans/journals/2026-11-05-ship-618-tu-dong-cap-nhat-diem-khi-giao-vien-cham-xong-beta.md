---
title: "Ship #618: Tự động cập nhật điểm khi giáo viên chấm xong (beta)"
date: 2026-11-05
summary: "Cấu hình dynamic cache options cho student attempt queries (staleTime 15s, refetchOnWindowFocus 'always', refetchInterval 15s có cap 40 cycles khi chờ chấm), pass 100% tests, code review approved"
---

# Ship #618: Tự động cập nhật điểm khi giáo viên chấm xong (beta)

## Bối cảnh & Hiện tượng (#618)
- Sheet staging dòng #32, issue #618: Học viên mở trang `/detail` hoặc kết quả bài tập (`/$attemptId`), giáo viên chấm bài xong nhưng trang của học viên không tự cập nhật kết quả, kể cả khi quay lại tab sau hơn 1 phút.
- Nguyên nhân: `apps/student/src/lib/query-client.ts` tắt `refetchOnWindowFocus: false`, đồng thời `attemptDetailQueryOptions` và `attemptSummaryQueryOptions` đặt `staleTime: 60_000` và không có polling.

## Thay đổi kỹ thuật
1. `apps/student/src/lib/repos/quiz.ts`:
   - Thêm helper thuần `isAttemptAwaitingGrade` nhận diện bài cần chấm điểm tay (Writing, Speaking, Hybrid Writing) khi chưa có `grade`. Loại trừ bài đã có `grade` và bài trắc nghiệm tự động tính điểm (Reading/Listening).
   - Thêm cấu hình dynamic query options dùng chung `awaitingGradeQueryOptions`:
     * `staleTime`: 15s khi chờ chấm (tránh duplicate fetch on mount), 60s khi đã có điểm.
     * `refetchInterval`: 15s khi chờ chấm và chưa vượt 40 updates (cap 10 phút); `false` khi đã có điểm.
     * `refetchOnWindowFocus`: `"always"` khi chờ chấm; `false` khi đã có điểm.
2. `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`:
   - Đồng bộ nhãn "Đã nộp — Đang chờ giáo viên chấm" với `isAttemptAwaitingGrade(summary)`.
3. Kiểm thử:
   - `attempt-query-options.test.ts`: 11 unit tests kiểm tra logic phân loại và cấu hình cache options.
   - `attempt-detail-grade-refetch.test.tsx`: 3 integration tests kiểm tra window focus refetching, dynamic polling cap, và mount không duplicate request.
   - Toàn bộ student test suite (50 test files, 469 tests) pass 100%. Typecheck toàn repo pass 100%.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
