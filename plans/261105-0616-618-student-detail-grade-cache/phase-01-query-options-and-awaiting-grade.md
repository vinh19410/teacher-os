# Phase 1: Query Options & Awaiting Grade Helper

## Goal
Xây dựng helper thuần `isAttemptAwaitingGrade` và cấu hình các trường `staleTime`, `refetchInterval`, `refetchOnWindowFocus` linh hoạt trên `attemptDetailQueryOptions` và `attemptSummaryQueryOptions` trong `apps/student/src/lib/repos/quiz.ts`.

## Files to Create or Modify
- `apps/student/src/lib/repos/quiz.ts` (symbols: `isAttemptAwaitingGrade`, `AWAITING_GRADE_POLL_INTERVAL_MS`, `attemptDetailQueryOptions`, `attemptSummaryQueryOptions`)
- `apps/student/test/attempt-query-options.test.ts` (file mới)

## Tasks & Steps

### Task 1.1 — TDD: Viết test cho `isAttemptAwaitingGrade` và query options
- **Goal:** Tạo bộ unit test định nghĩa hành vi kỳ vọng trước khi cài đặt.
- **Target files:** `apps/student/test/attempt-query-options.test.ts`.
- **Steps:**
  1. Tạo file test `attempt-query-options.test.ts`.
  2. Viết test suite cho `isAttemptAwaitingGrade`:
     - Trả về `false` khi attempt là `null` hoặc `undefined`.
     - Trả về `false` khi attempt đã có `grade` (ví dụ `{ band: 7.0, scores: {}, feedback: "Good" }`).
     - Trả về `false` khi là bài Reading/Listening thuần (`skill: "reading"`, không có essay hay writing hay media).
     - Trả về `true` khi `skill === "writing"` và chưa có `grade`.
     - Trả về `true` khi `skill === "speaking"` và chưa có `grade`.
     - Trả về `true` khi `essay != null` (dù là chuỗi rỗng hay có nội dung) và chưa có `grade`.
     - Trả về `true` khi có `writing: { part: "task2" }` (bài gộp hybrid) và chưa có `grade`.
     - Trả về `true` khi có `media: { url: "...", type: "audio/webm", name: "...", size: 100 }` và chưa có `grade`.
  3. Viết test suite cho `attemptDetailQueryOptions` và `attemptSummaryQueryOptions`:
     - Kiểm tra `staleTime`: trả về `0` khi data trong query state là bài chờ chấm; trả về `60_000` khi đã có grade hoặc bài trắc nghiệm thuần.
     - Kiểm tra `refetchInterval`: trả về `10_000` khi data trong query state là bài chờ chấm; trả về `false` khi đã có grade hoặc bài trắc nghiệm thuần.
     - Kiểm tra `refetchOnWindowFocus`: trả về `"always"` khi data trong query state là bài chờ chấm; trả về `false` khi đã có grade hoặc bài trắc nghiệm thuần.
- **Success criteria:** File test hoàn chỉnh, chạy lệnh test thất bại với lỗi import/syntax vì chưa export hàm (Red phase).
- **Verify:** `pnpm --filter student test attempt-query-options.test.ts` thoát mã lỗi khác 0 và báo lỗi thiếu symbol `isAttemptAwaitingGrade`.

### Task 1.2 — Triển khai `isAttemptAwaitingGrade` và cập nhật query options
- **Goal:** Hoàn thiện code trong `quiz.ts` để toàn bộ unit test ở Task 1.1 pass.
- **Target files:** `apps/student/src/lib/repos/quiz.ts`.
- **Steps:**
  1. Khai báo hằng số:
     ```ts
     export const AWAITING_GRADE_POLL_INTERVAL_MS = 10_000;
     ```
  2. Khai báo và export hàm `isAttemptAwaitingGrade`:
     ```ts
     export function isAttemptAwaitingGrade(
       attempt?: Pick<QuizAttemptSummary, "grade" | "skill" | "essay"> & {
         writing?: unknown;
         media?: unknown;
       } | null,
     ): boolean {
       if (!attempt || attempt.grade != null) {
         return false;
       }
       return (
         attempt.skill === "writing" ||
         attempt.skill === "speaking" ||
         attempt.essay != null ||
         Boolean(attempt.writing) ||
         Boolean(attempt.media)
       );
     }
     ```
  3. Cập nhật `attemptSummaryQueryOptions`:
     ```ts
     export function attemptSummaryQueryOptions(attemptId: string) {
       return {
         queryKey: ["student", "attempt", attemptId] as const,
         queryFn: () => fetchAttemptSummary(attemptId),
         staleTime: (query: { state: { data?: QuizAttemptSummary } }) =>
           isAttemptAwaitingGrade(query.state.data) ? 0 : 60_000,
         refetchInterval: (query: { state: { data?: QuizAttemptSummary } }) =>
           isAttemptAwaitingGrade(query.state.data)
             ? AWAITING_GRADE_POLL_INTERVAL_MS
             : false,
         refetchOnWindowFocus: (query: { state: { data?: QuizAttemptSummary } }) =>
           isAttemptAwaitingGrade(query.state.data) ? ("always" as const) : false,
       };
     }
     ```
  4. Cập nhật `attemptDetailQueryOptions`:
     ```ts
     export function attemptDetailQueryOptions(attemptId: string) {
       return {
         queryKey: ["student", "attempt", attemptId, "detail"] as const,
         queryFn: () => fetchAttemptDetail(attemptId),
         staleTime: (query: { state: { data?: QuizAttemptDetail } }) =>
           isAttemptAwaitingGrade(query.state.data) ? 0 : 60_000,
         refetchInterval: (query: { state: { data?: QuizAttemptDetail } }) =>
           isAttemptAwaitingGrade(query.state.data)
             ? AWAITING_GRADE_POLL_INTERVAL_MS
             : false,
         refetchOnWindowFocus: (query: { state: { data?: QuizAttemptDetail } }) =>
           isAttemptAwaitingGrade(query.state.data) ? ("always" as const) : false,
       };
     }
     ```
- **Success criteria:** Test file `attempt-query-options.test.ts` pass toàn bộ assertion.
- **Verify:** `pnpm --filter student test attempt-query-options.test.ts` thoát mã 0 và in `passed`.

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
