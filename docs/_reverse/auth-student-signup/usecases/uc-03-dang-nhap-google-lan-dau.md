# UC-03 — Đăng nhập Google lần đầu (cổng học viên)

- **ID:** UC-03 · **Feature:** auth-student-signup · **Actor chính:** Học viên
- **a. Mô tả:** Học viên dùng Google để đăng nhập/đăng ký cùng lúc; lần đầu hệ thống tạo USER role student theo origin portal. ✅ [S4]
- **b. Actors phụ:** Google OAuth.
- **c. Tiền điều kiện:** Google client cấu hình; học viên có tài khoản Google.
- **d. Luồng chính:**
  1. Bấm nút Google ở trang login (apps/student/src/components/auth/google-oauth-button.tsx).
  2. POST /api/auth/sign-in/google → chuyển trang Google.
  3. Chọn tài khoản, đồng ý; Google trả hồ sơ (email, tên).
  4. user.create.before gán role = student theo origin (packages/auth/src/index.ts:436-498).
  5. Tạo ACCOUNT provider google + phiên; về cổng học viên.
  6. Gọi API portal → nếu chưa có hồ sơ, tiếp UC-05.
- **e. Luồng thay thế:**
  - 3a. Google từ chối/huỷ → về `/login` kèm error; toast "Đăng nhập Google thất bại. Vui lòng thử lại." (apps/student/src/routes/login.tsx:59-63) — E-15.
  - 4a. Tài khoản Google có email thuộc TEACHER_EMAILS/ADMIN_EMAILS ở origin học viên → không khớp vai, gate chặn (E-12/E-16).
  - 6a. emailVerified sau Google chưa xác định (OQ-4): nếu false, portal trả STUDENT_EMAIL_UNVERIFIED 🟡.
- **f. Hậu điều kiện:** USER + ACCOUNT google + phiên; hồ sơ học viên sẽ tự tạo ở lần gọi portal đầu tiên.
- **g. BR liên quan:** BR-001, BR-003, BR-013, BR-014.
- **h. Nguồn:** S4, S11; test: packages/auth/src/auth-teacher-signup.test.ts (vai theo origin).
