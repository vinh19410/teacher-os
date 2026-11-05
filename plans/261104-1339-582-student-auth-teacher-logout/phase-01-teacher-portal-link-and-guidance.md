# Phase 1: Bổ sung liên kết cổng giáo viên và kiểm thử StudentErrorView

## Goal
Cung cấp nút điều hướng sang cổng giáo viên, hoàn thiện copy hướng dẫn cho trường hợp `TEACHER_ON_STUDENT_PORTAL` trên `apps/student`, ẩn an toàn khi không phân giải được host, và bổ sung bộ test tự động kiểm chứng hành vi giao diện và giải quyết URL cổng giáo viên.

## Target files and symbols
- `apps/student/src/lib/teacher-portal-url.ts`: hàm `getTeacherPortalUrl(loc?: { hostname: string; protocol: string; port?: string } | Location): string | undefined`.
- `apps/student/test/teacher-portal-url.test.ts`: test cases cho `getTeacherPortalUrl` trên production, staging, local dev (8003 -> 8001, 8103 -> 8101), và unknown host (`undefined`).
- `apps/student/src/components/overview/student-error-view.tsx`:
  - Trong nhánh `ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL`: cập nhật `description`.
  - Nếu `teacherPortalUrl` tồn tại: hiển thị nút chính liên kết sang cổng giáo viên (`<a href={teacherPortalUrl} ...>`) kèm icon `ExternalLink` (hoặc plain navigation).
  - Giữ nút "Đăng xuất" với `handleSignOut` điều hướng về `/login`.
- `apps/student/test/overview.test.tsx`: bổ sung test render cho `TEACHER_ON_STUDENT_PORTAL` kiểm tra cả trường hợp có link cổng giáo viên và trường hợp ẩn link khi host không xác định.
- `CHANGELOG.md`: cập nhật dòng fix cho Issue #582.

## Tasks & Steps

### Task 1.1 — Viết test và triển khai helper giải quyết URL cổng giáo viên (TDD)
- Goal: Xây dựng hàm `getTeacherPortalUrl` tự động suy luận domain cổng giáo viên từ môi trường hiện tại hoặc trả về `undefined`.
- Target files:
  - `apps/student/src/lib/teacher-portal-url.ts`
  - `apps/student/test/teacher-portal-url.test.ts`
- Steps:
  1. Viết test `apps/student/test/teacher-portal-url.test.ts`:
     - Khi host là `student.teacheros.io.vn` -> trả về `https://app.teacheros.io.vn`
     - Khi host là `student.staging.teacheros.io.vn` -> trả về `https://app.staging.teacheros.io.vn`
     - Khi host là `localhost:8003` -> trả về `http://localhost:8001`
     - Khi host là `localhost:8103` -> trả về `http://localhost:8101`
     - Khi host là loopback `127.0.0.1:8003` -> trả về `http://127.0.0.1:8001`
     - Khi host là `unknown.workers.dev` -> trả về `undefined`
     - Khi chạy không truyền tham số mà `window` undefined -> trả về `undefined`
  2. Viết file `apps/student/src/lib/teacher-portal-url.ts` hiện thực hàm `getTeacherPortalUrl(loc?: { hostname: string; protocol: string; port?: string } | Location): string | undefined`.
- Success criteria: Test file pass toàn bộ assertions.
- Verify: `pnpm --filter student exec vitest run test/teacher-portal-url.test.ts` thoát 0 và in `passed`.

### Task 1.2 — Cập nhật giao diện StudentErrorView khi gặp TEACHER_ON_STUDENT_PORTAL (TDD)
- Goal: Hiển thị liên kết sang cổng giáo viên cùng hướng dẫn rõ ràng và nút đăng xuất.
- Target files:
  - `apps/student/src/components/overview/student-error-view.tsx`
  - `apps/student/test/overview.test.tsx`
- Steps:
  1. Trong `apps/student/test/overview.test.tsx`:
     - Thêm test case `renders TEACHER_ON_STUDENT_PORTAL state with link to teacher portal and sign out button`.
     - Thêm test case `renders TEACHER_ON_STUDENT_PORTAL state on unknown host without link to teacher portal`.
     - Kiểm tra sự xuất hiện của tiêu đề "Đây là tài khoản giáo viên", copy hướng dẫn mới, liên kết sang cổng giáo viên (`href`), và nút "Đăng xuất".
  2. Trong `apps/student/src/components/overview/student-error-view.tsx`:
     - Cập nhật nhánh `ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL` để cập nhật `description`:
       `"Tài khoản này thuộc hệ thống giáo viên, không đăng nhập được cổng học viên. Bạn có thể chuyển sang cổng giáo viên hoặc đăng xuất để đăng nhập bằng tài khoản học viên."`
     - Tính toán `teacherPortalUrl = getTeacherPortalUrl()` bên trong nhánh `TEACHER_ON_STUDENT_PORTAL`.
     - Nếu `teacherPortalUrl` có giá trị: hiển thị liên kết chính bằng thẻ `<a>` style chuẩn design v2 (`inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-sm text-primary-foreground shadow-xs hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none`), nút Đăng xuất là nút phụ bên dưới.
     - Nếu không có `teacherPortalUrl`: chỉ hiển thị nút Đăng xuất (như cũ).
- Success criteria: Test trong `overview.test.tsx` pass toàn bộ.
- Verify: `pnpm --filter student exec vitest run test/overview.test.tsx` thoát 0 và in `passed`.

### Task 1.3 — Cập nhật CHANGELOG.md và Quality Gates toàn diện
- Goal: Ghi nhận changelog và đảm bảo toàn bộ dự án tuân thủ typing, linting và tests.
- Target files:
  - `CHANGELOG.md`
  - Monorepo checks
- Steps:
  1. Thêm một mục ngắn gọn vào `CHANGELOG.md` dưới mục Fixed.
  2. Chạy `pnpm check`.
  3. Chạy `pnpm check-types`.
  4. Chạy `pnpm --filter student test`.
- Success criteria: Không có lỗi lint, format, typecheck hay test nào.
- Verify: Các lệnh trên đều thoát mã 0.

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
