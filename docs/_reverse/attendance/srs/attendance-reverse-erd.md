# srs/attendance-reverse-erd — attendance

Kiểu cột khớp schema thật (packages/db/src/schema/lesson.ts, packages/db/src/schema/organization-holiday.ts). FK ghi ở đây là FK schema-level (`references` + ON DELETE cascade); các quan hệ APP-LEVEL (không có FK) được ghi chú riêng dưới biểu đồ.

```mermaid
erDiagram
    lesson {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text class_id FK "NOT NULL -> class.id, cascade"
        text enrollment_id FK "NOT NULL -> enrollment.id, cascade"
        integer day "NOT NULL, 1-7 Monday-first"
        text time "NOT NULL, HH:MM"
        integer dur "NOT NULL, phút"
        text date "NULL = legacy, yyyy-mm-dd UTC-anchored"
        text type "NOT NULL default 1:1"
        text status "NOT NULL default upcoming: upcoming|completed|absent|cancelled|holiday"
        text attendance "NULL | present|late|excused|unexcused"
        text attendance_note "NULL, <=255, teacher-only"
        text topic "NOT NULL default rỗng"
        text zoom "NOT NULL default rỗng"
        integer created_at "NOT NULL default unixepoch ms"
    }
    organization_holiday {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text name "NOT NULL, 2-100 ký tự sau trim"
        text from_date "NOT NULL yyyy-mm-dd"
        text to_date "NOT NULL yyyy-mm-dd, <=30 ngày cả hai đầu"
        text scope "NOT NULL: org|classes"
        text mode "NOT NULL: shift|cancel"
        integer notify "NOT NULL boolean default true"
        integer notified_at "NULL timestamp_ms, TOS-19 set khi đã gửi"
        text created_by_user_id "NOT NULL"
        integer created_at "NOT NULL default unixepoch ms"
    }
    organization_holiday_class {
        text id PK
        text holiday_id FK "NOT NULL -> organization_holiday.id, cascade"
        text class_id FK "NOT NULL -> class.id, cascade"
    }
    holiday_session_shift {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text holiday_id FK "NOT NULL -> organization_holiday.id, cascade"
        text class_id FK "NOT NULL -> class.id, cascade"
        text original_date "NOT NULL, buổi gốc đã chuyển holiday"
        text makeup_date "NOT NULL, buổi bù cuối khóa"
        integer created_at "NOT NULL default unixepoch ms"
    }
    holiday_session_cancel {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text holiday_id FK "NOT NULL -> organization_holiday.id, cascade"
        text class_id FK "NOT NULL -> class.id, cascade"
        text date "NOT NULL, buổi bị hủy bởi kỳ nghỉ"
        integer created_at "NOT NULL default unixepoch ms"
    }
    organization_holiday ||--o{ organization_holiday_class : "scope classes"
    organization_holiday ||--o{ holiday_session_shift : "cặp gốc-bù"
    organization_holiday ||--o{ holiday_session_cancel : "buổi bị hủy"
    organization_holiday ||--o{ lesson : "app-level: dòng lesson.date trong khoảng nghỉ"
    organization_holiday_class ||--o{ lesson : "app-level: theo classId"
    holiday_session_shift ||--o{ lesson : "app-level: (classId, originalDate) holiday + (classId, makeupDate) upcoming"
    holiday_session_cancel ||--o{ lesson : "app-level: (classId, date) cancelled"
```

Unique indexes (schema thật):

- `organization_holiday_class_holiday_class_uq (holiday_id, class_id)` — packages/db/src/schema/organization-holiday.ts:63-68 ✅.
- `holiday_session_shift_class_original_uq (class_id, original_date)` và `holiday_session_shift_class_makeup_uq (class_id, makeup_date)` — packages/db/src/schema/organization-holiday.ts:100-111 ✅.
- `holiday_session_cancel_class_date_uq (class_id, date)` — packages/db/src/schema/organization-holiday.ts:141-148 ✅.
- `lesson`: không unique trên bucket; index thường `lesson_class_date_idx (class_id, date)`, `lesson_enrollment_idx (enrollment_id, status)`, `lesson_org_idx` — packages/db/src/schema/lesson.ts:75-79 ✅.

Quan hệ tham chiếu ngoài feature (không đặc tả ở đây): `lesson.class_id → class.id`, `lesson.enrollment_id → enrollment.id` (1 buổi = 1 enrollment), `organization_holiday_class.class_id → class.id`, mọi `org_id → organization.id` — packages/db/src/schema/lesson.ts:33-41 ✅.

Migration tương ứng: packages/db/src/migrations/0045_aspiring_thena.sql:1-2 (2 cột điểm danh); packages/db/src/migrations/0047_slim_nightmare.sql:1-42 (holiday + shift + class); packages/db/src/migrations/0050_bent_spectrum.sql:1-15 (cancel) ✅.
