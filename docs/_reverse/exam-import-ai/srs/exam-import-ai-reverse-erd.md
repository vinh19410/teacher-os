# exam-import-ai — Reverse ERD

Phạm vi: entity của feature + đích xuất bản + 2 entity tham chiếu (organization, user — chỉ các cột dùng đến; phần còn lại ngoài scope). Mọi entity trong quan hệ đều có khối thuộc tính.

```mermaid
erDiagram
    ORGANIZATION ||--o{ EXAM_IMPORT_JOB : "to chuc yeu cau nhap de"
    USER ||--o{ EXAM_IMPORT_JOB : "nguoi tao (created_by)"
    ORGANIZATION ||--|| CREDIT_WALLET : "co mot vi"
    CREDIT_WALLET ||--o{ CREDIT_USAGE_LOG : "ghi so cai"
    EXAM_IMPORT_JOB ||--o{ CREDIT_USAGE_LOG : "ref_id la job id"
    EXAM_IMPORT_JOB |o--o| ASSIGNMENT_TEST : "published_test_id (0 hoac 1)"
    ASSIGNMENT_TEST ||--|{ ASSIGNMENT_TEST_PART : "gom cac part"
    ASSIGNMENT_TEST_PART }o--|| ASSIGNMENT_PROMPT : "tro prompt cua part"

    EXAM_IMPORT_JOB {
        text id PK
        text org_id FK
        text created_by FK
        text file_key "exam-imports/orgId/jobId"
        text file_name
        text mime_type "pdf hoac png jpeg"
        integer size_bytes
        integer page_count "null voi anh"
        text content_fingerprint "SHA-256 hex 64"
        integer held_credits "mac dinh 5"
        text import_status "processing completed failed_refunded"
        text draft_json "ExtractedExamDraft"
        text error_code
        text error_reason "timeout ai_error empty_result"
        text published_test_id FK
        integer started_at
        integer completed_at
        integer created_at
        integer updated_at
    }

    CREDIT_WALLET {
        text org_id PK
        integer balance "da tru settled"
        integer held "dang giu reserved"
        text plan_kind "none trial monthly"
        text plan_status "active grace_period expired"
        integer created_at
        integer updated_at
    }

    CREDIT_USAGE_LOG {
        text id PK
        text org_id FK
        text actor_user_id
        text action_type "exam_import hoac ai_grading"
        integer credit_delta "reserved -amount, settled -amount, released +amount"
        text tx_status "reserved settled released"
        text ref_id "job id"
        text idempotency_key UNIQUE
        integer created_at
    }

    ASSIGNMENT_TEST {
        text id PK "test-import-jobId khi tu publish"
        text org_id
        text title
        text skill
        integer time_limit_seconds
        text status "ready hoac draft"
        text description
        text collection
        text test_group
        integer created_at
        integer updated_at
    }

    ASSIGNMENT_TEST_PART {
        text id PK "test-part-import-jobId-part"
        text test_id FK
        text prompt_id FK
        text part "slot theo preset"
        integer position
        text q_start_override
    }

    ASSIGNMENT_PROMPT {
        text id PK "prompt-import-jobId-part"
        text org_id
        text skill
        text part
        text type
        text title
        text source "AI import: ten file"
        text passage
        text prompt "writing speaking"
        text questions "JSON cau hoi"
        text status "ready hoac draft"
        text cue_topic "speaking part2"
    }

    ORGANIZATION {
        text id PK
        text name
        integer created_at
    }

    USER {
        text id PK
        text name
        text email
        text role "teacher student"
    }
```

## Entity Reference

