---
phase: 2
title: "Trang quên mật khẩu và trang đặt mật khẩu mới"
status: pending
priority: P1
effort: 4h
dependencies: [1]
---

# Phase 2: Trang quên mật khẩu và trang đặt mật khẩu mới

## Goal

Từ trang đăng nhập, user xin email đặt lại mật khẩu rồi mở một trang cùng origin để nhập mật khẩu mới. Teacher dùng tiếng Anh. Student dùng tiếng Việt. Cả hai route teacher đều được worker công nhận là SPA hợp lệ.

## Files to Create / Modify

- Create: `apps/web/src/routes/forgot-password.tsx`
- Create: `apps/web/src/routes/reset-password.tsx`
- Create: `apps/web/src/components/auth/forgot-password-form.tsx`
- Create: `apps/web/src/components/auth/reset-password-form.tsx`
- Create: `apps/web/src/components/auth/forgot-password-form.test.tsx`
- Create: `apps/student/src/routes/forgot-password.tsx`
- Create: `apps/student/src/routes/reset-password.tsx`
- Create: `apps/student/src/components/auth/forgot-password-form.tsx`
- Create: `apps/student/src/components/auth/reset-password-form.tsx`
- Modify: `apps/web/src/components/sign-in-form.tsx` (nút Forgot password)
- Modify: `apps/web/src/routes-matcher.ts` (`VALID_EXACT_ROUTES`)
- Modify: `apps/web/src/routes-matcher.test.ts` (`validStaticRoutes`)
- Modify: `apps/student/src/components/auth/sign-in-form.tsx` (thêm link)
- Generated, không sửa tay: `apps/web/src/routeTree.gen.ts`, `apps/student/src/routeTree.gen.ts`

## Tasks & Steps

### Task 2.1 — Cho worker biết hai route teacher

- Goal: `/forgot-password` và `/reset-password` trả shell SPA, không 404.
- Target files: `apps/web/src/routes-matcher.ts` hằng `VALID_EXACT_ROUTES`; `apps/web/src/routes-matcher.test.ts` mảng `validStaticRoutes`.
- Steps:
  1. Thêm hai key `"/forgot-password": true` và `"/reset-password": true` cạnh `"/login"`.
  2. Thêm hai path đó vào `validStaticRoutes` trong test, cạnh `"/login"`.
- Success criteria: `isValidAppRoute` nhận cả hai path, có và không có dấu `/` cuối.
- Verify: `pnpm --filter web exec vitest run src/routes-matcher.test.ts` exits 0.

### Task 2.2 — Form xin link trên web

- Goal: thay notice pilot bằng trang xin email.
- Target files: `apps/web/src/components/sign-in-form.tsx`, `apps/web/src/components/auth/forgot-password-form.tsx`, `apps/web/src/routes/forgot-password.tsx`.
- Steps:
  1. Trong `sign-in-form.tsx`, xóa state `showForgotNote` và `NoticeInfo` có câu `Password reset isn't enabled in this pilot yet`. Đổi `<button>` "Forgot password?" thành `Link` của TanStack Router tới `/forgot-password`. Giữ className hiện tại của nút đó. Xóa import `NoticeInfo` nếu không còn chỗ dùng.
  2. `forgot-password-form.tsx` dùng `useForm` + `AuthField` + `SubmitButton` như sign-in. Một field email, schema chỉ cần email hợp lệ. Tái dùng message email đang có trong `apps/web/src/lib/sign-in-schema.ts` nếu export sẵn; nếu không, dùng cùng chữ `EMAIL_INVALID` mà sign-in đang dùng. Không tự bịa câu required khác.
  3. Submit gọi `authClient.requestPasswordReset({ email: value.email.trim(), redirectTo: `${window.location.origin}/reset-password` })`. Không đọc `redirectTo` từ URL.
  4. Nếu `requestPasswordReset` không tồn tại trên client và `forgetPassword` tồn tại, gọi `forgetPassword` với cùng object. Ghi một dòng comment trong form nói symbol nào đã có trên better-auth 1.6.27. Không tạo wrapper tên khác.
  5. Kết quả `{ error }` falsy, hoặc response thành công của client: hiện `NoticeInfo` đúng câu `If an account exists for that email, we sent a reset link. It expires in 1 hour.`
  6. `{ error }` có giá trị, hoặc promise reject: `toast.error` với `authErrorMessage`, fallback `Couldn't send the reset email. Try again.` Không hiện câu thành công.
  7. Route `forgot-password.tsx`: `createFileRoute("/forgot-password")`, không `validateSearch`. Copy khung trang từ `apps/web/src/routes/login.tsx` (`BrandPanel` và cột form). Không render `AuthTabs`. Thêm link "Back to sign in" tới `/login`.
- Success criteria: source `sign-in-form.tsx` không còn chuỗi `isn't enabled`.
- Verify: task 2.5.

### Task 2.3 — Form mật khẩu mới trên web

