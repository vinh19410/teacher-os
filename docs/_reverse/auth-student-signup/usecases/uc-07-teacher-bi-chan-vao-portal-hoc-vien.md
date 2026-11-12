# UC-07 — Teacher bị chặn truy cập cổng học viên

- **ID:** UC-07 · **Feature:** auth-student-signup · **Actor chính:** Giáo viên
- **a. Mô tả:** Mọi đường teacher chạm cổng học viên đều bị chặn: chặn tại form đăng nhập, chặn tại auto sign-in sau verify-email, và chặn tại API portal; có nút chuyển sang cổng giáo viên. ✅ [S6][S7][S18][S24]
- **b. Actors phụ:** Không.
- **c. Tiền điều kiện:** Session có role=teacher (hoặc role khác student).
- **d. Luồng chính (từng tầng):**
  1. Form đăng nhập portal HV → session.create.before thấy role != app → từ chối ROLE_MISMATCH với thông điệp "Tài khoản giáo viên không thể đăng nhập vào cổng học viên." (packages/auth/src/index.ts:96-97,501-538).
  2. Auto sign-in sau verify-email → thay vì 403 JSON, redirect `callbackURL + ?error=ROLE_MISMATCH`; login đọc và toast (index.ts:524-533; login.tsx:59-63).
  3. API portal `/api/student/*` → gate toàn router trả 403 ACCOUNT_TEACHER_ROLE (student.ts:511-512).
  4. UI hiển thị màn "Đây là tài khoản giáo viên" + nút sang cổng giáo viên (student-error-view.tsx:98-103).
- **e. Luồng thay thế:**
  - 1a. Chiều ngược lại (student chạm app GV) → "Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên." + 403 ACCOUNT_STUDENT_ROLE (index.ts:92-94; app.ts:227-228).
  - 2a. Không có callbackURL → throw lỗi gốc (403).
  - 3a. Session admin chạm kernel GV → ACCOUNT_ADMIN_ROLE (app.ts:238-239, ngoài scope feature).
- **f. Hậu điều kiện:** Teacher không xem được dữ liệu học viên; được điều hướng sang đúng cổng.
- **g. BR liên quan:** BR-013 (portal chỉ role student), BR-015 (teacher app chặn student), BR-001/004 (vai theo origin).
- **h. Nguồn:** S6, S7, S18 (role-gates.test.ts:190-283), S14 (auth-verify-email-role.test.ts:77-113), S24 (account-role-separation.spec.ts:63-157).
