---
type: reverse-usecase
feature: auth-signin
uc: UC-SIGNIN-05
status: draft
updated: 2026-11-11
---

# UC-SIGNIN-05 — Chặn chéo vai trò giữa các cổng

**a. Tên:** Ngăn tài khoản vai này dùng cổng của vai khác (học viên → ứng dụng giáo viên, giáo viên → cổng học viên, vai khác → console quản trị).
**b. Actor chính:** Học viên (kịch bản chính), Giáo viên, Quản trị viên; hệ thống tự thực hiện ở 3 tầng.
**c. Tiền điều kiện:** Người dùng có phiên hoặc đang đăng nhập tại cổng sai vai (cookie chung chéo sub-domain).
**d. Hậu điều kiện thành công:** Không có dữ liệu nào của cổng sai vai bị lộ; không sinh tổ chức/tư cách giả; người dùng được hướng dẫn sang đúng cổng.

**e. Luồng chính (kịch bản học viên vào trang giáo viên):**
1. Học viên nhập email/mật khẩu tại `/login` ứng dụng giáo viên.
2. Tầng 1 — lúc tạo phiên: vai student không khớp → từ chối 403 với câu tiếng Việt thân thiện, KHÔNG tạo bản ghi phiên.
3. UI hiện nguyên văn câu chặn; không đổi trang.
4. Người dùng tự chuyển sang cổng học viên.

**f. Luồng thay đổi/ngoại lệ:**
- 2a. Học viên ĐÃ có phiên từ trước (cookie chung) gọi API giáo viên → tầng 2 chặn 403 `ACCOUNT_STUDENT_ROLE` trước khi bootstrap; không tăng bản ghi tổ chức/thành viên; UI thay vùng làm việc bằng màn chặn "Đây là tài khoản học viên" + nút đăng xuất (E-SIGNIN-010).
- 2b. Giáo viên chưa xác thực email → màn chặn nhánh verify với nút gửi lại email xác thực (E-SIGNIN-013).
- 2c. Giáo viên ngoài allowlist → màn chặn nhánh chung (E-SIGNIN-012).
- 2d. Giáo viên gọi API cổng học viên → 403 `ACCOUNT_TEACHER_ROLE` (E-SIGNIN-014).
- 2e. Vai khác gọi API quản trị → 403 `ACCOUNT_NOT_ADMIN` kiểm lại mỗi request (E-SIGNIN-015).
- 2f. Đăng nhập Google chéo vai → về `/login?error=ROLE_MISMATCH`, câu mô tả từ server (E-SIGNIN-006..008).

**g. Ràng buộc/KPI:** Câu chặn hiển thị nguyên văn (E2E so chuỗi); không tăng số bản ghi tổ chức/thành viên sau khi bị chặn (E2E đếm bản ghi); cookie xấu bị đổi vai thủ công cũng vẫn bị chặn (E2E "stale cookie").

**h. Ma trận UC ↔ FR ↔ Error:**

| Bước | FR | Error | Chứng cứ |
|---|---|---|---|
| 2 | FR-008 | E-006..008 | `packages/auth/src/index.ts:92-99,501-538` |
| 2a | FR-009, FR-011, FR-021 | E-010..013 | `apps/server/src/app.ts:206-291`, `apps/e2e/specs/account-role-separation.spec.ts:108-157` |
| 2d | FR-010 | E-014 | `apps/server/src/routes/student.ts:497-516` |
| 2e | FR-011 | E-015 | `apps/server/src/lib/require-admin.ts:27-51`, `apps/e2e/specs/admin-auth.spec.ts:27-40` |
| 2f | FR-008, FR-005 | E-006..010 | `apps/web/src/routes/login.tsx:51-61` |
| UI | FR-012, FR-013 | E-010, 012, 013, 027 | `apps/web/src/lib/role-block.ts:12-22`, `apps/web/src/components/account-blocked-view.tsx:40-160` |

**Nhận diện nhãn:** Ba tầng gate được test phủ trực tiếp (tạo phiên, kernel, học viên; kèm kịch bản cookie xấu) → ✅ (`apps/server/src/role-gates.test.ts:127-393`). Quản trị chạm ứng dụng giáo viên bị API chặn bằng `ACCOUNT_ADMIN_ROLE` nhưng mã này không nằm trong danh sách UI chuyển màn chặn (`apps/web/src/lib/repos/kernel.ts:718-726`) → 🟡 (G-5).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
