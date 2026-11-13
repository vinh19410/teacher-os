---
feature: vocab-hub
type: reverse-srs-erd
status: draft
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/vocab-hub-reverse-erd — vocab-hub

Mô hình dữ liệu đảo ngược (ERD) — draft

Cột liệt kê THEO schema thật @ d6c0f6b5 (packages/db/src/schema/vocab.ts,
vocab-library.ts). Dấu: PK khóa chính, FK khóa ngoại thật trong schema, UK
ràng buộc duy nhất; "polymorphic, no FK" = cột không có khóa ngoại ở mức DB.
Số mối quan hệ: `||` đúng-một, `|o` không hoặc một, `o{` không hoặc nhiều.

```mermaid
erDiagram
    ORGANIZATION ||--o{ VOCAB_DECK : "org_id FK"
    CLASS |o--o{ VOCAB_DECK : "class_id FK nullable cascade"
    VOCAB_DECK ||--o{ VOCAB_WORD : "deck_id FK cascade"
    VOCAB_DECK ||--o{ VOCAB_SUGGESTION : "deck_id FK cascade"
    VOCAB_DECK |o..o{ VOCAB_REVIEW_LOG : "deck_id no FK (log song sot)"
    ORGANIZATION ||--o{ VOCAB_SUGGESTION : "org_id FK"
    USER ||--o{ VOCAB_SUGGESTION : "teacher_id FK"
    STUDENT ||--o{ VOCAB_SUGGESTION : "student_id FK + UK voi deck"
    STUDENT ||--o{ VOCAB_CARD : "student_id FK cascade + UK voi word"
    VOCAB_WORD |o..o{ VOCAB_CARD : "word_id polymorphic no FK (word hoac libword)"
    STUDENT ||--o{ VOCAB_REVIEW_LOG : "student_id FK cascade"
    VOCAB_CARD |o..o{ VOCAB_REVIEW_LOG : "card_id no FK"
    VOCAB_LIBRARY_COURSE ||--|{ VOCAB_LIBRARY_DECK : "course_id FK cascade"
    VOCAB_LIBRARY_DECK ||--o{ VOCAB_LIBRARY_WORD : "deck_id FK cascade"
    VOCAB_LIBRARY_DECK |o..o{ VOCAB_DECK : "source_library_deck_id provenance no FK"
    ORGANIZATION ||--o{ CLASS : "org_id (tham chieu)"

    VOCAB_DECK {
        text id PK
        text org_id FK "not null, cascade"
        text class_id FK "nullable, cascade"
        text title "not null, 1-200"
        text lang "not null, default en"
        text source_library_deck_id "provenance, no FK"
        integer created_at "ms"
        integer updated_at "ms"
    }
    VOCAB_WORD {
        text id PK
        text deck_id FK "not null, cascade"
        text word "not null, 1-200"
        text ipa "nullable, max 200"
        text translation "not null, default rong, max 500"
        text audio_key "server-only vocab-org-word-uuid"
        text audio_url "clone-only tu thu vien"
        integer sort_order "not null, default 0"
        integer created_at "ms"
        integer updated_at "ms"
    }
    VOCAB_CARD {
        text id PK
        text student_id FK "not null, cascade, UK voi word_id"
        text word_id "polymorphic, no FK, UK voi student_id"
        integer level "not null, 1-5, default 1"
        integer is_warning "boolean, chi true khi level 5"
        text state "new | review, default new"
        integer interval_days "not null, default 0, chi hien thi"
        integer due_at "epoch ms, bo lich chi doc cot nay"
        integer lapses "not null, default 0"
        integer created_at "ms"
        integer updated_at "ms"
    }
    VOCAB_REVIEW_LOG {
        text id PK "chinh la clientLogId, idempotent"
        text student_id FK "not null, cascade"
        text card_id "no FK, co the mo coi"
        text deck_id "no FK, giu id deck da mat"
        text session_kind "learn | review"
        text grade "good | again"
        integer duration_ms "not null"
        integer reviewed_at "ms"
        text word "snapshot tai thoi diem ghi"
        text translation "snapshot tai thoi diem ghi"
    }
    VOCAB_SUGGESTION {
        text id PK
        text org_id FK "not null, cascade"
        text teacher_id FK "not null, cascade"
        text student_id FK "not null, cascade, UK voi deck_id"
        text deck_id FK "not null, cascade, UK voi student_id"
        text note "nullable, max 500"
        text status "pending | accepted | dismissed, default pending"
        integer created_at "ms"
        integer responded_at "nullable, giu lai khi revoke"
    }
    VOCAB_LIBRARY_COURSE {
        text id PK "libcourse-csvId deterministic"
        text name "not null"
        text description "nullable"
        text target "nullable"
        integer sort_order "not null, default 0"
        integer created_at "ms"
        integer updated_at "ms"
    }
    VOCAB_LIBRARY_DECK {
        text id PK "libdeck-csvId deterministic"
        text course_id FK "not null, cascade"
        text title "not null"
        text description "nullable, them o migration 0040"
        text image_url "nullable"
        integer sort_order "not null, default 0"
        integer created_at "ms"
        integer updated_at "ms"
    }
    VOCAB_LIBRARY_WORD {
        text id PK "libword-csvId deterministic"
        text deck_id FK "not null, cascade"
        text word "not null"
        text ipa "nullable"
        text pos "nullable, giu cho tuong lai"
        text translation "not null, default rong"
        text sentence_vi "nullable, giu cho tuong lai"
        text sentence_en "nullable, giu cho tuong lai"
        text picture_url "nullable, giu cho tuong lai"
        text audio_url "URL CDN, clone chep sang vocab_word"
        integer sort_order "not null, default 0"
        integer created_at "ms"
        integer updated_at "ms"
    }
    ORGANIZATION {
        text id PK
    }
    CLASS {
        text id PK
        text org_id FK "thuoc feature lop hoc"
    }
    STUDENT {
        text id PK
        text org_id FK "thuoc feature hoc vien"
    }
    USER {
        text id PK "nguoi dung web, vai tro giao vien"
    }
```

