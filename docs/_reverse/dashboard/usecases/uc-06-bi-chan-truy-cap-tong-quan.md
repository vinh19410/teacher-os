# UC-06 — Bị chặn truy cập tổng quan (sai app)

| Trường | Nội dung |
|--------|----------|
| **a. Mô tả** | Session học viên/admin dùng chung vùng cookie chạm app giáo viên bị chặn ở middleware, không bao giờ tới được bộ đếm hay snapshot. |
| **b. Actor** | Hệ thống (gate): session role student/admin. |
| **c. Điều kiện tiên quyết** | Có session role student hoặc admin trên cookie zone của app giáo viên. |
| **d. Trigger** | Bất kỳ request lên kernel tree (gồm `/api/dashboard/reminders`, `/api/kernel`) hoặc mở `/dashboard`. |
| **e. Luồng chính** | 1. Bootstrap middleware kiểm role: student → 403 `ACCOUNT_STUDENT_ROLE`, KHÔNG bootstrap org (app.ts:224-232). 2. admin → 403 `ACCOUNT_ADMIN_ROLE` (235-242). 3. Web nhận 403 kèm mã trong `reason` → `isStudentRoleRejected` → blocked view thay workspace (repos/kernel.ts:718-726). 4. Blocked view: "Đây là tài khoản học viên" + nút "Đăng xuất" (account-role-separation.spec.ts:137-145). |
| **f. Luồng thay thế** | f1. TEACHER_EMAILS cấu hình: email ngoài allowlist → 403 `ACCOUNT_TEACHER_NOT_ALLOWED`; chưa xác thực → 403 `ACCOUNT_TEACHER_EMAIL_UNVERIFIED` (app.ts:246-268) [E-005]. |
| **g. Ngoại lệ** | g1. DB phải chứng minh không tăng org/membership cho user bị chặn (spec assert count trước/sau, spec:126-150). |
| **h. Hậu điều kiện** | Không có dữ liệu org nào lộ; không sinh org rác. FR: FR-015. BR: BR-009. Errors: E-002, E-003, E-005. |
