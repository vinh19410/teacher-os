---
phase: 2
title: "Trang quên mật khẩu và trang đặt mật khẩu mới"
status: done
priority: P1
effort: 5h
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
- Modify: `apps/web/src/routes-matcher.test.ts` (`validStaticRoutes`, test trực tiếp hai route)
- Modify: `apps/web/src/worker.test.ts` (test SPA route trả 200 cho hai path mới)
- Modify: `apps/web/src/components/sign-in-form.test.tsx` (mock `Link`)
- Modify: `apps/student/test/login.test.tsx` (mock `Link`)
- Create: `apps/web/src/components/auth/reset-password-form.test.tsx`
- Create: `apps/student/test/forgot-password-form.test.tsx`
- Create: `apps/student/test/reset-password-form.test.tsx`
- Modify: `apps/student/src/components/auth/sign-in-form.tsx` (thêm link)
- Generated, không sửa tay: `apps/web/src/routeTree.gen.ts` (bị gitignore, không commit, chỉ tồn tại sau `vite build`), `apps/student/src/routeTree.gen.ts` (được git track, phải commit bản sinh ra)

## Tasks & Steps

### Task 2.1 — Cho worker biết hai route teacher

- Goal: `/forgot-password` và `/reset-password` trả shell SPA với HTTP 200, không 404.
- Target files: `apps/web/src/routes-matcher.ts` hằng `VALID_EXACT_ROUTES`; `apps/web/src/routes-matcher.test.ts`; `apps/web/src/worker.test.ts`.
- Steps:
  1. Thêm hai key `"/forgot-password": true` và `"/reset-password": true` cạnh `"/login"`.
  2. Thêm hai path đó vào `validStaticRoutes` trong test, cạnh `"/login"`.
  3. Drift guard hiện có `return` sớm khi `routeTree.gen.ts` không tồn tại (file này bị gitignore), nên không được coi là bằng chứng. Thêm test trực tiếp `isValidAppRoute("/forgot-password")` và `isValidAppRoute("/reset-password")` (cả hai có và không có dấu `/` cuối) đều `true`.
  4. Trong `worker.test.ts`, thêm hai path vào danh sách của test `serves valid SPA routes with HTTP 200 and index.html shell` (đang có `"/login"`). Test này chạy qua `worker.ts`, nơi link trong mail sẽ đi qua ở production.
- Success criteria: `isValidAppRoute` nhận cả hai path; worker trả 200 cho cả hai.
- Verify: `pnpm --filter web exec vitest run src/routes-matcher.test.ts src/worker.test.ts` exits 0.

### Task 2.2 — Form xin link trên web

- Goal: thay notice pilot bằng trang xin email.
- Target files: `apps/web/src/components/sign-in-form.tsx`, `apps/web/src/components/auth/forgot-password-form.tsx`, `apps/web/src/routes/forgot-password.tsx`.
- Steps:
  1. Trong `sign-in-form.tsx`, xóa state `showForgotNote` và `NoticeInfo` có câu `Password reset isn't enabled in this pilot yet`. Đổi `<button>` "Forgot password?" thành `Link` của TanStack Router tới `/forgot-password`. Giữ className hiện tại của nút đó. Xóa import `NoticeInfo` nếu không còn chỗ dùng.
  2. `forgot-password-form.tsx` dùng `useForm` + `AuthField` + `SubmitButton` như sign-in. Một field email, schema chỉ cần email hợp lệ. Tái dùng message email đang có trong `apps/web/src/lib/sign-in-schema.ts` nếu export sẵn; nếu không, dùng cùng chữ `EMAIL_INVALID` mà sign-in đang dùng. Không tự bịa câu required khác.
  3. Submit gọi `authClient.requestPasswordReset({ email: value.email.trim(), redirectTo: `${window.location.origin}/reset-password` })`. Không đọc `redirectTo` từ URL. Better-auth 1.6.27 có `requestPasswordReset` (`POST /request-password-reset`) và `resetPassword`; không dùng `forgetPassword`.
  4. Nút submit bị vô hiệu khi đang gửi (`isSubmitting`).
  5. Kết quả `{ error }` falsy: hiện `NoticeInfo` đúng câu `If an account exists for that email, we sent a reset link. It expires in 1 hour.` rồi vô hiệu nút gửi 60 giây kèm đếm ngược (`Resend in {n}s`). Đây là khoảng cách tới giới hạn 3 request/60s của better-auth.
  6. `{ error }` có `status === 429`: `toast.error` đúng câu `Too many requests. Wait a minute and try again.` Lỗi khác hoặc promise reject: `toast.error` với `authErrorMessage`, fallback `Couldn't send the reset email. Try again.` Không hiện câu thành công. Lưu ý: lỗi gửi mail phía server không tới được client (gửi nền, chỉ log), nên nhánh lỗi này chỉ phủ lỗi mạng, 4xx và 429.
  7. Route `forgot-password.tsx`: `createFileRoute("/forgot-password")`, không `validateSearch`. Copy khung trang từ `apps/web/src/routes/login.tsx` (`BrandPanel` và cột form). Không render `AuthTabs`. Thêm link "Back to sign in" tới `/login`.