## Chỉ mục (từ schema thật)

- vocab_deck: `vocab_deck_org_idx(org_id)`, `vocab_deck_class_idx(class_id)`,
  `vocab_deck_source_library_idx(source_library_deck_id)`. ✅
  packages/db/src/schema/vocab.ts:46-50
- vocab_word: `vocab_word_deck_idx(deck_id)`. ✅ schema/vocab.ts:81
- vocab_card: `vocab_card_student_word_uq UNIQUE(student_id, word_id)`,
  `vocab_card_student_due_idx(student_id, due_at)`,
  `vocab_card_word_idx(word_id)`. ✅ schema/vocab.ts:119-123
- vocab_review_log: `vocab_review_log_student_reviewed_idx(student_id,
  reviewed_at)`. ✅ schema/vocab.ts:151-156
- vocab_suggestion: `vocab_suggestion_org_idx(org_id)`,
  `vocab_suggestion_student_status_idx(student_id, status)`,
  `vocab_suggestion_student_deck_uq UNIQUE(student_id, deck_id)`. ✅
  schema/vocab.ts:192-202
- vocab_library_deck: `vocab_library_deck_course_idx(course_id)`. ✅
  packages/db/src/schema/vocab-library.ts:48
- vocab_library_word: `vocab_library_word_deck_idx(deck_id)`. ✅
  packages/db/src/schema/vocab-library.ts:82

## Ghi chú thiết kế có bằng chứng

- FK vocab_deck.class_id nullable là KẾT QUẢ migration 0038 (recreate bảng,
  PRAGMA foreign_keys OFF → tạo bảng mới → ON) — ban đầu 0036 là NOT NULL. ✅
  packages/db/src/migrations/0036_bored_infant_terrible.sql,
  packages/db/src/migrations/0038_wise_blizzard.sql:26-40.
- vocab_card KHÔNG còn FK word_id: 0036 tạo với FK, 0039 recreate bỏ FK để
  wordId đa hình. ✅ packages/db/src/migrations/0039_ambiguous_prowler.sql:1-6.
- vocab_review_log không có FK card/deck và snapshot word+translation — chủ
  đích sống sót qua xoá deck. ✅ schema/vocab.ts:126-131.
- vocab_deck.source_library_deck_id cố tình KHÔNG FK để bộ từ giáo viên sống
  sót kể cả khi thư viện bị seed/prune lại. ✅ schema/vocab.ts:34-38.
- Xoá KHÔNG dựa cascade (PRAGMA theo kết nối) — server xoá tường minh 1 batch;
  test dựng PRAGMA OFF để chứng minh. ✅ schema/vocab.ts:18-20;
  vocab-teacher.ts:209-212; test :108-110.
- Ranh giới: bảng enrollment và các route học viên không thuộc ERD này (chỉ
  vẽ STUDENT tối thiểu). ✅ vocab-provision.ts:72-108.
- Ghi chú công cụ: mermaid-verify còn 1 cảnh báo nghĩa trên quan hệ
  USER→VOCAB_SUGGESTION ("không thấy cột teacher_id") — cột TỒN TẠI thật
  (schema/vocab.ts:173-175); bộ kiểm chỉ đối chiếu được một quan hệ FK mỗi
  entity đích, không phải lỗi sơ đồ.
