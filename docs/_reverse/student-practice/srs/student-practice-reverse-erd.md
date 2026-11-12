---
feature: student-practice
type: reverse-srs-erd
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/student-practice-reverse-erd — student-practice

Kiểu cột khớp schema thật (packages/db/src/schema/vocab.ts, packages/db/src/schema/vocab-library.ts).
FK ghi ở đây là FK schema-level; quan hệ APP-LEVEL (không FK) ghi chú riêng dưới biểu đồ.

```mermaid
erDiagram
    vocab_deck {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text class_id "NULL = bo doc lap trong org; FK -> class.id, cascade"
        text title "NOT NULL"
        text lang "NOT NULL default en"
        text source_library_deck_id "NULL; con tro provenance, KHONG FK (chu dong)"
        integer created_at "NOT NULL timestamp_ms — moc neo dueAt the org"
        integer updated_at "NOT NULL"
    }
    vocab_word {
        text id PK
        text deck_id FK "NOT NULL -> vocab_deck.id, cascade"
        text word "NOT NULL"
        text ipa "NULL"
        text translation "NOT NULL default rong"
        text audio_key "NULL; server sinh, file tren kho media"
        text audio_url "NULL; chi ghi boi clone tu thu vien"
        integer sort_order "NOT NULL default 0"
        integer created_at "NOT NULL"
        integer updated_at "NOT NULL"
    }
    vocab_card {
        text id PK
        text student_id FK "NOT NULL -> student.id, cascade"
        text word_id "NOT NULL, da hinh: vocab_word.id hoac vocab_library_word.id (libword-)"
        integer level "NOT NULL default 1, bat bien 1-5"
        integer is_warning "NOT NULL boolean default false, chi true o level 5"
        text state "NOT NULL default new: new | review"
        integer interval_days "NOT NULL default 0, chi hien thi"
        integer due_at "NOT NULL epoch ms UTC — bo lich chi doc cot nay"
        integer lapses "NOT NULL default 0"
        integer created_at "NOT NULL"
        integer updated_at "NOT NULL"
    }
    vocab_review_log {
        text id PK "chinh la clientLogId UUID do client sinh — idempotency"
        text student_id FK "NOT NULL -> student.id, cascade"
        text card_id "NOT NULL, khong FK"
        text deck_id "NOT NULL, khong FK"
        text session_kind "NOT NULL: review | learn"
        text grade "NOT NULL: good | again"
        integer duration_ms "NOT NULL, da clamp <= 3.600.000"
        integer reviewed_at "NOT NULL — nen ngay VN cho streak"
        text word "NOT NULL — snapshot"
        text translation "NOT NULL default rong — snapshot"
    }
    vocab_suggestion {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text teacher_id FK "NOT NULL -> user.id, cascade"
        text student_id FK "NOT NULL -> student.id, cascade"
        text deck_id FK "NOT NULL -> vocab_deck.id, cascade"
        text note "NULL"
        text status "NOT NULL default pending: pending | accepted | dismissed"
        integer created_at "NOT NULL"
        integer responded_at "NULL"
    }
    vocab_library_course {
        text id PK "deterministic libcourse-<csvId>"
        text name "NOT NULL"
        text description "NULL (migration 0040)"
        text target "NULL"
        integer sort_order "NOT NULL default 0"
        integer created_at "NOT NULL"
        integer updated_at "NOT NULL"
    }
    vocab_library_deck {
        text id PK "deterministic libdeck-<csvId>"
        text course_id FK "NOT NULL -> vocab_library_course.id, cascade"
        text title "NOT NULL"
        text description "NULL"
        text image_url "NULL"
        integer sort_order "NOT NULL default 0"
        integer created_at "NOT NULL"
        integer updated_at "NOT NULL"
    }
    vocab_library_word {
        text id PK "deterministic libword-<csvId>"
        text deck_id FK "NOT NULL -> vocab_library_deck.id, cascade"
        text word "NOT NULL"
        text ipa "NULL"
        text pos "NULL"
        text translation "NOT NULL default rong"
        text sentence_vi "NULL"
        text sentence_en "NULL"
        text picture_url "NULL"
        text audio_url "NULL — nguon proxy am thanh hoc vien"
        integer sort_order "NOT NULL default 0"
        integer created_at "NOT NULL"
        integer updated_at "NOT NULL"
    }
    vocab_deck ||--o{ vocab_word : "deck_id"
    vocab_deck ||--o{ vocab_suggestion : "deck_id"
    vocab_deck ||--o{ vocab_card : "app-level: word_id thuoc tu cua deck (khong FK)"
    student {
        text id PK
        text name
    }
    student ||--o{ vocab_card : "student_id"
    student ||--o{ vocab_review_log : "student_id"
    student ||--o{ vocab_suggestion : "student_id, unique (student_id, deck_id)"
    vocab_card ||--o{ vocab_review_log : "app-level: card_id + clientLogId idempotent (khong FK)"
    vocab_library_course ||--o{ vocab_library_deck : "course_id"
    vocab_library_deck ||--o{ vocab_library_word : "deck_id"
    vocab_library_word ||--o{ vocab_card : "app-level: card.word_id = libword-* (khong FK, da hinh)"
}
```

