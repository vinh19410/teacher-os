# schedule-reverse-erd.md — Mô hình dữ liệu tái lập (feature `schedule`)

> Chỉ `org_event` là thực thể feature sở hữu. `organization`, `class`, `lesson`, `class_session`, `organization_holiday`, `holiday_session_shift` được đưa vào vì **mọi thực thể đứng trong quan hệ phải có khối thuộc tính** và lịch đọc trực tiếp dữ liệu của chúng; quyền sở hữu ghi vẫn thuộc feature tương ứng. Tên cột ghi theo schema Drizzle; kiểu `text`/`integer` theo SQLite.

## Sơ đồ quan hệ

```mermaid
erDiagram
    ORGANIZATION ||--o{ ORG_EVENT : "co su kien van hanh"
    ORGANIZATION ||--o{ CLASS : "co lop hoc"
    ORGANIZATION ||--o{ CLASS_SESSION : "co buoi thu cong"
    ORGANIZATION ||--o{ ORGANIZATION_HOLIDAY : "co ky nghi"
    CLASS ||--o{ LESSON : "co dong buoi hoc"
    CLASS ||--o{ CLASS_SESSION : "khai bao buoi"
    ORGANIZATION_HOLIDAY ||--o{ HOLIDAY_SESSION_SHIFT : "tao cap buoi goc buoi bu"
    CLASS ||--o{ HOLIDAY_SESSION_SHIFT : "buoi bi doi lich"

    ORGANIZATION {
        text id PK "uuid"
        text name "ten to chuc"
        integer created_at "ms epoch"
    }
    ORG_EVENT {
        text id PK "uuid tu server"
        text org_id FK "cascade theo to chuc"
        text title "2-100 ky tu sau trim"
        text date "yyyy-mm-dd"
        text start_time "HH:mm"
        text end_time "HH:mm, sau start_time"
        text note "mac dinh rong, toi da 500"
        text created_by_user_id "nguoi tao tu phien"
        integer created_at "ms epoch"
    }
    CLASS {
        text id PK "uuid"
        text org_id FK "cascade"
        text name "ten lop"
        text schedule "mo ta lich lop"
        text status "active va trang thai khac"
        text start_date "yyyy-mm-dd neu co"
        integer sessions_total "tong so buoi ke hoach"
        integer sessions_done "so buoi da day"
    }
    LESSON {
        text id PK "uuid"
        text org_id FK "cascade"
        text class_id FK "thuoc lop"
        text enrollment_id FK "thuoc ghi danh"
        integer day "1-7 thu hai dau tuan"
        text time "HH:mm"
        integer dur "so phut"
        text date "yyyy-mm-dd occurrence, null la lop cu"
        text type "1-1, 1-2, trial, mock"
        text status "upcoming completed absent cancelled holiday"
    }
    CLASS_SESSION {
        text id PK "uuid"
        text org_id FK "cascade"
        text class_id FK "thuoc lop"
        text date "yyyy-mm-dd"
        text time "HH:mm"
        integer dur "so phut"
        text topic "chu de, mac dinh rong"
    }
    ORGANIZATION_HOLIDAY {
        text id PK "uuid"
        text org_id FK "cascade"
        text name "2-100 ky tu"
        text from_date "yyyy-mm-dd, tinh ca hai dau"
        text to_date "yyyy-mm-dd, khoang toi da 30 ngay"
        text scope "org hoac classes"
        text mode "shift hoac cancel"
        integer notify "co gui thong bao"
        integer notified_at "null la chua gui"
        text created_by_user_id "nguoi tao"
    }
    HOLIDAY_SESSION_SHIFT {
        text id PK "uuid"
        text org_id FK "cascade"
        text holiday_id FK "thuoc ky nghi"
        text class_id FK "thuoc lop"
        text original_date "yyyy-mm-dd buoi goc"
        text makeup_date "yyyy-mm-dd buoi bu cuoi khoa"
    }
```

## Entity Reference

