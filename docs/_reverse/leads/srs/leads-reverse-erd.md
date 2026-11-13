# Sơ đồ thực thể — lead

Khớp schema thật [S3] packages/db/src/schema/lead.ts:15-60 và migration 0057
[S8] packages/db/src/migrations/0057_exotic_vulture.sql:1-27; bảng tổ chức
[S30] packages/db/src/schema/organization.ts:3-10.

```mermaid
erDiagram
    ORGANIZATION {
        text id PK "ma to chuc"
        text name "ten to chuc"
        integer created_at "thoi diem tao"
    }
    LEAD {
        text id PK "ma dang ky - uuid"
        text org_id FK "org dich tu cau hinh may chu"
        text name "ho ten 2-80 ky tu"
        text phone "so dien thoai da chuan hoa 0xxxxxxxxx"
        text email "rong neu khong co - toi da 120"
        text birth_date "yyyy-mm-dd hoac rong"
        text course "ma khoa trong danh muc 15 ma"
        text study_mode "ma hinh thuc - 3 gia tri"
        text study_days "cap ngay hoc - 5 gia tri"
        text time_slot "khung gio - 6 gia tri"
        text note "ghi chu cua hoc vien - 500"
        text placement "ket qua test dau vao - 300"
        text teacher_note "ghi chu noi bo giao vien - 1000"
        text source "profile hoac placement-test"
        text status "new contacted enrolled dropped"
        text ip_hash "HMAC cua dia chi mang - rong neu thieu secret"
        integer submit_count "so lan gui - mac dinh 1 - tran 5 trong 24h"
        integer created_at "mili giay - DB tu dien khi tao"
        integer updated_at "mili giay - cap nhat moi lan ghi"
        integer status_changed_at "mili giay hoac NULL"
    }
    LEAD }o--|| ORGANIZATION : "thuoc ve"
```

Chỉ mục phục vụ nghiệp vụ [S3] packages/db/src/schema/lead.ts:47-59:

1. `(org_id, status, created_at)` — danh sách phân trang + lọc trạng thái + trần ngày.
2. `(org_id, phone, updated_at)` — gộp trùng theo SĐT 24 giờ.
3. `(ip_hash, updated_at)` — đếm tần suất theo địa chỉ mạng 10 phút.

Ghi chú thiết kế đọc từ code:

- ✅ Xóa tổ chức kéo theo xóa đăng ký (khóa ngoại cascade). [S3] packages/db/src/schema/lead.ts:19-21; [S8] packages/db/src/migrations/0057_exotic_vulture.sql:22
- ✅ Không có bảng nào khác trong tính năng; mọi trường hợp gộp dạng danh mục
  (khoá, hình thức, lịch, khung giờ) lưu dạng mã văn bản, danh mục đóng nằm ở
  lớp hợp đồng chứ không phải bảng tra. [S4] packages/api/src/lead-contracts.ts:19-129
- 🟡 Không có ràng buộc duy nhất nào ở cấp bảng cho số điện thoại (gộp trùng là
  hành vi ứng dụng theo cửa sổ 24 giờ, không phải ràng buộc CSDL) —
  [S8] packages/db/src/migrations/0057_exotic_vulture.sql:1-27 (chỉ PRIMARY KEY).