- Success criteria: source `sign-in-form.tsx` không còn chuỗi `isn't enabled`.
- Verify: task 2.5.

### Task 2.3 — Form mật khẩu mới trên web

- Goal: trang `/reset-password` đọc `token` hoặc `error` và gọi `resetPassword`.
- Target files: `apps/web/src/components/auth/reset-password-form.tsx`, `apps/web/src/routes/reset-password.tsx`.
- Steps:
  1. `validateSearch` chỉ giữ `token` và `error` khi chúng là string. Bỏ qua mọi search key khác.
  2. Route đọc `token` vào state của component rồi `navigate({ to: "/reset-password", search: {}, replace: true })` để token không nằm lại trên thanh địa chỉ và lịch sử trình duyệt.
  3. Nếu `error` có giá trị hoặc không có token trong state: hiện đúng câu `This reset link is invalid or has expired.` và link tới `/forgot-password`. Không gọi API.
  4. Form hai field: `newPassword` và `confirmPassword`. `newPassword` tối thiểu 8 ký tự, dùng `PASSWORD_MIN` từ `apps/web/src/lib/sign-up-schema.ts`. Confirm lệch thì message `Passwords do not match`. `autoComplete="new-password"`. Có `passwordToggle` như sign-in. Nút submit vô hiệu khi `isSubmitting`.
  5. Submit gọi `authClient.resetPassword({ newPassword, token })`. Không gửi `confirmPassword`.
  6. Thành công: `NoticeOk` title `Password updated` và link "Sign in" tới `/login`. Không `window.location.assign` sang dashboard. Không tự sign-in.
  7. Thất bại phân loại theo `error.code`: `INVALID_TOKEN` thì thay form bằng câu `This reset link is invalid or has expired.` kèm link `/forgot-password`. Mọi lỗi khác (mạng, 5xx, 429) giữ nguyên form và `toast.error` `Couldn't update your password. Try again.` Token chưa bị tiêu thụ nên người dùng thử lại được.
  8. Route dùng cùng khung `BrandPanel` như task 2.2. Không dùng `authClient.useSession`, không redirect khi đã có session, không `Loader` chờ session: người đang đăng nhập mở link reset vẫn phải thấy form.
- Success criteria: trang không ghi token ra `localStorage` hay `console`; sau lần render đầu, URL không còn `token`.
- Verify: task 2.5.

### Task 2.4 — Cùng luồng trên student, tiếng Việt

- Goal: cổng học viên xin link và đặt mật khẩu trên origin của chính nó.
- Target files: `apps/student/src/components/auth/sign-in-form.tsx`, `apps/student/src/components/auth/forgot-password-form.tsx`, `apps/student/src/components/auth/reset-password-form.tsx`, `apps/student/src/routes/forgot-password.tsx`, `apps/student/src/routes/reset-password.tsx`.
- Steps:
  1. Trên sign-in, thêm `Link` "Quên mật khẩu?" tới `/forgot-password`, đặt cạnh field mật khẩu. Không thêm notice pilot.
  2. Form xin link giống task 2.2 (gồm vô hiệu nút khi đang gửi, đếm ngược 60 giây sau thành công). Schema email lấy từ `apps/student/src/lib/auth-schemas.ts` (`EMAIL_REQUIRED`, `EMAIL_INVALID`). `redirectTo` vẫn là `window.location.origin + "/reset-password"`.
  3. Câu thành công đúng: `Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ.` Nút đếm ngược: `Gửi lại sau {n} giây`.
  4. 429: `Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại.` Lỗi khác: `Không gửi được email đặt lại. Vui lòng thử lại.` Dùng chuỗi tiếng Việt cố định, không dùng `authErrorMessage` (có thể trả chuỗi tiếng Anh từ server).
  5. Form đặt lại: `PASSWORD_MIN` từ `auth-schemas.ts`. Confirm lệch: `Mật khẩu nhập lại không khớp`. Nút submit vô hiệu khi `isSubmitting`. Token đọc vào state rồi `navigate({ search: {}, replace: true })` như task 2.3.
  6. Link hỏng (`error` có giá trị, không có token, hoặc `error.code === "INVALID_TOKEN"`): `Liên kết đặt lại không hợp lệ hoặc đã hết hạn.` cộng link về `/forgot-password`. Lỗi khác: giữ form, toast `Không đổi được mật khẩu. Vui lòng thử lại.`
  7. Thành công: `NoticeOk` "Đã đổi mật khẩu." và link "Đăng nhập" tới `/login`.
  8. Khung trang (`BrandPanel`/cột form, tabs bỏ) copy từ `apps/student/src/routes/login.tsx` NHƯNG KHÔNG copy `authClient.useSession`, `useEffect` điều hướng khi có session, hay `<Loader />` chờ session (`login.tsx:42-47,71`). Học viên đang có session mở link reset vẫn phải thấy form.
  9. Student không có `routes-matcher` (worker fallback SPA). Không tạo file matcher mới.
