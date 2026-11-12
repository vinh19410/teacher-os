# ERD — assignment-prompt-bank (reverse)

Repo: /root/projects/teacher-os @ develop d6c0f6b5. Tất cả quan hệ lấy từ FK khai báo trong `packages/db/src/schema/*.ts`. Bảng trung tâm `assignment_prompt`; các bảng còn lại thuộc feature kế bên nhưng khóa thiết kế của feature này.

```mermaid
erDiagram
    ORGANIZATION ||--o{ ASSIGNMENT_PROMPT : "so huu (org_id cascade)"
    ORGANIZATION ||--o{ CLASS : "so huu"
    ORGANIZATION ||--o{ STUDENT : "so huu"
    ORGANIZATION ||--o{ ASSIGNMENT_TEST : "so huu"
    ORGANIZATION ||--o{ STUDY_PACK : "so huu"
    ORGANIZATION ||--o{ CLASS_ASSIGNMENT : "so huu"
    CLASS ||--o{ CLASS_ASSIGNMENT : "lop nhan giao"
    ASSIGNMENT_PROMPT ||--o{ CLASS_ASSIGNMENT : "duoc giao (prompt_id cascade)"
    CLASS_ASSIGNMENT ||--o{ CLASS_ASSIGNMENT_TARGET : "giao cho hoc vien"
    STUDENT ||--o{ CLASS_ASSIGNMENT_TARGET : "nhan bai"
    CLASS_ASSIGNMENT ||--o{ QUIZ_ATTEMPT : "sinh bai lam (cascade)"
    STUDENT ||--o{ QUIZ_ATTEMPT : "hoc vien lam"
    ASSIGNMENT_TEST |o--o{ QUIZ_ATTEMPT : "test_id set null"
    ASSIGNMENT_TEST ||--o{ ASSIGNMENT_TEST_PART : "gom phan"
    ASSIGNMENT_PROMPT |o--o{ ASSIGNMENT_TEST_PART : "nguyen lieu (prompt_id RESTRICT)"
    STUDY_PACK ||--o{ STUDY_PACK_ITEM : "gom bai"
    ASSIGNMENT_PROMPT |o--o{ STUDY_PACK_ITEM : "source org_prompt"

    ORGANIZATION {
        text id PK
        text name "not null"
        integer created_at
    }
    ASSIGNMENT_PROMPT {
        text id PK
        text org_id FK
        text task "legacy derive - writing task1|task2 khac task2"
        text genre "legacy default rong"
        text skill "6 gia tri catalog"
        text part "1-20"
        text type "KIND mo rong 1-20"
        text title "1-200"
        text band "default 7.0"
        text source "default rong"
        text prompt "rich text 5000 - raw 12500"
        text intro
        text passage
        text transcript
        text cue_topic
        text cue_points "JSON array string"
        text audio_name
        text image_url "https - max 500"
        text questions "JSON max 40 cau"
        text option_bank "JSON max 8 muc"
        text note
        text status "draft | ready - default draft"
        text writing_part "null | part writing"
        text writing_type "null | type writing"
        text writing_prompt "null | rich text"
        text library_ref "null = de thu dang ngan hang giao vien"
        integer created_at "ms epoch - khong co updated_at"
    }
    CLASS {
        text id PK
        text org_id FK
        text name
        text level
        text type "default ielts"
        text status "default active"
    }
    STUDENT {
        text id PK
        text org_id FK
        text name
        text email "dang nhap portal"
    }
    CLASS_ASSIGNMENT {
        text id PK
        text org_id FK
        text class_id FK
        text prompt_id FK "cascade"
        text title "snapshot ten de luc giao"
        text due "ISO yyyy-mm-dd"
        text note
        integer due_at
        integer available_at
        text class_study_pack_id
        integer created_at
    }
    CLASS_ASSIGNMENT_TARGET {
        text id PK
        text org_id FK
        text assignment_id FK "unique (assignment_id, student_id)"
        text student_id FK
        text submitted_at "null = chua nop - ISO 8601 datetime"
    }
    QUIZ_ATTEMPT {
        text id PK
        text org_id FK
        text assignment_id FK "cascade"
        text student_id FK
        text test_id FK "set null"
        text mode "assignment | practice"
        text status "in_progress | submitted"
        text questions_snapshot "not null"
        text answers "JSON mac dinh object rong"
        text essay
        text media_key
        text media_name
        text media_type
        integer media_size
        integer media_uploaded_at
        integer correct_count
        text grade_scores "JSON criterion to band - null = chua cham"
    }
    ASSIGNMENT_TEST {
        text id PK
        text org_id FK
        text title
        text description
        text skill
        integer time_limit_seconds "null = khong gioi han"
        text collection
        text test_group
        text status "draft | ready"
        integer created_at
        integer updated_at
    }
    ASSIGNMENT_TEST_PART {
        text id PK
        text test_id FK
        text prompt_id FK "onDelete RESTRICT - de trong test khong xoa duoc"
        text part
    }
    STUDY_PACK {
        text id PK
        text org_id FK
        text title
        text description
        text status "draft | ready"
        text source_pack_id
        text created_by
        integer created_at
        integer updated_at
    }
    STUDY_PACK_ITEM {
        text id PK
        text pack_id FK
        integer day_index
        integer position
        text source_kind "org_prompt | library_test_part | library_exercise"
        text source_id
        text note
    }
```

