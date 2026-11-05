---
title: "fix(student): tự động cập nhật điểm khi giáo viên chấm xong (#618)"
description: "Cấu hình refetchOnWindowFocus và refetchInterval cho attemptDetailQueryOptions và attemptSummaryQueryOptions khi bài còn chờ chấm, dừng khi đã có grade"
status: completed
priority: P2
effort: "30m"
issue: 618
branch: vinh19410/ai-handle-issue-618
tags: [student, quiz, attempt, cache, react-query, grading]
blockedBy: []
blocks: []
created: 2026-11-05
---

# 618-student-detail-grade-cache

## Overview

Sheet "TeacherOS staging - Theo dõi lỗi" (dòng #32, issue #618) phản ánh:
Học viên đang mở trang `/detail` (hoặc `/attemptId`) của bài gộp trắc nghiệm + Writing (hoặc Writing/Speaking) khi giáo viên chấm xong thì trang vẫn ghi "Giáo viên sẽ chấm bài viết của bạn." và không có kết quả, kể cả khi quay lại tab sau hơn một phút.

### Nguyên nhân kỹ thuật
1. `apps/student/src/lib/repos/quiz.ts`:
   - `attemptDetailQueryOptions` đặt `staleTime: 60_000`, không cấu hình `refetchInterval` hay `refetchOnWindowFocus`.
   - `attemptSummaryQueryOptions` cũng đặt `staleTime: 60_000`, không cấu hình `refetchInterval` hay `refetchOnWindowFocus`.
2. `apps/student/src/lib/query-client.ts`:
   - Default options tắt toàn bộ: `refetchOnWindowFocus: false`, `refetchOnReconnect: false`.
3. Khi học viên mở trang `/detail` hoặc trang kết quả, dữ liệu attempt được lưu vào React Query cache. Dù sau 60 giây cache đã stale, do `refetchOnWindowFocus` bị tắt và trang không có cơ chế polling, học viên quay lại tab sau khi giáo viên chấm xong vẫn thấy dữ liệu cũ từ cache memory.

### Hướng giải quyết
1. Xây dựng helper kiểm tra bài đang chờ chấm: `isAttemptAwaitingGrade(attempt)`.
   - Trả về `true` khi attempt chưa có `grade` (`attempt.grade == null`) và thuộc loại bài cần giáo viên chấm: `skill === "writing"` | `skill === "speaking"` | `essay != null` | `Boolean(writing)` | `Boolean(media)`.
   - Trả về `false` khi attempt đã có `grade` hoặc là bài trắc nghiệm thuần (Reading/Listening) tự động tính điểm.
2. Cấu hình linh hoạt (dynamic) trên `attemptDetailQueryOptions` và `attemptSummaryQueryOptions`:
   - `staleTime`: khi đang chờ chấm trả về `0` (luôn coi là stale để mount/focus là refetch); khi đã có grade hoặc bài tự chấm trả về `60_000`.
   - `refetchInterval`: khi đang chờ chấm trả về `10_000` (10 giây poll một lần khi tab active); khi đã có grade trả về `false` (dừng poll).
   - `refetchOnWindowFocus`: khi đang chờ chấm trả về `"always"` (học viên quay lại tab là kích hoạt refetch ngay); khi đã có grade trả về `false`.
3. Kiểm thử TDD và integration:
   - Unit test kiểm tra helper `isAttemptAwaitingGrade` với đầy đủ các trường hợp: Reading/Listening thuần, Writing chưa chấm, Speaking chưa chấm, bài gộp Hybrid chưa chấm, bài đã có grade.
   - Unit test kiểm tra các query option (`staleTime`, `refetchInterval`, `refetchOnWindowFocus`) sinh ra đúng giá trị theo trạng thái query.
   - Component test mô phỏng kịch bản: mount trang detail khi chưa chấm -> giáo viên chấm xong -> refetch cập nhật sang trạng thái có điểm (`grade-band`), dừng poll.

## Advisor Scope Lock

- **Locked Scope:**
  - `apps/student/src/lib/repos/quiz.ts` (thêm `isAttemptAwaitingGrade`, cập nhật `attemptDetailQueryOptions` và `attemptSummaryQueryOptions`).
  - Unit & component tests: `apps/student/test/attempt-query-options.test.ts`, `apps/student/test/attempt-detail-grade-refetch.test.tsx`.
  - `CHANGELOG.md`.
- **Explicit Non-Goals:**
  - Không thay đổi server API (server đã trả đúng `grade` khi đã chấm).
  - Không thay đổi contracts (`QuizAttemptSummary`, `QuizAttemptDetail`).
  - Không can thiệp vào các query khác ngoài attempt detail và attempt summary.
  - Không poll ngầm khi tab ở background (TanStack Query mặc định `refetchIntervalInBackground: false`).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Thêm helper `isAttemptAwaitingGrade` và cấu hình dynamic cache options cho `attemptDetailQueryOptions` & `attemptSummaryQueryOptions` | P2 |
| 2 | Viết unit test và component integration test chứng minh trang tự động refetch khi quay lại tab và định kỳ 10s khi đang chờ chấm, dừng khi có grade | P2 |
| 3 | Chạy toàn bộ test suites, lint, typecheck và cập nhật CHANGELOG | P2 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Query Options & Awaiting Grade Helper](./phase-01-query-options-and-awaiting-grade.md) | completed |
| 2 | [Phase 2: Integration & React Query Tests](./phase-02-integration-and-react-query-tests.md) | completed |
| 3 | [Phase 3: Verification & Quality Gate](./phase-03-verification-and-quality-gate.md) | completed |

