---
phase: 2
title: "Phase 2: Frontend & Gates — Khôi phục 2 tab Đăng nhập / Đăng ký ở apps/student"
status: done
priority: P1
effort: "45m"
dependencies: [1]
---

# Phase 2: Frontend & Gates — Khôi phục 2 tab Đăng nhập / Đăng ký ở apps/student

## Goal
Gỡ bỏ tab `Mã email` (`OtpSignInForm`) và `emailOTPClient` khỏi `apps/student`, khôi phục trang `/login` chỉ còn 2 tab `Đăng nhập` (tab mật khẩu cũ) và `Đăng ký` với mặc định là `Đăng nhập`, bổ sung map lỗi tiếng Việt cho `USER_ALREADY_EXISTS`, cập nhật unit tests và chạy toàn bộ quality gates.

## Target Files & Symbols
- Modify: `apps/student/test/login.test.tsx` (siết chặt assertions cho `AuthTabs` chỉ có 2 tab `Đăng nhập` / `Đăng ký` với `grid-cols-2`, không có `tab-otp` / `Mã email`, và test `authErrorMessage` map `USER_ALREADY_EXISTS`)
- Create: `apps/student/test/login-route.test.tsx` (`// @vitest-environment jsdom`, mock `createFileRoute`, `sonner`, `authClient`, render `Route.component` như mẫu `reset-password-routes.test.tsx` để kiểm tra mặc định `#tab-signin`, fallback từ `localStorage.getItem("teacher-os-student-auth-tab") === "otp"` sang `#tab-signin`, chuyển sang `#tab-signup` khi click, và không có `#tab-otp` / `#panel-otp`)
- Modify: `apps/student/src/components/auth/auth-tabs.tsx` (`AuthMode`, `AuthTabs`, `TABS`, `onKeyDown`)
- Modify: `apps/student/src/routes/login.tsx` (`RouteComponent`, `mode` initial state, heading/subtitle, panels, bottom switch button)
- Modify: `apps/student/src/lib/auth-client.ts` (gỡ `emailOTPClient`)
- Modify: `apps/student/src/lib/auth-error.ts` (map `USER_ALREADY_EXISTS` / `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` sang thông báo tiếng Việt hướng dẫn chuyển tab `Đăng nhập` hoặc dùng `Quên mật khẩu?`)
- Delete: `apps/student/src/components/auth/otp-sign-in-form.tsx`
- Delete: `apps/student/src/components/auth/otp-sign-in-form.test.tsx`

## Tasks & Steps

### Task 2.1 (TDD Red) — Siết test `login.test.tsx` và tạo `login-route.test.tsx` cho 2 tab Đăng nhập / Đăng ký
- **Goal:** Tạo test fail trước khi sửa UI để khẳng định `AuthTabs` và `/login` chỉ có đúng 2 tab `Đăng nhập` (`#tab-signin`) và `Đăng ký` (`#tab-signup`), `grid-cols-2`, không có `#tab-otp` / `"Mã email"` / `#panel-otp`, và fallback từ `localStorage` `"otp"` về `"signin"`.
- **Target files and symbols:** `apps/student/test/login.test.tsx`, `apps/student/test/login-route.test.tsx`.
- **Steps:**
  1. Trong `apps/student/test/login.test.tsx`, sửa block `describe("AuthTabs", ...)` kiểm tra chính xác `<button[^>]*id="tab-signin"[^>]*>Đăng nhập<\/button>`, `<button[^>]*id="tab-signup"[^>]*>Đăng ký<\/button>`, class `grid-cols-2`, và phủ định `tab-otp`, `Mã email`, `Mật khẩu` (tab label). Thêm test `authErrorMessage` cho mã lỗi `{ code: "USER_ALREADY_EXISTS", message: "User already exists. Use another email." }`.
  2. Tạo `apps/student/test/login-route.test.tsx` với `// @vitest-environment jsdom`, tham chiếu pattern mock router của `apps/student/test/reset-password-routes.test.tsx` (mock đầy đủ `createFileRoute`, `Link`, và top-level `useSearch: () => router.search` vì `SignInForm`/`SignUpForm`/`GoogleOAuthButton` gọi `useSearch({ strict: false })`, cộng với mock `sonner` và `@/lib/auth-client`; `localStorage.clear()` ở `beforeEach` và `afterEach(cleanup)`), kiểm tra render `Route` component:
     - Mặc định chọn `#tab-signin` (`aria-selected="true"`) và hiển thị `"Chào mừng trở lại"`.
     - Khi `localStorage.setItem("teacher-os-student-auth-tab", "otp")` trước khi render, vẫn tự fallback chọn `#tab-signin` và không render `#tab-otp` hay `#panel-otp`.
     - Click `#tab-signup` chuyển sang tab Đăng ký (`aria-selected="true"`, hiện `"Tạo tài khoản học viên"`).
  3. Chạy lệnh verify đỏ bên dưới trước khi sửa component UI.
- **Success criteria:** Test fail vì `AuthTabs` đang có 3 tab (`Mã email`, `Mật khẩu`, `Đăng ký`), `/login` đang mặc định `"otp"`, và `authErrorMessage` chưa map `USER_ALREADY_EXISTS`.
- **Verify:** `pnpm --filter student test test/login.test.tsx test/login-route.test.tsx` thoát mã khác `0` với assertion failure (trạng thái Red).

