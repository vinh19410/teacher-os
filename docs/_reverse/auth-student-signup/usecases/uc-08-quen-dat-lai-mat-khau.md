# UC-08 — Quên mật khẩu / đặt lại mật khẩu

- **ID:** UC-08 · **Feature:** auth-student-signup · **Actor chính:** Học viên
- **a. Mô tả:** Học viên mất mật khẩu tự đặt lại: nhận link (hiệu lực 1 giờ) qua email, nhập mật khẩu mới; mọi phiên cũ bị thu hồi. Thông điệp gửi mail được bình thường hoá, không lộ email có tồn tại. ✅ [S4][S15]
- **b. Actors phụ:** Mailer.
- **c. Tiền điều kiện:** Có khả năng nhận mail của tài khoản.
- **d. Luồng chính:**
  1. Trang quên mật khẩu: nhập email, gửi POST /api/auth/forget-password.
  2. Server tạo token đặt lại (hết hạn 1 giờ — resetPasswordTokenExpiresIn) và gửi mail.
  3. UI hiển thị "Nếu email này có tài khoản, chúng tôi đã gửi liên kết đặt lại. Liên kết hết hạn sau 1 giờ." + cooldown gửi lại 60 giây (forgot-password-form.tsx:13-18).
  4. Học viên mở link, nhập mật khẩu mới, POST /api/auth/reset-password với token.
  5. Thành công → thu hồi mọi phiên (revokeSessionsOnPasswordReset), mời đăng nhập lại.
- **e. Luồng thay thế:**
  - 2a. Email không tồn tại → vẫn trả thông điệp trung tính (không phân biệt).
  - 1a. Gửi dồn < 60 giây → "Bạn thử quá nhiều lần. Vui lòng đợi một phút rồi thử lại." (E-24).
  - 2b. Mailer lỗi → "Không gửi được email đặt lại. Vui lòng thử lại." (E-25).
  - 4a. Token hết hạn/sai → INVALID_TOKEN → màn "link không còn hiệu lực" (reset-password-form.tsx:63-66 — E-26).
  - 5a. Có phiên khác đang mở → bị đăng xuất hết (thu hồi phiên).
- **f. Hậu điều kiện:** Mật khẩu mới có hiệu lực; các phiên cũ chết; token reset một lần dùng.
- **g. BR liên quan:** BR-018 (token 1 giờ + thu hồi phiên); đường OTP đặt lại mật khẩu bị chặn hẳn (E-10).
- **h. Nguồn:** S4, S10 (reset-password-email-template), S11, S15 (auth-reset-password.test.ts).
