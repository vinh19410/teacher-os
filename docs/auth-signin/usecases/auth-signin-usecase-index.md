---
type: usecase-index
feature: auth-signin
status: draft
updated: 2026-11-12
links:
  - docs/auth-signin/srs/auth-signin-spec.md
  - docs/auth-signin/srs/auth-signin-erd.md
  - docs/auth-signin/srs/auth-signin-flows.md
  - docs/auth-signin/srs/auth-signin-states.md
---

# auth-signin — Use Cases Index

## Use cases

> Bảng này là **ma trận truy vết per-feature** (`UC ↔ FR ↔ Screen ↔ Error ↔ OQ`) đồng thời là danh mục quản lý vòng đời Use Case.

| # | Slug | Level | Status | Actor primary | Covers FR | Screens | Errors (E-*) | OQ ref | Priority | Updated |
|---|------|-------|--------|---------------|-----------|---------|--------------|--------|----------|---------|
| 1 | [uc-signin-email-password](uc-signin-email-password.md) | sea | draft | Giáo viên | FR-auth-signin-001, FR-auth-signin-002, FR-auth-signin-003, FR-auth-signin-004, FR-auth-signin-008, FR-auth-signin-009, FR-auth-signin-018, FR-auth-signin-019, FR-auth-signin-020, FR-auth-signin-021, FR-auth-signin-022, FR-auth-signin-023 | login, signup-tab | E-auth-signin-001, E-auth-signin-002, E-auth-signin-003, E-auth-signin-004, E-auth-signin-005, E-auth-signin-006, E-auth-signin-008, E-auth-signin-012, E-auth-signin-013, E-auth-signin-017, E-auth-signin-029, E-auth-signin-030, E-auth-signin-031 | OQ-auth-signin-03 | P0 | 2026-11-12 |
| 2 | [uc-signin-google-oauth](uc-signin-google-oauth.md) | sea | draft | Giáo viên | FR-auth-signin-005, FR-auth-signin-006, FR-auth-signin-007, FR-auth-signin-008, FR-auth-signin-009, FR-auth-signin-019, FR-auth-signin-020, FR-auth-signin-021 | login, account-blocked | E-auth-signin-006, E-auth-signin-007, E-auth-signin-008, E-auth-signin-009, E-auth-signin-012, E-auth-signin-013, E-auth-signin-016, E-auth-signin-017, E-auth-signin-018 | — | P0 | 2026-11-12 |
| 3 | [uc-reset-password](uc-reset-password.md) | sea | draft | Khách chưa đăng nhập | FR-auth-signin-014, FR-auth-signin-015, FR-auth-signin-024 | forgot-password, reset-password, login | E-auth-signin-001, E-auth-signin-003, E-auth-signin-019, E-auth-signin-020, E-auth-signin-021, E-auth-signin-022, E-auth-signin-023, E-auth-signin-024 | OQ-auth-signin-02, OQ-auth-signin-03 | P0 | 2026-11-12 |
| 4 | [uc-verify-email](uc-verify-email.md) | sea | draft | Giáo viên | FR-auth-signin-008, FR-auth-signin-013, FR-auth-signin-016, FR-auth-signin-024 | verify-email, account-blocked, login | E-auth-signin-013, E-auth-signin-025, E-auth-signin-026, E-auth-signin-027 | OQ-auth-signin-03, OQ-auth-signin-04 | P0 | 2026-11-12 |
| 5 | [uc-role-cross-block](uc-role-cross-block.md) | sea | draft | Học viên | FR-auth-signin-008, FR-auth-signin-009, FR-auth-signin-010, FR-auth-signin-011, FR-auth-signin-012, FR-auth-signin-013, FR-auth-signin-017 | login, account-blocked, student-login, admin-login | E-auth-signin-006, E-auth-signin-007, E-auth-signin-008, E-auth-signin-010, E-auth-signin-011, E-auth-signin-012, E-auth-signin-013, E-auth-signin-014, E-auth-signin-015, E-auth-signin-028 | OQ-auth-signin-01, OQ-auth-signin-03 | P0 | 2026-11-12 |

