---
type: reverse-usecase
feature: auth-signin
uc: UC-SIGNIN-04
status: draft
updated: 2026-11-11
---

# UC-SIGNIN-04 — Xác thực email và gửi lại

**a. Tên:** Xác thực địa chỉ email sau khi tạo tài khoản; gửi lại thư khi cần.
**b. Actor chính:** Giáo viên vừa tạo tài khoản (và học viên theo cùng cơ chế ở cổng của họ).
**c. Tiền điều kiện:** Có tài khoản chưa xác thực; có hộp thư.
**d. Hậu điều kiện thành công:** `emailVerified = true`; mở được các cổng yêu cầu verify; tự đăng nhập sau xác thực.

**e. Luồng chính:**
1. Tạo tài khoản thành công → hệ thống tự gửi thư xác thực (hạn 1 giờ) — việc gửi thất bại KHÔNG hủy việc tạo tài khoản (tha thu trên đường tạo).
2. Người dùng mở thư, bấm link.
3. Token hợp lệ và đúng cổng → đánh dấu đã xác thực + TỰ ĐĂNG NHẬP (tạo phiên mới), chuyển tới `/verify-email?verified=ok`.
4. Người dùng vào vùng làm việc.

**f. Luồng thay đổi/ngoại lệ:**
- 3a. Token hỏng/đã dùng/hết hạn → trang chỉ nhận `error` → hiện "This link didn't work" + giải thích + nút gửi lại (E-SIGNIN-025); link rác với token giả → cùng màn hình (E2E kiểm).
- 3b. Link dùng chéo cổng sai vai → không tạo phiên, chuyển về `/login?error=ROLE_MISMATCH` (E-SIGNIN-006..008).
- 3c. Gửi lại từ trang verify: thành công → thư mới; báo "đã xác thực rồi" → tự tải lại trang; lỗi khác → E-SIGNIN-026 (báo to trên đường gửi lại).
- 3d. Gửi lại từ màn bị chặn: thành công → thông báo đã gửi; lỗi → E-SIGNIN-027; báo đã xác thực → tải lại trang.

**g. Ràng buộc/KPI:** Hai chính sách lỗi khác nhau theo đường: tạo tài khoản tha thứ, gửi lại báo to; tự đăng nhập sau verify; thư tiếng Việt với thương hiệu trung tâm.

**h. Ma trận UC ↔ FR ↔ Error:**

| Bước | FR | Error | Chứng cứ |
|---|---|---|---|
| 1 | FR-016, FR-024 | — | `packages/auth/src/index.ts:298-326`, `packages/auth/src/auth-verification-email.test.ts:34-143` |
| 3 | FR-016, FR-008 | E-006..008 | `packages/auth/src/index.ts:501-538`, `packages/auth/src/auth-verify-email-role.test.ts:77-113` |
| 3a-3c | FR-016 | E-025, E-026 | `apps/web/src/components/verify-email-view.tsx:29-67,96-127`, `apps/e2e/specs/web-email-verification.spec.ts:7-72` |
| 3d | FR-013 | E-027 | `apps/web/src/components/account-blocked-view.tsx:44-77` |

**Nhận diện nhãn:** Hai chính sách lỗi (tha thu khi tạo / báo to khi gửi lại) được test phủ trực tiếp → ✅ (`packages/auth/src/auth-verification-email.test.ts:34-143`); tự đăng nhập sau xác thực kể cả chéo vai có test riêng → ✅ (`packages/auth/src/auth-verify-email-role.test.ts:77-113`).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
