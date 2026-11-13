---
feature: student-history
type: reverse-erd
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: "develop d6c0f6b5"
---

# ERD dữ liệu nguồn — student-history

Phase 11 **không có entity riêng** cho lịch sử: biểu đồ dưới là các bảng nguồn mà route đọc tại chỗ (apps/server/src/routes/student-history.ts:230-355). Chỉ liệt kê cột có thật trong schema.

```mermaid
erDiagram
    student ||--o{ quiz_attempt : "co nhieu luot lam bai"
    student ||--o{ vocab_review_log : "co nhieu nhat ky on tu"
    class_assignment |o--o{ quiz_attempt : "bai giao duoc nop (assignment_id)"
    assignment_test |o--o{ quiz_attempt : "de tu luyen (test_id)"
    class_assignment }o--|| assignment_prompt : "gan mot prompt"
    assignment_test ||--o{ assignment_test_part : "gom cac slot"
    assignment_prompt ||--o{ assignment_test_part : "duoc dung trong slot"

    student {
        text id PK
        text org_id FK
        text name
        text email "dinh dang dang nhap portal"
        text exam_interest "nullable"
    }
    quiz_attempt {
        text id PK
        text org_id FK
        text student_id FK "onDelete cascade"
        text assignment_id FK "nullable, onDelete cascade"
        text test_id FK "nullable, onDelete set null"
        text mode "assignment (mac dinh) | practice"
        text status "in_progress | submitted"
        text questions_snapshot
        text answers
        text essay
        integer correct_count "nullable"
        text grade_scores "json, null = chua cham"
        text grade_feedback
        integer graded_at "nullable"
        integer started_at
        integer submitted_at "nullable"
    }
    class_assignment {
        text id PK
        text org_id FK
        text class_id FK "not null, onDelete cascade"
        text prompt_id FK "not null, onDelete cascade"
        text title
        text due "ISO yyyy-mm-dd"
        integer due_at "nullable"
        integer available_at "nullable, loc tai luc doc"
        text class_study_pack_id "nullable"
    }
    assignment_test {
        text id PK
        text org_id FK
        text title
        text skill "reading | listening | writing | speaking"
        integer time_limit_seconds "nullable"
        text status "draft | ready"
    }
    assignment_test_part {
        text id PK
        text test_id FK
        text prompt_id FK "onDelete restrict"
        text part "preset task1, task2, part1..."
        integer position
        integer q_start_override "nullable"
    }
    assignment_prompt {
        text id PK
        text org_id FK
        text task "task1 | task2"
        text skill "mac dinh writing"
        text part
        text title
        text writing_part "co #574"
        text prompt
        text passage
        text transcript
    }
    vocab_review_log {
        text id PK "clientLogId - idempotency"
        text student_id FK "onDelete cascade"
        text card_id
        text deck_id
        text session_kind "review | learn"
        text grade "good | again"
        integer duration_ms
        integer reviewed_at
        text word "snapshot"
        text translation "snapshot"
    }
```

## Ghi chú quan hệ và ràng buộc

- ✅ `quiz_attempt` có unique (assignment_id, student_id) — một học viên một lượt nộp mỗi bài giao — packages/db/src/schema/quiz-attempt.ts:86-89.
- ✅ CHECK DB: mode `assignment` buộc phải có `assignment_id`; KHÔNG có CHECK đảo cho practice vì FK `test_id` ON DELETE SET NULL sẽ bị CHECK chặn — packages/db/src/schema/quiz-attempt.ts:98-106.
- ✅ Index phục vụ lịch sử: (org_id, student_id, mode, submitted_at), chú thích "History phase 11" — packages/db/src/schema/quiz-attempt.ts:91-97.
- ✅ `vocab_review_log` cố ý không có FK tới thẻ/deck; snapshot `word` + `translation` để lịch sử sống sót khi giáo viên xoá deck — packages/db/src/schema/vocab.ts:126-132.
- ✅ `assignment_test_part` không có org_id — scoping đi qua testId; unique (test_id, part) — packages/db/src/schema/assignment-test.ts:53-78.
- ✅ `class_assignment.available_at` nullable = không giới hạn thời điểm khả dụng; route lịch sử lọc theo thời điểm đọc — packages/db/src/schema/class-assignment.ts:38, apps/server/src/routes/student-history.ts:312 (🟡 OQ-05).
- 🔵 Cột `writing_part` ở prompt là căn cứ `hasWriting` khi lọc/không lọc Writing — packages/db/src/schema/assignment-prompt.ts và apps/server/src/routes/student-history.ts:308-311, 531-538.
