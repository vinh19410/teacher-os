# Báo cáo Phase 2 (student): quên mật khẩu và đặt mật khẩu mới

## File thay đổi (tất cả trong apps/student)
- Sửa: `src/components/auth/sign-in-form.tsx` (Link "Quên mật khẩu?" tới `/forgot-password`, đặt ở `labelRowExtra` của field mật khẩu).
- Tạo: `src/components/auth/forgot-password-form.tsx`, `src/components/auth/reset-password-form.tsx`.
- Tạo: `src/routes/forgot-password.tsx`, `src/routes/reset-password.tsx` (không import `useSession`, không redirect theo session, không `Loader`).
- Sinh tự động (không sửa tay, chưa commit): `src/routeTree.gen.ts`.
- Test: sửa `test/login.test.tsx` (mock `Link`, assert link); tạo `test/forgot-password-form.test.tsx`, `test/reset-password-form.test.tsx`.

## Hành vi
- Xin link: `authClient.requestPasswordReset({ email, redirectTo: origin + "/reset-password" })`; 429 và lỗi khác dùng chuỗi tiếng Việt cố định; sau thành công hiện câu trung tính và khóa nút 60 giây với "Gửi lại sau {n} giây"; nút khóa khi đang gửi.
- Đặt lại: token vào state rồi `navigate({ search: {}, replace: true })`; thiếu token, `?error` hoặc `INVALID_TOKEN` thì hiện view link hỏng; lỗi khác giữ form và toast; thành công hiện "Đã đổi mật khẩu." cùng link "Đăng nhập".
- Gọi `authClient.resetPassword({ newPassword, token })` (tsc xác nhận cả hai hàm tồn tại trên client 1.6.27).

## Test thêm
- login: link `/forgot-password` với nội dung "Quên mật khẩu?".
- forgot-password-form: field/nút tiếng Việt, chưa có notice thành công, không có chuỗi tiếng Anh.
- reset-password-form: view link hỏng (không token, có error), form khi có token (autoComplete new-password, nút), token không lọt vào markup, hai route không chứa `useSession`/`Loader`, route reset có `search: {}` + `replace: true`.

## Kết quả verify
1. `pnpm --filter student check-types`: vite build "built in 1.05s", `tsc --noEmit` exit 0. `routeTree.gen.ts` chứa `/forgot-password` và `/reset-password` trong `FileRoutesByFullPath`.
2. `pnpm --filter student test`: 16 file, 136 test pass.
3. `biome check` (scope các file đã chạm): "Checked 16 files in 13ms. No fixes applied.", exit 0.
