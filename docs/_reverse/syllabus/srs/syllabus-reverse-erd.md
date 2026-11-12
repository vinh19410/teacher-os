# ERD — feature `syllabus` (reverse)

Mọi thực thể xuất hiện trong quan hệ đều có khối thuộc tính. Kiểu dữ liệu theo SQLite (drizzle).

```mermaid
erDiagram
    ORGANIZATION ||--o{ SYLLABUS : "org sở hữu"
    SYLLABUS ||--o{ SYLLABUS_MODULE : "gồm module"
    SYLLABUS_MODULE ||--o{ SYLLABUS_LESSON : "gồm bài học"
    SYLLABUS_LESSON ||--o{ SYLLABUS_LESSON_MATERIAL : "gắn tài liệu"
    MATERIAL ||--o{ SYLLABUS_LESSON_MATERIAL : "được gắn vào bài"
    CLASS |o--o| SYLLABUS : "một lớp có nhiều nhất một bản copy"
    SYLLABUS |o--o| SYLLABUS : "bản copy chứa provenance template"
    CLASS ||--o{ LESSON_TAUGHT : "buổi dạy thực tế"
    CLASS ||--o{ CLASS_SESSION : "buổi thủ công"
    CLASS ||--o{ ENROLLMENT : "học viên ghi danh"
    ENROLLMENT |o--o| SESSION_PACKAGE : "gói buổi"

    ORGANIZATION {
        text id PK
    }
    SYLLABUS {
        text id PK
        text org_id FK
        text name "không rỗng"
        text level "default rỗng"
        text type "ielts hoặc communication"
        text skills "chuỗi JSON array"
        text description
        integer total_lessons "giá trị form - UI recompute"
        integer created_at
        text class_id "NULL là template - unique khi NOT NULL"
        text source_template_id "logical FK tới template"
    }
    SYLLABUS_MODULE {
        text id PK
        text org_id FK
        text syllabus_id FK
        text title
        text description
        integer position
        integer created_at
    }
    SYLLABUS_LESSON {
        text id PK
        text org_id FK
        text module_id FK
        text title
        text objectives
        text materials "văn bản tự do"
        text kind "lesson midterm final"
        text status "done current upcoming"
        integer position
        integer created_at
    }
    SYLLABUS_LESSON_MATERIAL {
        text org_id FK
        text syllabus_lesson_id PK_FK
        text material_id PK_FK
        integer position
        integer created_at
    }
    MATERIAL {
        text id PK
        text org_id FK
        text folder_id FK
        text title
        text kind "file link media"
        text url
        text object_key
        text mime_type
        integer size_bytes
        text original_name
        text created_by
    }
    CLASS {
        text id PK
        text org_id FK
        text syllabus_id FK "cột suy ra - mirror của syllabus.class_id"
        text scheduling_mode "auto manual hoặc NULL phòng thủ"
        integer sessions_total
        integer sessions_done
        text status
    }
    LESSON_TAUGHT {
        text id PK
        text org_id FK
        text class_id FK
        text enrollment_id FK
        text date "định danh occurrence"
        text status
    }
    CLASS_SESSION {
        text id PK
        text org_id FK
        text class_id FK
        text date "unique theo cặp class date"
    }
    ENROLLMENT {
        text id PK
        text org_id FK
        text class_id FK
        text student_id FK
        text status "invited active"
    }
    SESSION_PACKAGE {
        text id PK
        text org_id FK
        text enrollment_id FK "unique"
        integer total
        text status
    }
```

## Entity Reference

| Entity | Bảng | Vai trong feature | Nguồn (path:line) | Nhãn |
|--------|------|-------------------|-------------------|------|
| SYLLABUS | `syllabus` | Template (class_id NULL) hoặc bản copy của lớp | packages/db/src/schema/syllabus.ts:12-51 | ✅ |
| SYLLABUS_MODULE | `syllabus_module` | Phân đoạn nội dung, sắp theo position | packages/db/src/schema/syllabus.ts:53-74 | ✅ |
| SYLLABUS_LESSON | `syllabus_lesson` | Slot bài học (khác buổi dạy — invariant 5); kind nội dung / status tiến độ | packages/db/src/schema/syllabus.ts:76-109 | ✅ |
| SYLLABUS_LESSON_MATERIAL | `syllabus_lesson_material` | Liên kết bài ↔ tài liệu ngân hàng; PK kép | packages/db/src/schema/material.ts:139-164 | ✅ |
| MATERIAL | `material` | Tài liệu org dùng chung (feature materials sở hữu) | packages/db/src/schema/material.ts:39-77 | ✅ |
| CLASS | `class` | Lớp nhận copy; syllabus_id là cột suy ra | packages/db/src/schema/class.ts:23-30 | ✅ |
| LESSON_TAUGHT | `lesson` | Buổi dạy thực tế (feature classes/enrollment) | packages/db/src/schema/lesson.ts:29-78 | ✅ |
| CLASS_SESSION | `class_session` | Buổi thủ công; chặn import khi tồn tại | packages/db/src/schema/class-session.ts:19-41 | ✅ |
| ENROLLMENT | `enrollment` | Ghi danh; backfill khi active kẹt | packages/db/src/schema/enrollment.ts:17-41 | ✅ |
| SESSION_PACKAGE | `session_package` | Gói buổi; đồng bộ total khi import/gỡ | packages/db/src/schema/session-package.ts:21-50 | ✅ |

## Quan hệ

| Quan hệ | Loại | Bằng chứng | Nhãn |
|---------|------|------------|------|
| organization 1—N syllabus | FK cascade | packages/db/src/schema/syllabus.ts:16-18 | ✅ |
| syllabus 1—N syllabus_module | FK cascade | packages/db/src/schema/syllabus.ts:60-62 | ✅ |
| syllabus_module 1—N syllabus_lesson | FK cascade | packages/db/src/schema/syllabus.ts:87-89 | ✅ |
| syllabus_lesson 1—N syllabus_lesson_material | FK cascade | packages/db/src/schema/material.ts:145-147 | ✅ |
| material 1—N syllabus_lesson_material | FK **NO ACTION** (tài liệu đang gắn không xóa được) | packages/db/src/schema/material.ts:148-150 | ✅ |
| class 1—0..1 syllabus (copy) | syllabus.class_id unique partial; class.syllabus_id là mirror NO ACTION | packages/db/src/schema/syllabus.ts:46-49; packages/db/src/migrations/0001_opposite_loki.sql:17 | ✅ |
| syllabus — syllabus (provenance) | source_template_id logical FK, ON DELETE set null | packages/db/src/schema/syllabus.ts:36-43 | ✅ |
| class — lesson/class_session/enrollment | phía feature classes | packages/db/src/schema/lesson.ts:36-46; packages/db/src/schema/class-session.ts:26-41 | ✅ |
| enrollment — session_package | unique enrollment_id | packages/db/src/schema/session-package.ts:31-45 | ✅ |
| syllabus_lesson ↛ lesson (không FK) | mapping buổi N ↔ bài N tính runtime | apps/server/src/lib/session-curriculum-materials.ts:21-31 | ✅ |