### Task 2.2 — Khôi phục `AuthTabs` 2 tab, cập nhật `/login`, gỡ `OtpSignInForm` và `emailOTPClient`
- **Goal:** Chỉ giữ 2 tab `Đăng nhập` và `Đăng ký` trên cổng học viên, xóa toàn bộ thành phần OTP phía client, và map lỗi `USER_ALREADY_EXISTS`.
- **Target files and symbols:** `apps/student/src/components/auth/auth-tabs.tsx`, `apps/student/src/routes/login.tsx`, `apps/student/src/lib/auth-client.ts`, `apps/student/src/lib/auth-error.ts`, `apps/student/src/components/auth/otp-sign-in-form.tsx`, `apps/student/src/components/auth/otp-sign-in-form.test.tsx`.
- **Steps:**
  1. Trong `apps/student/src/components/auth/auth-tabs.tsx`:
     - Đặt `export type AuthMode = "signin" | "signup";`.
     - Xóa `otpTabRef`, `TAB_ORDER` 3 phần tử và mục `{ id: "otp", label: "Mã email" }`.
     - Đặt `TABS` gồm 2 phần tử: `{ id: "signin", label: "Đăng nhập", ref: signInTabRef }` và `{ id: "signup", label: "Đăng ký", ref: signUpTabRef }`.
     - Đổi `onKeyDown` chuyển đổi qua lại giữa `"signin"` và `"signup"` khi bấm `ArrowLeft` / `ArrowRight`.
     - Đổi container `role="tablist"` thành `className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground"`.
  2. Trong `apps/student/src/routes/login.tsx`:
     - Xóa `import { OtpSignInForm } from "@/components/auth/otp-sign-in-form";`.
     - Trong `useState<AuthMode>`, trả `"signup"` nếu `localStorage.getItem(TAB_STORAGE_KEY) === "signup"`, ngược lại luôn trả `"signin"` (tự động fallback cả trường hợp giá trị cũ `"otp"` hoặc lỗi storage).
     - Cập nhật heading/subtitle:
       - `mode === "signin"` -> `"Chào mừng trở lại"` / `"Đăng nhập để xem lịch học và bài tập của bạn."`
       - `mode === "signup"` -> `"Tạo tài khoản học viên"` / `"Đăng ký tài khoản học viên nhanh chóng."`
     - Xóa `<div id="panel-otp" hidden={mode !== "otp"}>...</div>`.
     - Khôi phục đoạn chuyển mode cuối form thành 1 khối duy nhất chuyển đổi qua lại giữa `"signin"` (`"Chưa có tài khoản? Tạo tài khoản"`) và `"signup"` (`"Đã có tài khoản? Đăng nhập"`).
  3. Trong `apps/student/src/lib/auth-client.ts`:
     - Xóa `import { emailOTPClient } from "better-auth/client/plugins";` và xóa `plugins: [emailOTPClient()],`.
  4. Trong `apps/student/src/lib/auth-error.ts`:
     - Kiểm tra `record.code === "USER_ALREADY_EXISTS" || record.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"` **trước** khi fallback đọc `record.message` / `record.statusText`, trả về `"Email này đã có tài khoản. Vui lòng chuyển sang tab Đăng nhập hoặc dùng Quên mật khẩu? để đặt mật khẩu."`.
  5. Xóa `apps/student/src/components/auth/otp-sign-in-form.tsx` và `apps/student/src/components/auth/otp-sign-in-form.test.tsx`.
- **Success criteria:** `apps/student` chỉ còn 2 tab `Đăng nhập` / `Đăng ký`, không còn code OTP client nào.
- **Verify:** `pnpm --filter student test test/login.test.tsx test/login-route.test.tsx` thoát `0` và toàn bộ test trong 2 file pass.

### Task 2.3 — Chạy toàn bộ test suite, typecheck và lint check
- **Goal:** Đảm bảo không có lỗi type, lint/format hoặc hồi quy ở bất kỳ package/app nào trong monorepo.
- **Target files and symbols:** Toàn repo.
- **Steps:**
  1. Chạy `pnpm --filter student test`.
  2. Chạy `pnpm check-types`.
  3. Chạy `pnpm exec biome check .` (nếu có lỗi format/import chưa dùng thì chạy `pnpm check:fix` rồi chạy lại `pnpm exec biome check .`).
  4. Xác nhận `grep -rnE "emailOTP|otpEmailTemplate|OtpSignInForm|tab-otp" apps/*/src packages/*/src --exclude="*.test.ts" --exclude="*.test.tsx" --include="*.ts" --include="*.tsx"` trả về rỗng.
- **Success criteria:** Tất cả unit tests, `pnpm check-types` và `pnpm exec biome check .` đều thoát mã `0`, không còn ký hiệu OTP nào trong source code production.
- **Verify:** `pnpm --filter student test && pnpm check-types && pnpm exec biome check .` thoát mã `0`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same failure evidence to the user. Never continue by self-reasoning.