| Thực thể | Nghĩa nghiệp vụ | Sở hữu (feature) | Đặc tính chính | Nguồn |
|----------|-----------------|------------------|----------------|-------|
| `org_event` | Sự kiện vận hành ngoài lịch lớp (họp, tra kỳ…) | **schedule** | Không trạng thái, không lặp, không người tham dự; xóa là vĩnh viễn | `packages/db/src/schema/org-event.ts:5-27`; `packages/db/src/migrations/0046_faithful_punisher.sql:1-12` |
| `organization` | Tổ chức — phạm vi dữ liệu | kernel | Mọi thực thể lịch đều treo org_id | `packages/db/src/schema/organization.ts:4-10` |
| `class` | Lớp học | classes | `status`, `schedule`, màu lịch suy từ `id` (hash 1..8), không cột màu | `packages/db/src/schema/class.ts:11-41`; `apps/web/src/lib/class-color.ts:1-22` |
| `lesson` | Dòng buổi học theo ghi danh (nguồn ca học thực/dự kiến) | classes | `date` null = lớp legacy theo mẫu thứ; `status` 5 giá trị (TOS-11) | `packages/db/src/schema/lesson.ts:31-72` |
| `class_session` | Buổi khai báo thủ công của lớp (#649) | classes | Độc lập ghi danh; lịch dùng cho ca dự kiến/hiển thị | `packages/db/src/schema/class-session.ts:10-38` |
| `organization_holiday` | Kỳ nghỉ chung của org | holidays | Khoảng ngày ≤ 30, scope org/classes, mode shift/cancel | `packages/db/src/schema/organization-holiday.ts:20-49` |
| `holiday_session_shift` | Cặp buổi gốc → buổi bù (nguồn nhãn "Đã dời sang dd/MM") | holidays | Duy nhất theo (classId, originalDate) và (classId, makeupDate) | `packages/db/src/schema/organization-holiday.ts:80-110` |

## Quan hệ

| Quan hệ | Cardinality | Ý nghĩa với lịch | Nguồn |
|---------|-------------|------------------|-------|
| organization → org_event | 1 : N, xóa tổ chức thì sự kiện biến mất theo | Phạm vi hiển thị + điều kiện xóa an toàn (không xóa chéo tổ chức) | `packages/db/src/schema/org-event.ts:13-15`; `apps/server/src/routes/events.ts:71-76` |
| organization → class / class_session / organization_holiday | 1 : N | Snapshot tải toàn bộ theo tổ chức | `packages/db/src/schema/class.ts:14-17`; `packages/db/src/schema/class-session.ts:21-24`; `packages/db/src/schema/organization-holiday.ts:24-27` |
| class → lesson | 1 : N | Mỗi ô/agenda gom dòng buổi theo lớp, tô màu theo id lớp | `packages/db/src/schema/lesson.ts:33-38`; `apps/web/src/lib/schedule-week.ts:107-148` |
| class → class_session | 1 : N | Nguồn ca khi lớp ở chế độ thủ công | `packages/db/src/schema/class-session.ts:25-28` |
| organization_holiday → holiday_session_shift | 1 : N | Nhãn "Nghỉ lễ — Đã dời sang dd/MM" trên cột tuần | `packages/db/src/schema/organization-holiday.ts:69-96`; `apps/web/src/components/schedule/schedule-week-view.tsx:150-159` |
| class → holiday_session_shift | 1 : N | Buổi gốc của lớp bị dời sang ngày bù cuối khóa | `packages/db/src/schema/organization-holiday.ts:80-110` |
| (phi chính thức) holiday ⇢ lesson | Không có khóa ngoại | Dòng buổi gốc chuyển trạng thái "nghỉ lễ đã dời"; cặp gốc→bù sống ở bảng shift, không đoán ngược từ lesson | `packages/db/src/schema/organization-holiday.ts:9-18`; `packages/db/src/schema/lesson.ts:52-66` |

Ghi chú: `org_event` **không** có quan hệ tới `lesson`/`class` — đúng thiết kế "sự kiện ngoài lịch lớp, không đụng buổi dạy" (`packages/db/src/schema/org-event.ts:5-8`; test bất biến `apps/server/src/routes/events.test.ts:192-237`).
