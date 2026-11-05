# Phase 2: Integration & React Query Tests

## Goal
Xác minh hành vi end-to-end của React Query cache trên component: khi attempt chuyển từ trạng thái chờ chấm sang có điểm, refetch được kích hoạt tự động qua window focus hoặc interval, cập nhật giao diện và ngắt refetch.

## Files to Create or Modify
- `apps/student/test/attempt-detail-grade-refetch.test.tsx` (file mới)

## Tasks & Steps

### Task 2.1 — Viết test mô phỏng phản ứng của QueryClient và component
- **Goal:** Kiểm tra luồng component thực tế sử dụng `QueryClient` và hook `useAttemptDetail`:
  1. Ban đầu server trả bài nộp có Writing chưa chấm (`grade: null`). Trang hiển thị "Giáo viên sẽ chấm bài viết của bạn."
  2. Giả lập giáo viên chốt điểm trên server (mock API trả về payload có `grade`).
  3. Kích hoạt sự kiện window focus (`window.dispatchEvent(new Event("focus"))` hoặc `queryClient.invalidateQueries` / timer tick).
  4. Xác nhận query tự động fetch lại dữ liệu và component re-render hiển thị band điểm.
  5. Xác nhận sau khi có grade, `refetchInterval` trở về `false` (không poll thêm).
- **Target files:** `apps/student/test/attempt-detail-grade-refetch.test.tsx`.
- **Steps:**
  1. Dựng helper render component bọc trong `QueryClientProvider` với query client riêng (để cô lập cache giữa các test).
  2. Tạo mock payload attempt detail với và không có `grade`.
  3. Viết test case: Window focus khi đang chờ chấm kích hoạt refetch ngay.
  4. Viết test case: Window focus khi đã có grade KHÔNG kích hoạt refetch.
  5. Viết test case: Periodic timer khi đang chờ chấm kích hoạt refetch sau 10s.
- **Success criteria:** Test file chạy và pass toàn bộ kịch bản.
- **Verify:** `pnpm --filter student test attempt-detail-grade-refetch.test.tsx` thoát mã 0 và in `passed`.

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
