# UC-01 — Đăng ký tài khoản học viên bằng email + mật khẩu

- **ID:** UC-01 · **Feature:** auth-student-signup · **Actor chính:** Học viên (chưa có tài khoản)
- **a. Mô tả:** Học viên tự tạo tài khoản ở cổng học viên bằng email + mật khẩu; hệ thống gửi mail xác thực ngay. ✅ [S4][S11]
- **b. Actors phụ:** Mailer (gửi mail xác thực).
- **c. Tiền điều kiện:** Email chưa từng đăng ký; học viên ở origin cổng học viên (role sẽ là student).
- **d. Luồng chính:**
  1. Học viên mở trang login, chọn tab "Đăng ký".
  2. Nhập tên, email, mật khẩu; client kiểm tra tên >= 2, email hợp lệ, mật khẩu >= 8 (apps/student/src/lib/auth-schemas.ts:3-7,14-18).
  3. Gửi POST /api/auth/sign-up/email kèm callbackURL `/verify-email?verified=ok` (apps/student/src/components/auth/sign-up-form.tsx:43).
  4. Server tạo USER với role = student theo origin (packages/auth/src/index.ts:436-498,495).
  5. Server gửi mail "Xác thực email Cô Mỹ Dạy Tiếng Anh của bạn", link hiệu lực 1 giờ (packages/auth/src/index.ts:298-326).
  6. Thông báo đăng ký thành công; học viên được hướng dẫn mở mail.
- **e. Luồng thay thế:**
  - 2a. Thiếu/sai dữ liệu → báo lỗi ngay dưới ô nhập (E-01..E-05).
  - 2b. Mật khẩu bị server từ chối → wording chưa rõ (E-06, OQ-1). 🟡
  - 4a. Email đã tồn tại → server từ chối (unique toàn cục), UI báo lỗi đăng ký.
  - 5a. Lỗi gửi mail → chỉ ghi log, đăng ký vẫn thành công (packages/auth/src/index.ts:308-322); học viên dùng nút gửi lại ở màn lỗi portal sau này.
- **f. Hậu điều kiện:** USER tồn tại với emailVerified=false, role=student; mail xác thực đã gửi.
- **g. BR liên quan:** BR-001 (role 1 lần), BR-003 (default student), BR-007 (email unique), BR-017 (mật khẩu >= 8 client 🟡).
- **h. Nguồn:** S4, S11, S12; test: packages/auth/src/auth-verification-email.test.ts, auth-teacher-signup.test.ts; E2E: apps/e2e/specs/signup-ui-smoke.spec.ts.
