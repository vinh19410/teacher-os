# Phase 2: Bộ kiểm thử TDD và kiểm tra chất lượng mã nguồn

## Goal
Xây dựng bộ kiểm thử tự động toàn diện kiểm chứng:
1. `useStudentOverview` ở chế độ mặc định không refetch khi cache còn hạn, nhưng khi có options `"always"` thì kích hoạt refetch ngay khi mount và khi window focus.
2. Trang Bài tập (`StudentAssignmentsPage`) hiển thị dữ liệu ban đầu từ cache ngay lập tức, tự động cập nhật bài mới (Homework 2) sau khi background refetch hoàn thành mà không hiện loading spinner flash.
3. Khi window focus được kích hoạt lại (`focusManager.setFocused(true)`), query overview được refetch.
4. Khi background refetch bị lỗi mạng (500), danh sách bài tập cũ vẫn được hiển thị ổn định, không bị sập sang `StudentErrorView`.
5. Đảm bảo toàn bộ test suites và kiểm tra cú pháp, types (`pnpm check`, `pnpm check-types`, `pnpm --filter student test`) đạt 100% pass.

## Files to Create or Modify
- `apps/student/test/student-overview-cache.test.tsx` — Test unit và component test cho hook và trang Bài tập.

## Tasks & Steps

### Task 2.1 — Viết test TDD cho hook useStudentOverview và trang Bài tập
- **Goal**: Kiểm chứng đầy đủ các kịch bản stale cache, refetch on mount, window focus, và error resilience.
- **Target files and symbols**: `apps/student/test/student-overview-cache.test.tsx`.
- **Steps**:
  1. Tạo file `apps/student/test/student-overview-cache.test.tsx`.
  2. Mock `fetchStudentOverview` từ `@/lib/repos/student` (hoặc mock global `fetch`).
  3. Kịch bản 1: Hook default vs options:
     - Tạo `QueryClient` với `defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false } }`.
     - Seed query `["student", "overview"]` với mock HW1.
     - Gọi `renderHook(() => useStudentOverview())`: assert fetcher KHÔNG được gọi lại.
     - Gọi `renderHook(() => useStudentOverview({ refetchOnMount: "always", refetchOnWindowFocus: "always" }))`: assert fetcher ĐƯỢC gọi ngay lập tức.
  4. Kịch bản 2: Component Bài tập cập nhật bài tập mới:
     - Setup fetcher trả về `{ ...overview, assignments: [hw1, hw2] }`.
     - Mount trang Bài tập (đã seed trước HW1 vào cache).
     - Assert HW1 hiển thị ngay (không có loader/spinner).
     - Đợi query resolve: assert HW2 xuất hiện trên giao diện.
  5. Kịch bản 3: Window focus revalidation:
     - Dùng `focusManager.setFocused(false)` rồi `focusManager.setFocused(true)`.
     - Assert fetcher được gọi thêm một lần nữa.
  6. Kịch bản 4: Background refetch error resilience:
     - Setup fetcher reject với `new HttpError(500, "Server Error")`.
     - Cache đã có HW1.
     - Mount component hoặc trigger refetch.
     - Assert HW1 vẫn hiển thị, `StudentErrorView` không xuất hiện.
- **Success criteria**: Bộ test chạy xanh hoàn toàn.
- **Verify**: `pnpm --filter student exec vitest run test/student-overview-cache.test.tsx` exits 0.

### Task 2.2 — Chạy toàn bộ test suite và code quality gates
- **Goal**: Đảm bảo không có bất kỳ regression nào trong toàn bộ ứng dụng student và monorepo.
- **Target files and symbols**: Monorepo checks.
- **Steps**:
  1. Chạy `pnpm --filter student test`.
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm exec biome check .` (hoặc `pnpm check`).
- **Success criteria**: Tất cả các lệnh thoát với mã 0.
- **Verify**:
  - `pnpm --filter student test` exits 0
  - `pnpm check-types` exits 0
  - `pnpm exec biome check .` exits 0

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
