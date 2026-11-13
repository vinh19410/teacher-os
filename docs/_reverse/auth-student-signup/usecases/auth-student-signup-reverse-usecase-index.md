# auth-student-signup — Danh mục use case (reverse)

| ID | Tên use case | Actor chính | FR liên quan | Lỗi chính |
|----|--------------|-------------|--------------|-----------|
| UC-01 | Đăng ký tài khoản bằng email + mật khẩu | Học viên (khách) | FR-001,002,003,014 | E-01..E-06 |
| UC-02 | Xác thực email (bấm link, gửi lại) | Học viên | FR-004,005,006,018 | E-14, E-29 |
| UC-03 | Đăng nhập Google lần đầu | Học viên | FR-013,014,017 | E-15 |
| UC-04 | Đăng nhập bằng mã OTP email | Học viên | FR-008..012 | E-07..E-10, E-30 |
| UC-05 | Tự động tạo hồ sơ lần đầu vào portal (provisioning) | Hệ thống (học viên kích hoạt) | FR-019,020,021,022,023,024 | E-16..E-20 |
| UC-06 | Hoàn thành onboarding 5 bước | Học viên | FR-025 | E-27, E-28 |
| UC-07 | Teacher bị chặn truy cập cổng học viên | Giáo viên | FR-017,018 | E-11,E-12,E-14,E-16 |
| UC-08 | Quên mật khẩu / đặt lại mật khẩu | Học viên | FR-003 (reset) | E-23..E-26 |

## Actors

| Actor | Loại | Xuất hiện trong UC |
|-------|------|--------------------|
| Học viên (khách hoặc đã đăng nhập) | người | UC-01..06, UC-08 |
| Giáo viên | người | UC-07 |
| Quản trị viên | người | (chỉ bị gate, ngoài scope) |
| Mailer | hệ thống | UC-01,02,04,08 |
| Google OAuth | ngoài | UC-03 |
| Hệ thống provisioning | hệ thống | UC-05 |

## Ma trận UC ↔ FR ↔ Error (tóm tắt bắt lỗi thiếu)

| UC | FR phủ | Error phủ | Điểm yếu ghi nhận |
|----|--------|-----------|-------------------|
| UC-01 | FR-001/002/003/014 | E-01..06 | E-06 chưa rõ wording server (OQ-1) |
| UC-02 | FR-004/005/006/018 | E-14, E-29 | E-29 wording UI chưa bắt (Gap) |
| UC-03 | FR-013/014/017 | E-15 | emailVerified sau Google chưa rõ (OQ-4) |
| UC-04 | FR-008..012 | E-07..10, E-30 | ngưỡng rate-limit server chưa thấy (Gap) |
| UC-05 | FR-019..024 | E-16..20 | ý định "org sớm nhất" mở (OQ-5) |
| UC-06 | FR-025 | E-27, E-28 | — |
| UC-07 | FR-017/018 | E-11,12,14,16 | — |
| UC-08 | FR-003 (reset) | E-23..26 | — |

## Ghi chú

- Mỗi UC có file riêng `usecases/uc-01..uc-08` (định dạng fully-dressed a–h).
- UC-05 là use case hệ thống: actor kích hoạt là học viên, thao tác do server tự thực hiện.
- Truy vết FR đầy đủ ở `auth-student-signup-reverse-spec.md` Mục 3; nguồn ở `reverse-sources.md`.