- Goal: trang `/reset-password` đọc `token` hoặc `error` và gọi `resetPassword`.
- Target files: `apps/web/src/components/auth/reset-password-form.tsx`, `apps/web/src/routes/reset-password.tsx`.
- Steps:
  1. `validateSearch` chỉ giữ `token` và `error` khi chúng là string. Bỏ qua mọi search key khác.
  2. Nếu `error` có giá trị hoặc `token` rỗng: hiện đúng câu `This reset link is invalid or has expired.` và link tới `/forgot-password`. Không gọi API.
  3. Form hai field: `newPassword` và `confirmPassword`. `newPassword` tối thiểu 8 ký tự, dùng `PASSWORD_MIN` từ `apps/web/src/lib/sign-up-schema.ts`. Confirm lệch thì message `Passwords do not match`. `autoComplete="new-password"`. Có `passwordToggle` như sign-in.
  4. Submit gọi `authClient.resetPassword({ newPassword, token })`. Không gửi `confirmPassword`.
  5. Thành công: `NoticeOk` title `Password updated` và link "Sign in" tới `/login`. Không `window.location.assign` sang dashboard. Không tự sign-in.
  6. Thất bại: toast fallback `Couldn't update your password. Request a new reset link and try again.`
  7. Route dùng cùng khung `BrandPanel` như task 2.2.
- Success criteria: trang không ghi token ra `localStorage` hay `console`.
- Verify: task 2.5.

### Task 2.4 — Cùng luồng trên student, tiếng Việt

- Goal: cổng học viên xin link và đặt mật khẩu trên origin của chính nó.
- Target files: `apps/student/src/components/auth/sign-in-form.tsx`, `apps/student/src/components/auth/forgot-password-form.tsx`, `apps/student/src/components/auth/reset-password-form.tsx`, `apps/student/src/routes/forgot-password.tsx`, `apps/student/src/routes/reset-password.tsx`.
- Steps:
  1. Trên sign-in, thêm `Link` "Quên mật khẩu?" tới `/forgot-password`, đặt cạnh field mật khẩu. Không thêm notice pilot.
  2. Form xin link giống task 2.2. Schema email lấy từ `apps/student/src/lib/auth-schemas.ts` (`EMAIL_REQUIRED`, `EMAIL_INVALID`). `redirectTo` vẫn là `window.location.origin + "/reset-password"`.
  3. Câu thành công đúng: `Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ.`
  4. Toast lỗi gửi mail: `Không gửi được email đặt lại. Vui lòng thử lại.`
  5. Form đặt lại: `PASSWORD_MIN` từ `auth-schemas.ts`. Confirm lệch: `Mật khẩu nhập lại không khớp`.
  6. Link hỏng: `Liên kết đặt lại không hợp lệ hoặc đã hết hạn.` cộng link về `/forgot-password`.
  7. Thành công: `NoticeOk` "Đã đổi mật khẩu." và link "Đăng nhập" tới `/login`.
  8. Khung trang copy từ `apps/student/src/routes/login.tsx`, bỏ tabs.
  9. Student không có `routes-matcher`. Không tạo file matcher mới.
- Success criteria: không có chuỗi tiếng Anh của task 2.2 trong component student.
- Verify: task 2.5.

### Task 2.5 — Sinh route tree và test form web

- Goal: router biết route mới, form web hiện đúng câu thành công và câu lỗi.
- Target files: `apps/web/src/components/auth/forgot-password-form.test.tsx`, hai file `routeTree.gen.ts`.
- Steps:
  1. Test render form, `vi.mock` `@/lib/auth-client`. Lần một `requestPasswordReset` resolve `{ error: null }`. Submit email `teacher@school.edu`. Expect text `If an account exists for that email, we sent a reset link. It expires in 1 hour.`
  2. Expect mock được gọi với `email: "teacher@school.edu"` và `redirectTo` kết thúc bằng `/reset-password`.
  3. Lần hai mock resolve `{ error: { message: "nope" } }`. Expect không có câu thành công. Toast có thể assert qua mock `sonner` nếu các test web khác đang mock sonner; nếu không, assert mock đã được gọi và câu thành công vắng mặt.
  4. `apps/web` và `apps/student` đều có script `check-types` = `vite build && tsc --noEmit`. Script đó là cách plugin `@tanstack/router-plugin/vite` ghi `routeTree.gen.ts`. Không sửa tay file gen. Không commit `dist/`.
- Success criteria: cả hai `routeTree.gen.ts` chứa `'/forgot-password'` và `'/reset-password'` trong `FileRoutesByFullPath`.
- Verify: tất cả lệnh sau exit 0:
  - `pnpm --filter web exec vitest run src/routes-matcher.test.ts src/components/auth/forgot-password-form.test.tsx`
  - `pnpm --filter web check-types`
  - `pnpm --filter student check-types`

Nếu `check-types` fail sau khi hai path đã có trong `routeTree.gen.ts` và lỗi nằm ngoài file phase này tạo, dán log vào báo cáo phase và STOP theo Failure Protocol. Nếu hai path chưa có trong gen file, đó cũng là fail.

## Security Considerations

- `redirectTo` chỉ ghép từ `window.location.origin`. Không nối `search.redirect` hay `returnUrl`.
- Token chỉ nằm trên URL better-auth đã redirect tới và trong body `resetPassword`. Không lưu storage.
- Trang reset là public, cùng kiểu `routes/login.tsx`, không đặt dưới `routes/_auth`.

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
