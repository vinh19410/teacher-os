---
type: reverse-srs-erd
feature: auth-signin
updated: 2026-11-11
---

# auth-signin — ERD tái lập (reverse)

Đặt tên nghiệp vụ ASCII cho biểu đồ; tên bảng/cột thật ghi ở bảng tham chiếu. Nguồn schema: `packages/db/src/schema/auth.ts`, `packages/db/src/schema/membership.ts`.

```mermaid
erDiagram
    NGUOI_DUNG ||--o{ PHIEN : "co cac phien dang nhap"
    NGUOI_DUNG ||--o{ TAI_KHOAN_DINH_DANH : "mat khau hoac Google"
    NGUOI_DUNG ||--o{ MA_XAC_THUC : "token reset / verify / OTP"
    NGUOI_DUNG ||--o{ THANH_VIEN_TO_CHUC : "tuc cach trong trung tam"
    TO_CHUC ||--o{ THANH_VIEN_TO_CHUC : "gom cac thanh vien"

    NGUOI_DUNG {
        string email "Dia chi email dang nhap, duy nhat"
        bool da_xac_thuc_email "Da bam link xac thuc chua"
        string vai "student / teacher / admin, gan mot lan"
        string ten "Ten hien thi, mac dinh tu tien to email"
        string anh_dai_dien "Anh dai dien an toan (PNG/JPEG/https)"
    }
    PHIEN {
        string nguoi_dung "Thuoc nguoi dung nao"
        datetime het_han "Thoi diem phien het hieu luc"
        string bo_sang_mat_khau "Dang nhap tu thiet bi nao"
    }
    TAI_KHOAN_DINH_DANH {
        string nha_cung_cap "mat khau noi bo hoac Google"
        string mat_khau "Ban ghi mat khau neu co"
    }
    MA_XAC_THUC {
        string ban_bam_gia_tri "Chi luu ban bam token / OTP"
        datetime het_han "Reset-verify 1 gio, OTP 5 phut"
    }
    TO_CHUC {
        string ten "Ten trung tam (= ten giao vien dau tien)"
    }
    THANH_VIEN_TO_CHUC {
        string vai_thanh_vien "Mac dinh teacher"
        duy_nhat "Mot nguoi dung mot dong trong mot to chuc"
    }
```

## Entity Reference

| Entity | Mô tả nghiệp vụ | Thuộc tính chính (bảng/cột thật) | Nguồn | Nhãn |
|--------|-----------------|------------------|-------|------|
| NGUOI_DUNG (user) | Tài khoản đăng nhập chung mọi cổng | email (unique), emailVerified, role default "student", name, image | `packages/db/src/schema/auth.ts:4-28` | ✅ |
| PHIEN (session) | Đăng nhập đang hiệu lực | userId, expiresAt, ipAddress, userAgent | `packages/db/src/schema/auth.ts:30-49` | ✅ |
| TAI_KHOAN_DINH_DANH (account) | Nguồn định danh: mật khẩu hoặc Google | userId, providerId, password | `packages/db/src/schema/auth.ts:51-79` | ✅ |
| MA_XAC_THUC (verification) | Token đặt lại/xác thực/OTP (lưu băm) | identifier, value (băm), expiresAt | `packages/db/src/schema/auth.ts:81-97` | ✅ |
| TO_CHUC (organization) | Trung tâm (mô hình một tổ chức) | name | `apps/server/src/app.ts:278-291` | ✅ |
| THANH_VIEN_TO_CHUC (membership) | Tư cách trong tổ chức | orgId, userId, role default "teacher", unique (orgId,userId) | `packages/db/src/schema/membership.ts:22,28` | ✅ |

## Quan hệ

| Từ | Đến | Bản số | Ý nghĩa | Nguồn | Nhãn |
|----|-----|--------|---------|-------|------|
| user | session | 1 - 0..n | Một người nhiều phiên (máy khác nhau) | `packages/db/src/schema/auth.ts:30-49` | ✅ |
| user | account | 1 - 0..n | Một người có thể có mật khẩu và/hoặc Google | `packages/db/src/schema/auth.ts:51-79` | ✅ |
| user | verification | 1 - 0..n | Token/OTP đang chờ theo email định danh | `packages/db/src/schema/auth.ts:81-97` | ✅ |
| user | membership | 1 - 0..n | Tư cách trong tổ chức | `packages/db/src/schema/membership.ts:22,28` | ✅ |
| organization | membership | 1 - 0..n | Tổ chức gom thành viên; một tổ chức trong giai đoạn hiện tại | `apps/server/src/app.ts:278-291` | ✅ |
| user | role | 1 - 1 | Vai gán một lần, không đổi | `packages/auth/src/index.ts:329-333,481-497` | ✅ |

## Notes

* Thuộc tính DB thật (id, createdAt, updatedAt…) cố ý không đưa hết — chỉ giữ thuộc tính có ý nghĩa nghiệp vụ cho feature đăng nhập.
* Không mô hình hóa bảng ngoài 6 thực thể trên (dữ liệu nghiệp vụ khác thuộc feature khác).

<!-- Bộ AI4BA BA-Kit -->
<sub>Tài liệu thuộc bộ AI4BA BA-Kit — bản Reverse Engineering.</sub>
