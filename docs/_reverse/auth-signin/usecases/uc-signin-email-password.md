---
type: reverse-usecase
feature: auth-signin
uc: UC-SIGNIN-01
status: draft
updated: 2026-11-11
---

# UC-SIGNIN-01 — Đăng nhập bằng email/mật khẩu

**a. Tên:** Đăng nhập ứng dụng giáo viên bằng email và mật khẩu.
**b. Actor chính:** Giáo viên (khách chưa đăng nhập ở thời điểm bắt đầu).
**c. Tiền điều kiện:** Có tài khoản với vai giáo viên (hoặc bất kỳ vai nào — việc sai vai do UC-SIGNIN-05 xử lý); đang ở `/login`.
**d. Hậu điều kiện thành công:** Có phiên hiệu lực; vào vùng làm việc theo `returnUrl` hợp lệ hoặc `/dashboard`; lần sau có thể dùng `returnUrl` sau khi mất phiên (FR-023).

**e. Luồng chính:**
1. Mở `/login` (nếu đã có phiên mà vào route bảo vệ → bị đẩy về `/login?returnUrl=...`).
2. Nhập email, mật khẩu; hệ thống kiểm bắt buộc từng trường, email tự cắt khoảng trắng, KHÔNG kiểm độ dài mật khẩu lúc đăng nhập.
3. Bấm "Đăng nhập": gọi biên auth với email đã trim.
4. Sau khi API thành công, kiểm tra tầng 2 rằng phiên thật sự tồn tại (đọc lại phiên).
5. Kiểm duyệt `returnUrl` (chỉ nhận đường dẫn cùng ứng dụng, mặc định `/dashboard`) và chuyển trang.

**f. Luồng thay đổi/ngoại lệ:**
- 2a. Thiếu email/mật khẩu hoặc email sai định dạng → hiện đúng câu của từng trường (E-SIGNIN-001..003), không gọi API.
- 3a. Server từ chối (sai thông tin, mạng) → toast chung E-SIGNIN-004; không tiết lộ trường nào sai.
- 4a. API OK nhưng không có phiên → toast E-SIGNIN-005 (phân biệt rõ "mất phiên" với "sai mật khẩu").
- 5a. `returnUrl` ngoài ứng dụng/độc hại → bỏ, về `/dashboard`.
- 8a. Phiên hết hạn sau này khi dùng ứng dụng → tự đăng xuất sạch về `/login?returnUrl=...` (FR-023).

**g. Ràng buộc/KPI:** Không bao giờ hiện câu lỗi kỹ thuật; một thông báo mỗi lần; phiên đọc phía client có cache 10 giây, timeout 5 giây.

**h. Ma trận UC ↔ FR ↔ Error:**

| Bước | FR | Error | Chứng cứ |
|---|---|---|---|
| 2 | FR-001 | E-001..003 | `apps/web/src/lib/sign-in-schema.ts:3-17`, `apps/e2e/specs/signin-validation.spec.ts:49-93` |
| 3 | FR-001, FR-002 | E-004 | `apps/web/src/components/sign-in-form.tsx:32-33,40-48` |
| 4 | FR-003 | E-005 | `apps/web/src/components/sign-in-form.tsx:49-62`, `apps/e2e/specs/auth-fail-loudly.spec.ts` |
| 5 | FR-004 | — | `apps/web/src/lib/kernel-load-state.ts:175-212` |
| 8a | FR-023 | E-029 | `apps/web/src/lib/reauth.ts:25-33`, `apps/web/src/lib/kernel-load-state.ts:87` |

**Nhận diện nhãn:** Câu gốc "sai thông tin đăng nhập" của nền service không pin trong catalog nội bộ — câu UI chỉ là lớp bao ngoài → 🟡 (OQ-003).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