- Success criteria: không có chuỗi tiếng Anh của task 2.2 trong component student; hai route student không import `useSession`.
- Verify: task 2.5.

### Task 2.5 — Sinh route tree và test form

- Goal: router biết route mới, các form hiện đúng câu thành công, câu lỗi, và test hiện có không vỡ.
- Target files: các file test ở mục Files, hai file `routeTree.gen.ts`.
- Steps:
  1. `apps/web/vitest.config.ts` đặt `environment: "node"`; test cần submit và chờ text dùng docblock `// @vitest-environment jsdom` và `@testing-library/react` (mẫu: `apps/web/src/components/assignments/answer-key-grid.test.tsx`). `apps/student` không có jsdom hay Testing Library: test student dùng `renderToStaticMarkup` (mẫu `apps/student/test/login.test.tsx`) cho nội dung tĩnh (câu lỗi link hỏng, link "Quên mật khẩu?", chuỗi tiếng Việt), còn hành vi submit của student được `password-reset.spec.ts` (phase 3) phủ.
  2. `sign-in-form.test.tsx` (web) và `login.test.tsx` (student) mock `@tanstack/react-router` chỉ với `useSearch`; `Link` sẽ là `undefined`. Mở rộng mock: `Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>`. Thêm assert sign-in web có link tới `/forgot-password` và không còn chuỗi `isn't enabled`; sign-in student có link "Quên mật khẩu?".
  3. `forgot-password-form.test.tsx` (web, jsdom): `vi.mock` `@/lib/auth-client`. Lần một `requestPasswordReset` resolve `{ error: null }`. Submit email `teacher@school.edu`. Expect câu thành công và nút gửi bị vô hiệu. Expect mock được gọi với `email: "teacher@school.edu"` và `redirectTo` kết thúc bằng `/reset-password`. Lần hai resolve `{ error: { status: 429 } }`: expect không có câu thành công và `toast.error` (mock `sonner`) được gọi với câu 429.
  4. `reset-password-form.test.tsx` (web, jsdom): mock `resetPassword`. Thành công: expect `Password updated`. `{ error: { code: "INVALID_TOKEN" } }`: expect câu link hỏng và không còn form. `{ error: { status: 500 } }`: expect form còn đó và toast `Couldn't update your password. Try again.`. Hai password lệch: expect `Passwords do not match` và `resetPassword` không được gọi.
  5. Student: `forgot-password-form.test.tsx` và `reset-password-form.test.tsx` render tĩnh: form xin link có chuỗi tiếng Việt, reset không token thì ra `Liên kết đặt lại không hợp lệ hoặc đã hết hạn.`, và không có chữ `Loader`/session.
  6. `apps/web` và `apps/student` đều có script `check-types` = `vite build && tsc --noEmit`. Script đó là cách plugin `@tanstack/router-plugin/vite` ghi `routeTree.gen.ts`. Không sửa tay file gen. Không commit `dist/`. Chạy `check-types` TRƯỚC khi chạy lại `routes-matcher.test.ts` để drift guard thật sự đọc được `routeTree.gen.ts` của web. Commit `apps/student/src/routeTree.gen.ts` (được track); không commit file gen của web.
- Success criteria: cả hai `routeTree.gen.ts` chứa `'/forgot-password'` và `'/reset-password'` trong `FileRoutesByFullPath`.
- Verify: tất cả lệnh sau exit 0, chạy theo thứ tự:
  - `pnpm --filter web check-types`
  - `pnpm --filter student check-types`
  - `pnpm --filter web test`
  - `pnpm --filter student test`

Nếu `check-types` fail sau khi hai path đã có trong `routeTree.gen.ts` và lỗi nằm ngoài file phase này tạo, dán log vào báo cáo phase và STOP theo Failure Protocol. Nếu hai path chưa có trong gen file, đó cũng là fail.

## Security Considerations

- `redirectTo` chỉ ghép từ `window.location.origin`. Không nối `search.redirect` hay `returnUrl`.
- Token chỉ nằm trên URL better-auth đã redirect tới (được xóa khỏi thanh địa chỉ ngay lần render đầu bằng `replace`) và trong body `resetPassword`. Không lưu storage.
- Trang reset không phụ thuộc session: người đang đăng nhập vẫn thấy form đặt mật khẩu.
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
