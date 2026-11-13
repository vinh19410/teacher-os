---
feature: study-pack
type: reverse-erd
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs erd — study-pack

Chỉ vẽ khoá ngoại CÓ THẬT trong schema. Bốn bảng của feature vẽ đủ cột; các
bảng ngoài feature chỉ vẽ các cột liên quan. Con trỏ KHÔNG có khoá ngoại
(`study_pack.source_pack_id`, `study_pack_item.source_id`,
`class_assignment.class_study_pack_id`) KHÔNG vẽ đường quan hệ — giải thích
bằng chữ dưới hình.

```mermaid
erDiagram
    organization |o--o{ study_pack : org_id
    organization ||--o{ class_study_pack : org_id
    study_pack ||--o{ study_pack_item : pack_id
    study_pack ||--o{ class_study_pack : pack_id_restrict
    class ||--o{ class_study_pack : class_id
    class ||--o{ class_assignment : class_id
    assignment_prompt ||--o{ class_assignment : prompt_id

    study_pack {
        text id PK
        text org_id FK "NULL = bo he thong"
        text title
        text description
        text status "draft hoac ready"
        text source_pack_id "con tro khong FK"
        text created_by
        integer created_at
        integer updated_at
    }
    study_pack_item {
        text id PK
        text pack_id FK
        integer day_index
        integer position
        text source_kind "org_prompt hoac library_test_part hoac library_exercise"
        text source_id "con tro da hinh khong FK"
    }
    class_study_pack {
        text id PK
        text org_id FK
        text class_id FK
        text pack_id FK "onDelete restrict"
        text title
        text start_date
        text release_time "mac dinh 06:00"
        text due_time "mac dinh 17:00"
        text status "active hoac cancelled"
        text created_by
        integer created_at
        integer cancelled_at
    }
    study_pack_exercise {
        text id PK
        text skill "reading grammar vocabulary"
        text part
        text type
        text title
        text band
        text intro
        text passage
        text questions
        text optionBank
        text note
        text status
        text created_by
        integer created_at
        integer updated_at
    }
    class_assignment {
        text id PK
        text org_id
        text class_id FK
        text prompt_id FK
        text title
        text due
        text note
        integer due_at
        integer available_at "ghi mot lan luc gan"
        text class_study_pack_id "con tro khong FK"
        integer created_at
    }
    assignment_prompt {
        text id PK
        text org_id FK
        text skill
        text status
        text library_ref "unique cung org_id"
    }
    organization {
        text id PK
        text name
        integer created_at
    }
    class {
        text id PK
        text org_id FK
        text name
        text status
    }
```

## Đọc mô hình

- `organization |o--o{ study_pack`: org_id nullable — NULL chính là bộ đề hệ
  thống. ✅ packages/db/src/schema/study-pack.ts:53-55
- `study_pack ||--o{ class_study_pack` mang onDelete restrict: đây là rào khiến
  xoá bộ đề đã gán bị chặn 409 trước khi chạm khoá. ✅
  packages/db/src/schema/study-pack.ts:125-127; ✅
  apps/server/src/routes/study-pack.ts:248-258
- Lớp không tham chiếu thẳng tới bộ đề; mọi liên kết lớp-bộ đi qua
  `class_study_pack` (trong hình đã có hai đường `class` và `study_pack` tới
  bảng trung gian này). ✅ packages/db/src/schema/study-pack.ts:115-146
- Ba con trỏ mềm, không khoá ngoại, không xoá lan:
  1. `study_pack.source_pack_id` — bộ đề org trỏ về bộ hệ thống gốc khi nhân
     bản; khoá duy nhất `(org_id, source_pack_id)` chống nhân bản trùng. ✅
     packages/db/src/schema/study-pack.ts:59, :71-74
  2. `study_pack_item.source_id` — trỏ đa hình theo `source_kind` tới đề org,
     part thư viện hoặc đề exercise hệ thống. ✅
     packages/db/src/schema/study-pack.ts:87-95
  3. `class_assignment.class_study_pack_id` — bài giao trỏ về lượt gán; cố ý
     không FK để huỷ không xoá lan, bảo toàn bài đã có lần làm. ✅
     packages/db/src/schema/class-assignment.ts:39-45
- Vật hoá đề thư viện ghi đè lên `assignment_prompt` của org một lần duy nhất
  theo khoá duy nhất `(org_id, library_ref)`; học viên chỉ làm bài qua
  `assignment_prompt`. ✅ packages/db/src/schema/assignment-prompt.ts:55, :62-64
- `class_assignment.available_at` là cột tuyệt đối ghi một lúc gán; mọi đường
  đọc lọc theo nó, không tiến trình nền. ✅
  packages/db/src/schema/class-assignment.ts:38; ✅
  apps/server/src/lib/assignment-visibility.ts:1-16