| Entity | Bảng | Owner | Vai trong feature | Site |
|--------|------|-------|-------------------|------|
| EXAM_IMPORT_JOB | `exam_import_job` | exam-import-ai | Lượt nhập đề: tệp, trạng thái, draft, lỗi, đích publish | `packages/db/src/schema/exam-import-job.ts:13-61` |
| CREDIT_WALLET | `credit_wallet` | exam-import-ai (lõi) → mở rộng TOS-32/42 | Ví theo org; available = balance − held | `packages/db/src/schema/credit-wallet.ts:14-38` |
| CREDIT_USAGE_LOG | `credit_usage_log` | exam-import-ai (lõi) → mở rộng TOS-30/33/42 | Sổ cái append-only; idempotency | `packages/db/src/schema/credit-wallet.ts:40-61` |
| ASSIGNMENT_TEST | `assignment_test` | feature bộ đề | Bộ đề đích xuất bản | `packages/db/src/schema/assignment-test.ts:18-48` |
| ASSIGNMENT_TEST_PART | `assignment_test_part` | feature bộ đề | Slot part nối test ↔ prompt (không có orgId — scope qua test) | `packages/db/src/schema/assignment-test.ts:53-75` |
| ASSIGNMENT_PROMPT | `assignment_prompt` | feature bộ đề | Ngân hàng đề org — prompt/part được tạo từ draft | `publish-to-bank.ts:410-463` |
| ORGANIZATION | `organization` | core | Org sở hữu job + ví | `packages/db/src/schema/organization.ts:4-10` |
| USER | `user` (schema auth) | core | Người tạo job (`created_by`) | `packages/db/src/schema/auth.ts:4-27` |
| EXAM_IMPORT_DRAFT (value object) | — (cột `draft_json`) | exam-import-ai | Cấu trúc đề nháp: title/skill/timeLimit/parts/questions/needsReview | `packages/api/src/contracts.ts:4338-4362` |

## Quan hệ

| Quan hệ | Cardinality | Khóa | Bằng chứng |
|---------|-------------|------|-----------|
| ORGANIZATION → EXAM_IMPORT_JOB | 1 → N | `exam_import_job.org_id` + index `(org_id, content_fingerprint)`, `(org_id, created_at)` | schema :17, :53-60 |
| USER → EXAM_IMPORT_JOB | 1 → N | `exam_import_job.created_by` | schema :18 |
| ORGANIZATION → CREDIT_WALLET | 1 → 1 | `credit_wallet.org_id` PK | `credit-wallet.ts:16` |
| CREDIT_WALLET → CREDIT_USAGE_LOG | 1 → N | `credit_usage_log.org_id`; UNIQUE `idempotency_key` | `credit-wallet.ts:51, 66-68` |
| EXAM_IMPORT_JOB → CREDIT_USAGE_LOG | 1 → N | `ref_id = job.id`; key `exam_import:<jobId>:<op>` | `wallet.ts:73-81` |
| EXAM_IMPORT_JOB → ASSIGNMENT_TEST | 0..1 → 0..1 | `exam_import_job.published_test_id` (nullable, set khi publish; idempotent) | `exam-import-job.ts:39-40`, `publish-to-bank.ts:219-247, 510-519` |
| ASSIGNMENT_TEST → ASSIGNMENT_TEST_PART | 1 → N (≥1) | `assignment_test_part.test_id`; unique `(test_id, part)` | `assignment-test.ts:53-75` |
| ASSIGNMENT_TEST_PART → ASSIGNMENT_PROMPT | N → 1 | `assignment_test_part.prompt_id` | `assignment-test.ts:64-66` |
| Draft ↔ job | 1 → 0..1 | `draft_json` (JSON, parse an toàn khi đọc) | `exam-imports.ts:59-88`, `publish-to-bank.ts:127-137` |

> ⚠️ FK heuristic: `exam_import_job.org_id`/`created_by`/`published_test_id` và `credit_usage_log.org_id`/`actor_user_id`/`ref_id` KHÔNG có `.references()` ở DB (ràng buộc app-level); FK thật chỉ ở `assignment_test.org_id` (`assignment-test.ts:24`) và `assignment_test_part.test_id`/`prompt_id` (`:59`/`:66`).