## CRUD matrix

> Thao tác của từng Use Case lên các thực thể dữ liệu nghiệp vụ (`C`=Create, `R`=Read, `U`=Update, `D`=Delete), đối chiếu trực tiếp với `docs/auth-signin/srs/auth-signin-erd.md`.

| UC \ Entity | NguoiDung | PhienLamViec | TaiKhoanDinhDanh | MaXacThuc | ToChuc | ThanhVienToChuc |
|---|---|---|---|---|---|---|
| [uc-signin-email-password](uc-signin-email-password.md) | CR | CRUD | CR | C | CR | CR |
| [uc-signin-google-oauth](uc-signin-google-oauth.md) | CRU | CRUD | CRU | CRD | CR | CR |
| [uc-reset-password](uc-reset-password.md) | R | D | CRU | CRUD | — | — |
| [uc-verify-email](uc-verify-email.md) | RU | CR | — | — | — | — |
| [uc-role-cross-block](uc-role-cross-block.md) | R | RD | — | R | — | — |

## Actors

| Actor | Loại | Mô tả | Nguồn |
|---|---|---|---|
| Giáo viên | primary | Chủ tài khoản trung tâm đăng nhập vào ứng dụng giáo viên và vận hành lớp học | `auth-signin-spec.md` Mục 2 |
| Học viên | primary | Người học dùng cổng học viên; bị chặn khi truy cập nhầm ứng dụng giáo viên hoặc cổng quản trị | `auth-signin-spec.md` Mục 2 |
| Quản trị viên | primary | Người vận hành cổng quản trị với email thuộc danh sách quản trị được phép; chịu ranh giới chặn chéo cổng | `auth-signin-spec.md` Mục 2 |
| Khách chưa đăng nhập | primary | Người dùng chưa có phiên làm việc thực hiện đăng nhập, quên mật khẩu hoặc bấm liên kết xác thực | `auth-signin-spec.md` Mục 2 |
| Dịch vụ định danh Google | system | Nhà cung cấp xác thực tài khoản Google ngoài hệ thống | `auth-signin-spec.md` Mục 2 |
| Dịch vụ gửi thư điện tử | system | Dịch vụ chuyển phát thư xác thực email, thư đặt lại mật khẩu và mã OTP | `auth-signin-spec.md` Mục 2 |
| Chủ trung tâm / Chủ dự án | stakeholder | Chủ sở hữu chính sách danh sách email được phép và cờ mở đăng ký (bên liên quan gián tiếp, không thao tác trực tiếp trong luồng) | `auth-signin-spec.md` Mục 2 |

## Relationships

| Type | From | To | Rationale |
|---|---|---|---|
| extend | [uc-role-cross-block](uc-role-cross-block.md) | [uc-signin-email-password](uc-signin-email-password.md) | Chặn tạo phiên hoặc hiển thị màn hình bị chặn khi tài khoản đăng nhập không đúng vai trò của cổng |
| extend | [uc-role-cross-block](uc-role-cross-block.md) | [uc-signin-google-oauth](uc-signin-google-oauth.md) | Từ chối tạo phiên hoặc chặn ở cổng dữ liệu khi tài khoản Google lệch vai trò hoặc ngoài danh sách cho phép |
| extend | [uc-verify-email](uc-verify-email.md) | [uc-signin-email-password](uc-signin-email-password.md) | Bổ sung bước xác thực email và tự phục hồi từ màn hình bị chặn khi giáo viên chưa xác thực email |

## Nguồn dữ liệu

* FR + Error Matrix: [[../srs/auth-signin-spec.md|SRS spec]]
* ERD: [[../srs/auth-signin-erd.md|ERD]]
* Flows & States: [[../srs/auth-signin-flows.md|Flows]] · [[../srs/auth-signin-states.md|States]]
* Open Questions: `docs/auth-signin/srs/auth-signin-spec.md` Mục 12

<!-- wm:c3e3a8b9c06f46427bf9089e2fdafa48 -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản quyền hoangphan.blog</sub>
