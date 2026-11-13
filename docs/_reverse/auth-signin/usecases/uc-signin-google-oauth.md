---
type: reverse-usecase
feature: auth-signin
uc: UC-SIGNIN-02
status: draft
updated: 2026-11-11
---

# UC-SIGNIN-02 — Đăng nhập bằng Google

**a. Tên:** Đăng nhập ứng dụng giáo viên bằng tài khoản Google.
**b. Actor chính:** Giáo viên; tham gia: Google (nhà cung cấp định danh).
**c. Tiền điều kiện:** Ứng dụng cấu hình Google OAuth; người dùng có tài khoản Google.
**d. Hậu điều kiện thành công:** Tài khoản user được tạo lần đầu với vai đúng cổng (nếu mới); có phiên; về đúng origin đã gọi.

**e. Luồng chính:**
1. Bấm nút Google trên `/login`.
2. Gọi bắt đầu OAuth với `callbackURL` = origin hiện tại + `returnUrl` hợp lệ; `errorCallbackURL` = origin/login.
3. Server đóng dấu "cổng" vào OAuth state trước khi chuyển sang Google (callback GET không có Origin vẫn phân loại đúng).
4. Google bắt buộc chọn tài khoản mỗi lần (`select_account`).
5. Callback: phân loại cổng từ state → tạo user lần đầu với vai theo cổng (qua allowlist giáo viên/quản trị nếu áp dụng).
6. Tạo phiên; về `callbackURL` vào vùng làm việc.

**f. Luồng thay đổi/ngoại lệ:**
- 5a. Vai không khớp cổng → từ chối tạo phiên; chuyển về `/login?error=ROLE_MISMATCH` — chỉ mã ROLE_MISMATCH mới được hiện câu mô tả từ server, còn lại câu chung (E-SIGNIN-006..009).
- 5b. Tạo user vi phạm allowlist → chặn tại hook tạo user (E-SIGNIN-016..018).
- 4a. Người dùng hủy/lỗi Google → về `/login` kèm mã lỗi → toast chung E-SIGNIN-009; tham số lỗi tự chế trên URL không được hiện.

**g. Ràng buộc/KPI:** Callback không phụ thuộc Origin header; không cho phép URL lỗi tự do kiểm soát nội dung toast.

**h. Ma trận UC ↔ FR ↔ Error:**

| Bước | FR | Error | Chứng cứ |
|---|---|---|---|
| 2 | FR-005 | E-009 | `apps/web/src/components/google-oauth-button.tsx:44-58` |
| 3 | FR-007 | — | `packages/auth/src/index.ts:335-364`, `packages/auth/src/role.ts:9` |
| 4 | FR-005 | — | `packages/auth/src/index.ts:248-257` |
| 5 | FR-006, FR-019, FR-020 | E-016..018 | `packages/auth/src/index.ts:220-239,440-497` |
| 6 | FR-008 | E-006..008, 010 | `packages/auth/src/index.ts:501-538`, `apps/web/src/routes/login.tsx:51-61` |

**Nhận diện nhãn:** Chưa có E2E tự động cho luồng Google đăng nhập (negative-search: "google" trong `apps/e2e/specs` chỉ thấy `apps/e2e/specs/profile.spec.ts:87,150` về liên kết tài khoản) → 🟡 (G-2, SC-005).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