## Entity Reference

| Entity | Bảng | Vai trong feature | Nguồn |
|--------|------|-------------------|-------|
| `ORGANIZATION` | `organization` | Chủ sở hữu — mọi truy vấn đề theo orgId từ kernelCtx | `packages/db/src/schema/organization.ts:5-9` |
| `ASSIGNMENT_PROMPT` | `assignment_prompt` | **Entity chính** — đề trong ngân hàng | `packages/db/src/schema/assignment-prompt.ts:18-59` |
| `CLASS` | `class` | Lớp nhận giao (touchpoint) | `packages/db/src/schema/class.ts:16-41` |
| `STUDENT` | `student` | Người nhận giao / làm bài (touchpoint) | `packages/db/src/schema/student.ts:15-24` |
| `CLASS_ASSIGNMENT` | `class_assignment` | Lượt giao — snapshot `title`, không tham chiếu ngược khi đề đổi tên | `packages/db/src/schema/class-assignment.ts:20-49` |
| `CLASS_ASSIGNMENT_TARGET` | `class_assignment_target` | Học viên nhận 1 lượt giao; unique (assignment_id, student_id); `submitted_at` null = chưa nộp | `packages/db/src/schema/class-assignment.ts:55-80` |
| `QUIZ_ATTEMPT` | `quiz_attempt` | Bài làm học viên — sự tồn tại 1 row cùng org = khóa nội dung | `packages/db/src/schema/quiz-attempt.ts:44-80` |
| `ASSIGNMENT_TEST` | `assignment_test` | Bộ đề (feature kế bên) | `packages/db/src/schema/assignment-test.ts:18-42` |
| `ASSIGNMENT_TEST_PART` | `assignment_test_part` | Phần bộ đề dùng prompt làm nguyên liệu; RESTRICT chặn xóa prompt | `packages/db/src/schema/assignment-test.ts:53-67` |
| `STUDY_PACK` | `study_pack` | Bộ đề tự học (touchpoint) | `packages/db/src/schema/study-pack.ts:49-79` |
| `STUDY_PACK_ITEM` | `study_pack_item` | Bài trong pack; `source_kind="org_prompt"` trỏ prompt → khóa Writing | `packages/db/src/schema/study-pack.ts:81-93` |

## Quan hệ (chi tiết cardinality + hành vi xóa)

| Từ | Đến | Cardinality | On delete | Ý nghĩa feature | Nguồn |
|----|-----|-------------|-----------|-----------------|-------|
| organization | assignment_prompt | 1 — N | cascade | Xóa org mất đề | `assignment-prompt.ts:22-24` |
| assignment_prompt | class_assignment | 1 — N | cascade | Đề bị giao nhiều lớp/lượt | `class-assignment.ts:33-36` |
| class_assignment | class_assignment_target | 1 — N | cascade | Mỗi học viên 1 row, unique cặp | `class-assignment.ts:54-80` |
| class_assignment | quiz_attempt | 1 — N | cascade | Attempt gắn lượt giao | `quiz-attempt.ts:48-51` |
| assignment_test | quiz_attempt | 0..1 — N | set null | Attempt luyện từ test | `quiz-attempt.ts:53-56` |
| assignment_prompt | assignment_test_part | 0..1 — N | **restrict** | Prompt nằm trong test thì không xóa được (nhưng feature chưa có đường xóa — Gap-1) | `assignment-test.ts:53-67` |
| assignment_prompt | study_pack_item | 0..1 — N | (không FK — source_id text) | Pack dùng prompt nguồn org_prompt → khóa Writing | `study-pack.ts:81-93` |
| assignment_prompt (library_ref) | study_pack_exercise | 0..1 — 1 | logic (không FK) | Đề vật hóa từ bài thư viện, unique (org_id, library_ref), ẩn khỏi ngân hàng | `assignment-prompt.ts:55,60-66`; `study-pack-clone.ts:740-752` |

Đọc ERD kèm: snapshot chỉ phục vụ ngân hàng giáo viên loại `demo-prompt:%` và `library_ref IS NOT NULL` — `apps/server/src/routes/snapshot.ts:338-347`.