## Acceptance Criteria

- [x] `isAttemptAwaitingGrade` nhận diện chính xác bài chờ chấm: Writing, Speaking, Hybrid (MCQ + Writing) khi chưa có `grade`.
- [x] `isAttemptAwaitingGrade` trả về `false` với bài Reading/Listening thuần hoặc bài đã có `grade`.
- [x] `attemptDetailQueryOptions` và `attemptSummaryQueryOptions` có `refetchInterval = 15_000` (giới hạn 10 phút) và `refetchOnWindowFocus = "always"` khi data đang chờ chấm; trả về `false` khi đã có grade.
- [x] `staleTime` trả về `15_000` khi data đang chờ chấm và `60_000` khi đã có grade.
- [x] Khi học viên chuyển tab và quay lại, query tự động refetch lấy điểm mới mà không cần F5.
- [x] Khi có điểm mới, UI cập nhật hiện `AttemptGradeCard`, ẩn dòng "Giáo viên sẽ chấm...", và ngừng polling.
- [x] Toàn bộ unit tests mới và cũ pass 100%; `pnpm check-types` và `pnpm check` pass 100%.

## Red Team Review

| # | Finding | Severity | Lens | Disposition | Rationale / Resolution |
|---|---------|----------|------|-------------|------------------------|
| 1 | Poll liên tục có thể gây tải server nếu học viên treo máy nhiều giờ | Medium | Failure Mode Analyst | Accept | TanStack Query mặc định `refetchIntervalInBackground: false`, tab ẩn sẽ dừng poll hoàn toàn. Chu kỳ 10s là phù hợp, và khi giáo viên chấm xong sẽ tự động ngắt poll ngay. |
| 2 | `query.state.data` có thể `undefined` ở lần fetch đầu tiên trước khi có data | High | Assumption Destroyer | Accept | `isAttemptAwaitingGrade(data)` xử lý an toàn: `if (!data) return false`. Khi đang pending lần đầu, TanStack Query đang fetch sẵn, không cần poll. |
| 3 | Network error hoặc server 500 có thể khiến poll lặp vô tận | Medium | Failure Mode Analyst | Accept | Nếu query rơi vào error (`data` rỗng), `isAttemptAwaitingGrade` trả về `false`, không poll đè lên lỗi. |
| 4 | Chuyển đổi giữa route `/attemptId` (summary) và `/detail` có thể đọc cache cũ | Low | Edge Case Hunter | Accept | Vì `staleTime` trả về `0` khi chưa có grade, việc chuyển route mount component sẽ lập tức kích hoạt revalidation. |

### Whole-Plan Consistency Sweep
- Đã đối chiếu các callsite của `useAttemptDetail` và `useAttemptSummary` trên `apps/student`:
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.tsx`
  - `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx`
  - `apps/student/src/components/history/writing-review.tsx`
  Tất cả đều dùng chung hai query options trên, hưởng lợi tự động từ fix mà không phải sửa logic từng component.

## Validation Log

### Verification Results
- Claims checked: 6
- Verified: 6 | Failed: 0 | Unverified: 0
- Key facts verified:
  - `attemptDetailQueryOptions` tại `apps/student/src/lib/repos/quiz.ts:229` hiện có `staleTime: 60_000`, không có `refetchInterval` hay `refetchOnWindowFocus`.
  - `attemptSummaryQueryOptions` tại `apps/student/src/lib/repos/quiz.ts:202` hiện có `staleTime: 60_000`.
  - `apps/student/src/lib/query-client.ts:44` đặt `refetchOnWindowFocus: false`.
  - TanStack Query v5 hỗ trợ hàm cho `staleTime`, `refetchInterval`, `refetchOnWindowFocus` nhận `{ state: { data } }`.
  - Trạng thái chờ chấm hiển thị tại `$attemptId.detail.tsx:218` ("Giáo viên sẽ chấm bài viết của bạn.") và `$attemptId.tsx:147` ("Đã nộp — Đang chờ giáo viên chấm").
