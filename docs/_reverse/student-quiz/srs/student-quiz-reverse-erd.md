---
type: reverse-srs-erd
feature: student-quiz
status: draft
updated: 2026-11-12
---

# student-quiz — ERD tái lập (reverse)

> Khớp schema thật. ORGANIZATION/CLASS/STUDENT chỉ liệt kê cột nhận dạng; năm bảng nghiệp vụ liệt kê ĐỦ cột theo schema. R2 bucket là kho ngoài lược đồ (object key lưu trong `quiz_attempt.media_key`).

```mermaid
erDiagram
    ORGANIZATION ||--o{ CLASS_ASSIGNMENT : "giao bai cho lop thuoc org"
    CLASS ||--o{ CLASS_ASSIGNMENT : "nhan bai giao"
    CLASS_ASSIGNMENT ||--o{ CLASS_ASSIGNMENT_TARGET : "mot dich moi hoc vien"
    STUDENT ||--o{ CLASS_ASSIGNMENT_TARGET : "duoc chi dinh lam bai"
    ASSIGNMENT_PROMPT ||--o{ CLASS_ASSIGNMENT : "de nguon cua bai giao"
    CLASS_ASSIGNMENT ||--o{ QUIZ_ATTEMPT : "moi hoc vien mot attempt"
    STUDENT ||--o{ QUIZ_ATTEMPT : "lam bai"
    QUIZ_ATTEMPT ||--o{ QUIZ_ATTEMPT_ANNOTATION : "duoc giao vien highlight"
    ORGANIZATION ||--o{ QUIZ_ATTEMPT : "cach ly theo org"
    ORGANIZATION ||--o{ ASSIGNMENT_PROMPT : "so huu de"
    ORGANIZATION ||--o{ QUIZ_ATTEMPT_ANNOTATION : "cach ly theo org"
    ORGANIZATION {
        text id PK
    }
    CLASS {
        text id PK
    }
    STUDENT {
        text id PK
    }
    CLASS_ASSIGNMENT {
        text id PK
        text org_id FK
        text class_id FK
        text prompt_id FK
        text title "snapshot tieu de luc giao"
        text due "ISO yyyy-mm-dd bat buoc"
        integer due_at "ISO gio han - nullable - 0059"
        integer available_at "gio mo bai - nullable - 0060"
        text note "ghi chu giao vien"
        text class_study_pack_id "study pack - nullable - 0060"
        integer created_at "thoi diem tao"
    }
    CLASS_ASSIGNMENT_TARGET {
        text id PK
        text org_id FK
        text assignment_id FK
        text student_id FK
        text submitted_at "ISO string do submit dong dau - nullable"
    }
    ASSIGNMENT_PROMPT {
        text id PK
        text org_id FK
        text task "legacy task1 hoac task2"
        text genre "legacy the loai"
        text skill "canonical - mac dinh writing"
        text part "canonical phan IELTS"
        text type "canonical dang de"
        text title "tieu de de"
        text band "dang diem hien thi - mac dinh 7.0"
        text source "nguon de"
        text prompt "de bai"
        text intro "huong dan chung"
        text passage "doc hieu"
        text transcript "doc listening - khong bao gio xuong wire hoc vien"
        text cue_topic "de noi - cue card"
        text cue_points "cac y goi y"
        text audio_name "ten file listening"
        text image_url "anh de - mac dinh rong"
        text questions "JSON mang cau hoi"
        text option_bank "JSON mang - cap 8 - ASSIGNMENT_OPTION_BANK_MAX"
        text note "huong dan them - chi lo speaking o take"
        text status "draft hoac ready"
        text writing_part "phan Writing di kem - 574 - nullable"
        text writing_type "dang Writing di kem - nullable"
        text writing_prompt "de Writing di kem"
        text library_ref "tham chieu thu vien - unique theo org - nullable"
        integer created_at "thoi diem tao"
    }
    QUIZ_ATTEMPT {
        text id PK
        text org_id FK
        text assignment_id "FK - nullable cho practice"
        text test_id "FK de tu luyen - nullable cho assignment"
        text student_id FK
        text mode "assignment hoac practice - mac dinh assignment"
        text status "in_progress hoac submitted - mac dinh in_progress"
        text questions_snapshot "JSON de dong bang luc start"
        text answers "JSON key la index chuoi - json_set tung key"
        text essay "bai Writing rieng - cap 10000"
        text media_key "object key R2 - khong xuong wire - nullable"
        text media_name "ten file hien thi"
        text media_type "MIME da ghi nhan"
        integer media_size "so byte"
        integer media_uploaded_at "thoi diem tai"
        integer correct_count "chi ghi luc nop - null khi chua nop"
        text grade_scores "JSON diem giao vien - json"
        text grade_feedback "nhan xet giao vien"
        integer graded_at "thoi diem cham"
        integer started_at "luc bat dau"
        integer submitted_at "timestamp ms luc nop"
    }
    QUIZ_ATTEMPT_ANNOTATION {
        text id PK
        text org_id FK
        text attempt_id FK
        integer start_offset "offset UTF-16 tren essay raw"
        integer end_offset "offset UTF-16 tren essay raw"
        text note "noi dung ghi chu"
        integer created_at "thoi diem tao"
        integer updated_at "thoi diem cap nhat"
    }
```

**Ghi chú quan hệ:**

- Unique chống làm lại của cả feature: `quiz_attempt(assignment_id, student_id)` — attempt practice thoát unique nhờ `assignment_id` NULL (ngữ nghĩa NULL của SQLite unique). — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:86-91,33-40`.
- CHECK dữ liệu: `mode='assignment' ⇒ assignment_id NOT NULL`; không có CHECK đảo vì FK `test_id` ON DELETE SET NULL (xoá đề tự luyện → attempt giữ nguyên điểm, chỉ mất tiêu đề); riêng `assignment_id` là ON DELETE CASCADE — xoá lượt giao xoá sạch attempt (annotation cascade theo). — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:44-48,103-107`.
- `media_key` không có khóa ngoại — trỏ object ngoài D1 (R2); toàn bộ 5 cột `media_*` được ghi/clear cùng lúc trong một UPDATE. — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:26-29,66-70`, [S1] `apps/server/src/routes/student.ts:1745-1804,1841-1874`.
- `questions_snapshot` và `answers` là JSON dạng TEXT: snapshot đọc từ `assignment_prompt.questions` lúc start và KHÔNG bao giờ cập nhật lại; `answers` chỉ đổi qua `json_set` từng key. — ✅ [S1] `apps/server/src/routes/student.ts:1526-1538,1606-1612`.
- `submitted_at` hai nơi hai đơn vị: attempt dùng timestamp int ms (Drizzle), target dùng TEXT ISO string — client tổng quan ưu tiên attempt. — ✅ [S2] `packages/db/src/schema/quiz-attempt.ts:83`, [S3] `packages/db/src/schema/class-assignment.ts:68`, [S1] `apps/server/src/routes/student.ts:2005`.
- `ai_grading_draft` (boundary, attempt_id 1-1) và `assignment_test`/`assignment_test_part` (nguồn đề practice) không vẽ để giữ ERD tập trung; tham chiếu [S30] `packages/db/src/migrations/0054_productive_spencer_smythe.sql`, [S5] `packages/db/src/schema/assignment-test.ts`. — ✅
