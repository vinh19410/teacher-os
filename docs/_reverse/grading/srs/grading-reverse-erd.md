---
type: reverse-erd
feature: grading
status: draft
updated: 2026-11-12
---

# ERD — grading (kiểu cột khớp schema Drizzle/D1 thật)

FK là RÀNG BUỘC DB THẬT (Drizzle `.references` + onDelete) — không phải chỉ app-level: quiz_attempt (assignment cascade, student cascade, test set null, org cascade), ai_grading_draft (attempt cascade, org cascade), quiz_attempt_annotation (attempt cascade, org cascade), comment_bank (org cascade), credit_wallet/log (org không khai references trực tiếp trong tệp — gắn theo org_id nghiệp vụ).

```mermaid
erDiagram
    ORGANIZATION ||--o{ QUIZ_ATTEMPT : "sở hữu"
    CLASS_ASSIGNMENT ||--o{ QUIZ_ATTEMPT : "được nộp"
    STUDENT ||--o{ QUIZ_ATTEMPT : "làm bài"
    ASSIGNMENT_TEST ||--o{ QUIZ_ATTEMPT : "đề luyện tập"
    QUIZ_ATTEMPT ||--o| AI_GRADING_DRAFT : "có nháp AI"
    QUIZ_ATTEMPT ||--o{ QUIZ_ATTEMPT_ANNOTATION : "có highlight"
    ORGANIZATION ||--o| CREDIT_WALLET : "một ví"
    ORGANIZATION ||--o{ CREDIT_USAGE_LOG : "sổ cái credit"
    ORGANIZATION ||--o{ COMMENT_BANK : "ngân hàng nhận xét"
    ORGANIZATION {
        text id PK
    }
    CLASS_ASSIGNMENT {
        text id PK
    }
    STUDENT {
        text id PK
    }
    ASSIGNMENT_TEST {
        text id PK
    }
    QUIZ_ATTEMPT {
        text id PK
        text org_id FK
        text assignment_id FK "cascade khi xoá giao bài"
        text student_id FK "cascade"
        text test_id FK "set null khi xoá đề"
        text mode "assignment hoac practice"
        text status "in_progress hoac submitted"
        text questions_snapshot ""
        text answers ""
        text essay "bai viet hoc vien"
        text media_key "speaking"
        text media_name ""
        text media_type ""
        integer media_size ""
        integer media_uploaded_at ""
        integer correct_count "trac nghiem tu dong"
        json grade_scores "null khi chua cham"
        text grade_feedback ""
        integer graded_at "null khi chua cham"
        integer started_at ""
        integer submitted_at ""
    }
    AI_GRADING_DRAFT {
        text attempt_id PK "FK quiz_attempt cascade"
        text org_id FK
        text skill "writing hoac speaking"
        text status "mac dinh ai_processing"
        json ai_scores ""
        text ai_feedback ""
        json reviewed_scores ""
        text reviewed_feedback ""
        text grading_mode "standard hoac quick"
        integer credit_cost "1 writing 2 speaking"
        text transcript "de trong cho den khi co STT"
        text error_code "null la khong loi"
        integer version "mac dinh 1"
        integer retry_count "mac dinh 0"
        integer started_at ""
        integer drafted_at ""
        integer published_at ""
    }
    QUIZ_ATTEMPT_ANNOTATION {
        text id PK
        text org_id FK
        text attempt_id FK "cascade"
        integer start_offset "utf-16 code unit"
        integer end_offset "utf-16 code unit"
        text note "toi da 1000 ky tu"
        integer created_at ""
        integer updated_at ""
    }
    CREDIT_WALLET {
        text org_id PK
        integer balance "credit da chot tru"
        integer held "dang tam giu"
        text plan_kind "none trial monthly"
        text plan_status "active grace_period expired"
        integer created_at ""
        integer updated_at ""
    }
    CREDIT_USAGE_LOG {
        text id PK
        text org_id ""
        text actor_user_id ""
        text action_type "ai_grading hoac quick_grade_writing"
        integer credit_delta ""
        text tx_status "reserved settled released reverted"
        text ref_id "attempt id"
        text idempotency_key UK "khoa chong trung"
        integer created_at ""
    }
    COMMENT_BANK {
        text id PK
        text org_id FK
        text operation_id ""
        text tag "mac dinh chung"
        text text ""
        integer created_at ""
    }
```

Chỉ mục & ràng buộc nổi bật (nguồn):

- quiz_attempt: UNIQUE (assignment_id, student_id) "không retake" — packages/db/src/schema/quiz-attempt.ts:86-89; CHECK assignment ⇒ assignment_id — :103-108; index history — :92-97.
- ai_grading_draft: PK attempt_id — packages/db/src/schema/ai-grading-draft.ts:29-31; index (org_id, status) — :76.
- quiz_attempt_annotation: index attempt, org — packages/db/src/schema/quiz-attempt-annotation.ts:37-38.
- credit_usage_log: UNIQUE idempotency_key — packages/db/src/schema/credit-wallet.ts:66-68; index (org_id, created_at) — :69.
- comment_bank: UNIQUE (org_id, operation_id) — packages/db/src/schema/comment-bank.ts:27-30.

- Ghi chú tx_status: schema chỉ bình luận 3 giá trị reserved/settled/released (packages/db/src/schema/credit-wallet.ts:56-57) nhưng code chấm nhanh dùng thêm "reverted" (apps/server/src/lib/credits/wallet.ts:185, 197-203) — liệt kê đủ 4 theo code.
