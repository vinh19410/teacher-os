---
type: reverse-usecase-index
feature: auth-signin
updated: 2026-11-11
---

# auth-signin — Danh mục use case (reverse)

| UC | Tên | Actor chính | File chi tiết | FR liên quan | Nhãn trọng tâm |
|---|---|---|---|---|---|
| UC-SIGNIN-01 | Đăng nhập bằng email/mật khẩu | Giáo viên | `usecases/uc-signin-email-password.md` | FR-001..004, FR-022, FR-023 | E-SIGNIN-001..005, 029 |
| UC-SIGNIN-02 | Đăng nhập bằng Google | Giáo viên | `usecases/uc-signin-google-oauth.md` | FR-005..008, FR-019, FR-020 | E-SIGNIN-006..009 |
| UC-SIGNIN-03 | Quên và đặt lại mật khẩu | Khách chưa đăng nhập | `usecases/uc-reset-password.md` | FR-014, FR-015, FR-024 | E-SIGNIN-019..024 |
| UC-SIGNIN-04 | Xác thực email và gửi lại | Giáo viên (mới tạo) | `usecases/uc-verify-email.md` | FR-016, FR-013 | E-SIGNIN-025..027 |
| UC-SIGNIN-05 | Chặn chéo vai trò giữa các cổng | Học viên/Giáo viên/Quản trị | `usecases/uc-role-cross-block.md` | FR-008..013 | E-SIGNIN-006..008, 010..015 |

Phụ trợ dùng chung: màn bị chặn (FR-012, FR-013), mất phiên (FR-023), gửi mail (FR-024).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