Chỉ mục và ràng buộc unique (schema thật):

- `vocab_card_student_word_uq (student_id, word_id)` — nền lazy provisioning INSERT OR
  IGNORE; kèm `vocab_card_student_due_idx (student_id, due_at)`, `vocab_card_word_idx` —
  packages/db/src/schema/vocab.ts:113-124. ✅
- `vocab_suggestion_student_deck_uq (student_id, deck_id)` — 1 gợi ý duy nhất per cặp;
  `vocab_suggestion_student_status_idx` — packages/db/src/schema/vocab.ts:193-203. ✅
- `vocab_review_log_student_reviewed_idx (student_id, reviewed_at)` — phục vụ streak theo
  ngày VN — packages/db/src/schema/vocab.ts:149-157. ✅
- Thư viện chỉ có index thường (course/deck), không unique ngoài PK —
  packages/db/src/schema/vocab-library.ts:48, packages/db/src/schema/vocab-library.ts:82. ✅

Ghi chú quan hệ app-level:

- `vocab_card.word_id` đa hình: không FK — migration 0039 recreate bảng, hỗ trợ cả
  `vocab_word.id` lẫn `libword-*` — packages/db/src/migrations/0039_ambiguous_prowler.sql:1-2. ✅
- `vocab_review_log` không FK tới card/deck + snapshot `word`/`translation`: lịch sử,
  streak, retention sống sót khi giáo viên xoá deck — packages/db/src/schema/vocab.ts:126-135
  (comment schema); e2e "xóa deck giữ streak" — apps/e2e/specs/vocab-srs.spec.ts:488-665. ✅
- `vocab_deck.source_library_deck_id` không FK chủ ý (bộ từ của giáo viên sống sót khi
  thư viện seed/prune lại) — packages/db/src/schema/vocab.ts:36-49. ✅
- Xoá deck: xoá tường minh deck + word + card + suggestion trong 1 batch, giữ review_log —
  packages/db/src/schema/vocab.ts:15-21 (comment schema). ✅

Phân hệ B (luyện đề) KHÔNG có bảng riêng — tái sử dụng bảng dùng chung của domain quiz/assignment:
`assignment_test` (đề, status ready = điều kiện lộ đề), `assignment_prompt` + `assignment_test_part`
(các phần ghép đề theo position), và `quiz_attempt` với discriminator `mode`:

- `quiz_attempt.mode`: "assignment" (mặc định) | "practice"; practice ⇒ `assignment_id` NULL,
  `test_id` NOT NULL (CHECK DB + route bảo vệ); unique (assignmentId, studentId) không chặn
  practice làm lại vì SQLite coi NULL khác nhau — packages/db/src/schema/quiz-attempt.ts:28-66. ✅
- `assignment_test.status` = "ready" là điều kiện bắt buộc mọi truy vấn của phân hệ —
  apps/server/src/routes/student-practice.ts:44-90, apps/server/src/routes/student-practice.ts:251-259. ✅
- Xoá đề: attempt giữ nguyên điểm đã nộp (test_id SET NULL), review đọc tiêu đề từ
  snapshot — packages/db/src/schema/quiz-attempt.ts:28-43 (comment schema). ✅

Migrations: 0036 (4 bảng lõi) packages/db/src/migrations/0036_bored_infant_terrible.sql:1-66;
0037 (thư viện + audio_url + source_library_deck_id) packages/db/src/migrations/0037_cheerful_gambit.sql:1-48;
0038 (vocab_suggestion + class_id nullable) packages/db/src/migrations/0038_wise_blizzard.sql:1-45;
0039 (recreate vocab_card) packages/db/src/migrations/0039_ambiguous_prowler.sql:1-28;
0040 (ALTER description) packages/db/src/migrations/0040_deep_oracle.sql:1-1. ✅
Test migration: packages/db/src/schema/vocab.test.ts:1-491. ✅
