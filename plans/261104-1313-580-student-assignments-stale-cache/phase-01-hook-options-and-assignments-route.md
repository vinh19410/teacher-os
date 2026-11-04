# Phase 1: Tham số hóa hook useStudentOverview và cấu hình trang Bài tập

## Goal
Bổ sung tham số tùy chọn `options` cho `useStudentOverview` trong `apps/student/src/lib/repos/student.ts`, áp dụng cấu hình `refetchOnMount: "always"` và `refetchOnWindowFocus: "always"` tại `apps/student/src/routes/_auth/assignments/index.tsx`, và khắc phục điều kiện kiểm tra lỗi để không làm ẩn danh sách bài tập khi background refetch gặp sự cố mạng tạm thời.

## Files to Create or Modify
- `apps/student/src/lib/repos/student.ts` — Thêm tham số `options` cho `useStudentOverview`.
- `apps/student/src/routes/_auth/assignments/index.tsx` — Truyền tùy chọn `"always"` và bảo vệ error view `if (overviewQuery.error && !overviewQuery.data)`.

## Tasks & Steps

### Task 1.1 — Tham số hóa hook useStudentOverview trong repos/student.ts
- **Goal**: Cho phép các trang gọi hook `useStudentOverview` có thể tùy biến các chính sách refetch (`refetchOnMount`, `refetchOnWindowFocus`) mà không làm thay đổi hành vi mặc định của các màn hình khác (`staleTime: 60_000`, kế thừa query client default).
- **Target files and symbols**: `apps/student/src/lib/repos/student.ts` (`useStudentOverview`).
- **Steps**:
  1. Mở `apps/student/src/lib/repos/student.ts`.
  2. Định nghĩa kiểu cho `options` của `useStudentOverview`:
     ```ts
     export type UseStudentOverviewOptions = Pick<
       UseQueryOptions<StudentOverview, unknown, StudentOverview, readonly ["student", "overview"]>,
       "refetchOnMount" | "refetchOnWindowFocus"
     >;
     ```
  3. Cập nhật hàm `useStudentOverview`:
     ```ts
     export function useStudentOverview(options?: UseStudentOverviewOptions) {
       return useQuery({
         queryKey: ["student", "overview"],
         queryFn: fetchStudentOverview,
         staleTime: 60_000,
         ...options,
       });
     }
     ```
- **Success criteria**: Hàm chấp nhận `options` hợp lệ, giữ nguyên `staleTime: 60_000`, type check TypeScript không có lỗi.
- **Verify**: `pnpm --filter student exec tsc --noEmit` exits 0.

### Task 1.2 — Cấu hình refetchOnMount và refetchOnWindowFocus trên trang Bài tập
- **Goal**: Trang Bài tập (`/_auth/assignments/`) luôn kiểm tra và cập nhật bài tập mới nhất ngay khi người dùng chuyển sang trang hoặc quay lại tab, đồng thời đảm bảo không làm gián đoạn trải nghiệm người dùng khi refetch ngầm gặp lỗi.
- **Target files and symbols**: `apps/student/src/routes/_auth/assignments/index.tsx` (`StudentAssignmentsPage`).
- **Steps**:
  1. Trong `StudentAssignmentsPage`, cập nhật lời gọi hook:
     ```tsx
     const overviewQuery = useStudentOverview({
       refetchOnMount: "always",
       refetchOnWindowFocus: "always",
     });
     ```
  2. Sửa nhánh kiểm tra lỗi:
     ```tsx
     if (overviewQuery.error && !overviewQuery.data) {
       const err = overviewQuery.error;
       const code = isHttpError(err) ? err.code : undefined;
       return (
         <StudentErrorView
           code={code}
           userEmail={sessionEmail ?? me.user.email}
         />
       );
     }
     ```
     (Nếu có lỗi nhưng `overviewQuery.data` đã có từ cache trước đó, UI tiếp tục render danh sách bài tập bình thường).
- **Success criteria**: Trang Bài tập nhận cấu hình `"always"`, lỗi ngầm không che khuất dữ liệu.
- **Verify**: `pnpm --filter student exec tsc --noEmit` exits 0.

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
