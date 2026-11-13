---
type: reverse-usecase
feature: auth-signin
uc: UC-SIGNIN-03
status: draft
updated: 2026-11-11
---

# UC-SIGNIN-03 — Quên và đặt lại mật khẩu

**a. Tên:** Lấy lại quyền truy cập bằng đặt lại mật khẩu qua email.
**b. Actor chính:** Khách chưa đăng nhập (người sở hữu email).
**c. Tiền điều kiện:** Không cần phiên; có hộp thư của email đã đăng ký (hoặc bất kỳ email nào — hệ thống trả lời như nhau).
**d. Hậu điều kiện thành công:** Mật khẩu mới có hiệu lực; toàn bộ phiên cũ bị thu hồi; mọi thiết bị phải đăng nhập lại.

**e. Luồng chính:**
1. `/forgot-password`: nhập email, gửi yêu cầu với địa chỉ quay về cùng origin.
2. Hệ thống gửi thư (chạy nền, hạn 1 giờ) và UI hiện thông báo trung tính ngay (không tiết lộ email có tồn tại).
3. Người dùng mở link → `/reset-password`.
4. Nhập mật khẩu mới (tối thiểu 8 ký tự) + gõ lại; gửi cùng token.
5. Hệ thống đổi mật khẩu, tạo credential cho tài khoản Google trùng email nếu cần, thu hồi toàn bộ phiên.

**f. Luồng thay đổi/ngoại lệ:**
- 1a. Gửi quá nhanh (≥ 2 lần trong 60 giây ở UI) → nút bị vô hiệu hóa 60 giây; mã 429 → E-SIGNIN-020.
- 1b. Gửi thư thất bại → E-SIGNIN-021 (nền tự thử lại 1 lần khi 429/5xx; thất bại thì log không chứa token/email).
- 3a. Token hỏng/hết hạn/đã dùng → E-SIGNIN-022, kết thúc luồng (không cho thử token khác trên cùng form).
- 4a. Hai mật khẩu không khớp → E-SIGNIN-024 (không gọi API).
- 4b. Lỗi mạng/5xx/429 khi đổi → E-SIGNIN-023, giữ token để thử lại trên cùng form.
- 2a. Email thuộc tài khoản ở cổng khác vai → không gửi thư chéo cổng (BR-013).

**g. Ràng buộc/KPI:** Phản hồi luôn trung tính; thư chạy nền ≤ 150ms; log không chứa token/email; UI tự trễ 60 giây giữa các lần gửi.

**h. Ma trận UC ↔ FR ↔ Error:**

| Bước | FR | Error | Chứng cứ |
|---|---|---|---|
| 1 | FR-014 | E-019..021 | `apps/web/src/components/auth/forgot-password-form.tsx:13-50` |
| 2 | FR-014, FR-024 | — | `packages/auth/src/index.ts:258-297`, `packages/auth/src/auth-reset-password.test.ts:165-233` |
| 3-4 | FR-015 | E-022..024 | `apps/web/src/components/auth/reset-password-form.tsx:14-29,42-75` |
| 5 | FR-015, BR-008, BR-012 | — | `packages/auth/src/auth-reset-password.test.ts:118-163,257-293` |

**Nhận diện nhãn:** Giới hạn 3 lần/60 giây của nền service chỉ được biết qua comment và nhánh 429, chưa có test trực tiếp → 🔵 (BR-010, I-2).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
