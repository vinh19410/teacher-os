# Phase 2: Áp dụng vào _auth route, pending timer và kiểm chứng bộ test điều hướng

## Goal
Cập nhật `_auth.beforeLoad` trong `apps/web/src/routes/_auth/route.tsx` sử dụng `getCachedSession()` với try/catch an toàn, cấu hình `defaultPendingMs: 200` trong `apps/web/src/main.tsx`, và bổ sung bộ test điều hướng độc lập chứng minh không bị stall.

## Files to Create or Modify
- `apps/web/src/routes/_auth/route.tsx` — Sử dụng `getCachedSession` bọc trong try/catch phòng thủ.
- `apps/web/src/main.tsx` — Đặt `defaultPendingMs: 200`.
- `apps/web/src/routes/_auth/route.test.ts` — Test cho `_auth` route `beforeLoad` (fallback an toàn khi mạng chập chờn, redirect khi chưa đăng nhập, sử dụng cache).
- `apps/web/src/routes/_auth/grading-nav.test.tsx` — Bộ test độc lập mô phỏng điều hướng giữa các trang trong shell với preload intent và đo đạc số lần gọi session.

## Tasks & Steps

### Task 2.1 — Cập nhật _auth/route.tsx sử dụng getCachedSession với try/catch phòng thủ
- **Goal**: Loại bỏ lời gọi fetch mạng lặp lại ở mỗi lần điều hướng giữa các trang nội bộ của `_auth`, đồng thời phòng thủ chống lỗi timeout/mạng không làm crash router.
- **Target files and symbols**: `apps/web/src/routes/_auth/route.tsx` (`Route.beforeLoad`).
- **Steps**:
  1. Import `getCachedSession` từ `@/lib/auth-client`.
  2. Trong hàm `beforeLoad: async ({ location, context })`:
     - Khối `try`: gọi `session = await getCachedSession()`.
     - Nếu `!session?.data`: ném `redirect({ to: "/login", search: { returnUrl: location.href } })`.
     - Trả về `{ session }`.
     - Khối `catch (error)`:
       - Nếu error là `redirect` (từ TanStack Router): ném tiếp (rethrow).
       - Nếu error là timeout hoặc network error: kiểm tra nếu `context` đã có `session` hợp lệ từ trước trong cùng phiên, log cảnh báo và tiếp tục với session đó (fail-open an toàn cho người dùng đang thao tác). Nếu chưa từng có session, ném redirect về `/login`.
- **Success criteria**: Code biên dịch sạch, không lỗi type.
- **Verify**: `pnpm --filter web check-types` exits 0.

### Task 2.2 — Cấu hình defaultPendingMs trong main.tsx
- **Goal**: Giảm ngưỡng chờ pending từ 1000ms xuống 200ms để hiển thị `<Loader />` kịp thời nếu có độ trễ mạng thực sự, tránh hiện tượng màn hình đứng đơ.
- **Target files and symbols**: `apps/web/src/main.tsx` (`createRouter`).
- **Steps**:
  1. Trong `createRouter`: thêm `defaultPendingMs: 200`.
- **Success criteria**: Router được khởi tạo với `defaultPendingMs: 200`.
- **Verify**: `pnpm --filter web check-types` exits 0.

### Task 2.3 — Viết test tích hợp điều hướng độc lập (Isolated Router Test)
- **Goal**: Kiểm chứng rằng khi người dùng hover và click chuyển trang trong shell, router chuyển trang tức thì, chỉ gọi `getSession` 1 lần duy nhất thay vì lặp lại ở mỗi hành động hover và click.
- **Target files and symbols**: `apps/web/src/routes/_auth/grading-nav.test.tsx`.
- **Steps**:
  1. Tạo file test `apps/web/src/routes/_auth/grading-nav.test.tsx` với môi trường jsdom.
  2. Tạo một test router tối giản (gồm `RootRoute`, `AuthRoute`, và 2 route con stub: `DashboardStub` và `GradingStub`) theo pattern chuẩn của repo (`login-return-url.test.tsx`).
  3. Mock `authClient.getSession` để đếm số lần gọi.
  4. Test kịch bản chuyển trang từ `/dashboard` sang `/grading`:
     - Hover link `/grading` (kích hoạt preload intent).
     - Click link `/grading`.
  5. Assert: `router.state.location.pathname` đổi thành `"/grading"`.
  6. Assert: `authClient.getSession` chỉ được gọi 1 lần (do cache 10s tái sử dụng kết quả).
  7. Test kịch bản network timeout: khi timeout xảy ra, router không crash unhandled rejection.
- **Success criteria**: Toàn bộ các test trong file chạy xanh.
- **Verify**: `pnpm --filter web exec vitest run src/routes/_auth/grading-nav.test.tsx` exits 0.

### Task 2.4 — Chạy toàn bộ kiểm tra chất lượng (Gate)
- **Goal**: Đảm bảo toàn bộ monorepo pass lint, types, và test suites.
- **Target files and symbols**: Monorepo.
- **Steps**:
  1. Chạy `pnpm check`.
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm --filter web test`.
- **Success criteria**: Mọi lệnh kiểm tra chất lượng kết thúc với mã 0.
- **Verify**: `pnpm check && pnpm check-types && pnpm --filter web test` exits 0.

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
