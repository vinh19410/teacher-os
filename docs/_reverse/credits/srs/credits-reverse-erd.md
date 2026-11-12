# ERD — feature credits

> Kiểu cột khớp schema thật (text/integer, timestamp_ms là integer ms). `credit_wallet` và `credit_usage_log` KHÔNG có FK DB-level: `org_id` chỉ là text tham chiếu nghiệp vụ tới `organization.id` (FK app-level). `ai_grading_draft` CÓ FK thật tới `organization.id` và `quiz_attempt.id` (onDelete cascade).

```mermaid
erDiagram
    ORGANIZATION ||--o| CREDIT_WALLET : "co 1 vi (FK app-level qua org_id)"
    ORGANIZATION ||--o{ CREDIT_USAGE_LOG : "ghi so cai (FK app-level qua org_id)"
    CREDIT_WALLET ||--o{ CREDIT_USAGE_LOG : "bien doi deu ghi log cung org"
    ORGANIZATION ||--o{ EXAM_IMPORT_JOB : "tao job tieu 5 Credit"
    EXAM_IMPORT_JOB ||--o{ CREDIT_USAGE_LOG : "ref_id = job id, action_type exam_import"
    ORGANIZATION ||--o{ AI_GRADING_DRAFT : "FK that organization.id cascade"
    QUIZ_ATTEMPT ||--|| AI_GRADING_DRAFT : "FK that quiz_attempt.id cascade, 1-1"
    AI_GRADING_DRAFT ||--o{ CREDIT_USAGE_LOG : "ref_id = attemptId, action_type ai_grading, moi luot 1 bo khoa"

    CREDIT_WALLET {
        text org_id PK "1 org 1 vi"
        integer balance "default 0 - da chot tru"
        integer held "default 0 - dang tam giu"
        text plan_kind "default none - none|trial|monthly"
        text plan_status "nullable - active|grace_period|expired"
        integer created_at "timestamp_ms notNull"
        integer updated_at "timestamp_ms notNull, on_update now"
    }
    CREDIT_USAGE_LOG {
        text id PK "uuid"
        text org_id "notNull, FK app-level"
        text actor_user_id "notNull - user hoac system"
        text action_type "notNull - exam_import|ai_grading|quick_grade_writing"
        integer credit_delta "notNull - reserved/settle am, released duong, quick 0"
        text tx_status "notNull - reserved|settled|released|reverted"
        text ref_id "notNull - jobId hoac attemptId"
        text idempotency_key "notNull - UNIQUE index"
        integer created_at "timestamp_ms notNull"
    }
    EXAM_IMPORT_JOB {
        text id PK
        text org_id "notNull"
        text created_by "notNull - user id"
        text file_key "notNull - R2 key org-scoped"
        text file_name "notNull"
        text mime_type "notNull"
        integer size_bytes "notNull"
        integer page_count "nullable - dien sau extract"
        text content_fingerprint "notNull - SHA-256 hex 64"
        integer held_credits "notNull default 5"
        text import_status "notNull default processing - processing|completed|failed_refunded"
        text draft_json "nullable - JSON draft"
        text error_code "nullable"
        text error_reason "nullable - timeout|ai_error|empty_result"
        text published_test_id "nullable"
        integer started_at "timestamp_ms notNull"
        integer completed_at "nullable timestamp_ms"
        integer created_at "timestamp_ms notNull"
        integer updated_at "timestamp_ms notNull"
    }
    AI_GRADING_DRAFT {
        text attempt_id PK "FK quiz_attempt.id cascade"
        text org_id "notNull - FK organization.id cascade"
        text skill "notNull - writing|speaking"
        text status "notNull default ai_processing - 5 trang thai"
        text ai_scores "json nullable"
        text ai_feedback "notNull default rong"
        text reviewed_scores "json nullable"
        text reviewed_feedback "notNull default rong"
        text grading_mode "notNull default standard - standard|quick"
        integer credit_cost "notNull default 0 - 1 Writing / 2 Speaking"
        text transcript "notNull default rong"
        text error_code "nullable - ma loi pipeline"
        integer version "notNull default 1"
        integer retry_count "notNull default 0 - quyet khoa r(n)"
        integer started_at "timestamp_ms notNull"
        integer drafted_at "nullable timestamp_ms"
        integer published_at "nullable timestamp_ms"
    }
    ORGANIZATION {
        text id PK
    }
    QUIZ_ATTEMPT {
        text id PK
    }
```

Ghi chú:
- Cột `ai_grading_draft` liệt kê theo packages/db/src/schema/ai-grading-draft.ts:24-78; `exam_import_job` theo packages/db/src/schema/exam-import-job.ts:14-60; hai bảng credit theo packages/db/src/schema/credit-wallet.ts:17-71; SQL thật: packages/db/src/migrations/0051_tan_slayback.sql:1-21, 0055_premium_blazing_skull.sql:1.
- Index sổ cái: UNIQUE(idempotency_key) và (org_id, created_at) — packages/db/src/schema/credit-wallet.ts:65-70.
