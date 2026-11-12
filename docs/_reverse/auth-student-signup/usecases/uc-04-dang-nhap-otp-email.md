# UC-04 — Đăng nhập bằng mã OTP email

- **ID:** UC-04 · **Feature:** auth-student-signup · **Actor chính:** Học viên (tab mặc định)
- **a. Mô tả:** Học viên đăng nhập không cần mật khẩu: nhận mã 6 số qua email (hiệu lực 5 phút, lưu băm), nhập mã để tạo phiên; mã đồng thời xác thực email. ✅ [S4][S13]
- **b. Actors phụ:** Mailer.
- **c. Tiền điều kiện:** Email tồn tại là học viên (teacher bị chặn gửi OTP); không đang trong cooldown.
- **d. Luồng chính:**
  1. Tab OTP mở mặc định trên trang login (apps/student/src/routes/login.tsx:32-42).
  2. Nhập email (regex kiểm tra — otp-sign-in-form.tsx:51-63), bấm gửi mã.
  3. POST email-otp/send-verification-otp; server kiểm tra cooldown 60 giây và chặn teacher (packages/auth/src/index.ts:366-424).
  4. Mail "Mã đăng nhập Cô Mỹ Dạy Tiếng Anh của bạn là …. Mã có hiệu lực trong 5 phút." (packages/auth/src/mail/otp-email-template.ts:43).
  5. Nhập mã 6 số (form chặn gửi khi thiếu chữ số — :100-108), POST sign-in/email-otp.
  6. Mã đúng → đặt emailVerified=true, xóa account mật khẩu chưa xác thực (chống hijack — auth-email-otp.test.ts:268-317), tạo phiên.
- **e. Luồng thay thế:**
  - 3a. Teacher yêu cầu OTP → không gửi; khi đăng nhập sẽ thấy "Tài khoản giáo viên không thể đăng nhập vào cổng học viên." (E-07).
  - 3b. Gửi dồn < 60 giây → chặn, form đếm ngược (E-30).
  - 5a. Mã sai/hết hạn → "Mã xác thực không đúng hoặc đã hết hạn." (E-09).
  - 5b. Sai quá nhiều lần → "Bạn đã nhập sai quá nhiều lần. Vui lòng gửi lại mã mới." (E-08); ngưỡng server chưa thấy cấu hình (Gap) 🟡.
  - 3c. Các path email-otp đổi email/đặt lại mật khẩu bị chặn hẳn: "Endpoint này không khả dụng." (E-10).
- **f. Hậu điều kiện:** Phiên học viên hoạt động; email ở trạng thái đã xác thực; lần đầu vào portal → UC-05.
- **g. BR liên quan:** BR-005..009 (danh tính email), OTP = xác thực email.
- **h. Nguồn:** S4, S11, S13, S17 (student-auth-otp.test.ts:100-199 kịch bản A/B/C).
