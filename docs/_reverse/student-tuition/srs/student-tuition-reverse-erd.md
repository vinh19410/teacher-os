---
feature: student-tuition
type: reverse-srs-erd
status: draft
author: vinh19410
updated: "2026-11-12"
source_commit: d6c0f6b5
---

# srs/student-tuition-reverse-erd — student-tuition

Kiểu cột khớp schema thật (packages/db/src/schema/invoice.ts, org-bank-link.ts,
payment-transaction.ts, class.ts, enrollment.ts, student.ts, organization.ts).
FK ghi ở đây là FK schema-level; quan hệ APP-LEVEL (không FK) ghi chú riêng dưới biểu đồ.

```mermaid
erDiagram
    invoice {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text student_id FK "NOT NULL -> student.id, cascade"
        text enrollment_id "NOT NULL default rong — plain text, KHONG FK (so tai chinh song sot enrollment bi xoa)"
        integer amount "NOT NULL — tong so tien"
        text status "NOT NULL default unpaid: unpaid | paid"
        text due "NOT NULL default rong — ISO yyyy-mm-dd"
        text note "NOT NULL default rong — ghi chu giao vien"
        text date "NOT NULL default rong"
        text type "NOT NULL default rong"
        text method "NOT NULL default gach — phuong thuc ghi ban dau"
        text payment_code "NULL unique — memo TOS + 8 ky tu; backfill khi doc dau tien"
        text pay_token "NULL unique — token link /pay cong khai; backfill khi doc dau tien"
        integer paid_amount "NOT NULL default 0 — tinh lai tu ledger, khong cong don truc tiep"
        integer created_at "NOT NULL timestamp_ms"
    }
    org_bank_link {
        text org_id PK "FK -> organization.id, cascade — 1 dong moi org"
        text company_xid "NULL unique — SePay Bank Hub external id, nullable khi ensureCompany dang chay"
        text bank_account_xid "NULL unique — nullable theo y kien tren"
        text past_bank_account_xids "NOT NULL default mang rong — lich su tai khoan cu cho sweep"
        text status "NOT NULL default none: none -> linked -> inactive/unlinked"
        text brand_name "NOT NULL default rong"
        text bank_bin "NOT NULL default rong — dung do SEVQR voi VietinBank 970415"
        text bank_code "NOT NULL default rong"
        text account_number "NOT NULL default rong"
        text account_holder_name "NOT NULL default rong"
        integer last_event_at "NOT NULL default 0"
        integer last_reconciled_at "NOT NULL default 0"
        integer linked_at "NULL timestamp_ms"
        integer updated_at "NOT NULL timestamp_ms"
    }
    payment_transaction {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text provider "NOT NULL default sepay_bankhub; thu tay = manual"
        text provider_txn_id "NOT NULL — unique theo (provider, provider_txn_id) lam idempotency"
        text bank_account_xid "NOT NULL default rong"
        integer amount "NOT NULL"
        text content "NOT NULL default rong"
        text reference_code "NOT NULL default rong"
        text transaction_date "NOT NULL default rong"
        text payment_code "NULL — ma duoc khop tu noi dung chuyen khoan"
        text invoice_id "NULL — plain text, KHONG FK (cung tinh than invoice.enrollment_id)"
        text match_status "NOT NULL default unmatched"
        text unmatched_reason "NOT NULL default rong"
        text raw "NOT NULL default rong — payload goc, chi giu khi unmatched"
        text method "NOT NULL default rong — chi thu tay: transfer/cash/other"
        text recorded_by "NULL — chi thu tay: userId giao vien ghi"
        integer created_at "NOT NULL timestamp_ms"
    }
    class {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text name "NOT NULL"
        text level "NOT NULL default rong"
        text type "NOT NULL default ielts"
        text skills "NOT NULL default mang rong"
        text mode "NOT NULL default Online"
        text syllabus_id "NULL FK -> syllabus.id"
        text schedule "NOT NULL default rong"
        integer sessions_total "NOT NULL default 0"
        integer sessions_done "NOT NULL default 0"
        text status "NOT NULL default active"
        text start_date "NOT NULL default rong"
        text scheduling_mode "NOT NULL default auto"
        integer tuition_fee "NULL — hoc phi moi hoc vien VND toan khoa; null = chua thiet lap"
        text notes "NOT NULL default rong"
        integer created_at "NOT NULL timestamp_ms"
    }
    enrollment {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text class_id FK "NOT NULL -> class.id, cascade"
        text student_id FK "NOT NULL -> student.id, cascade"
        text status "NOT NULL default active: invited -> active (default chi de backfill cu)"
        integer created_at "NOT NULL timestamp_ms"
    }
    student {
        text id PK
        text org_id FK "NOT NULL -> organization.id, cascade"
        text name "NOT NULL"
        text phone "NOT NULL default rong"
        text email "NOT NULL default rong — auto-provision theo email phien da xac thuc; UQ (org_id, lower(trim(email))) WHERE trim != ''"
        text zalo "NOT NULL default rong"
        text parent_name "NOT NULL default rong"
        text parent_phone "NOT NULL default rong"
        text exam_interest "NULL"
        text current_level "NULL"
        text target_score "NULL"
        text entry_score "NULL"
        text learning_goals "NULL"
        text learning_goals_note "NULL"
        text daily_study_hours "NULL"
        integer onboarding_completed_at "NULL timestamp_ms"
        integer last_invite_email_at "NULL timestamp_ms"
        integer created_at "NOT NULL timestamp_ms"
    }
    organization {
        text id PK
        text name "NOT NULL"
        integer created_at "NOT NULL timestamp_ms"
    }
    organization ||--o| org_bank_link : "org_id (1 link/org)"
    organization ||--o{ invoice : "org_id"
    student ||--o{ invoice : "student_id"
    invoice ||--o{ payment_transaction : "app-level: invoice_id khong FK — SUM ledger = paid_amount"
    enrollment ||--o{ invoice : "app-level: enrollment_id khong FK — hoa don khong gan lop de enrollment_id rong"
    class ||--o{ enrollment : "class_id"
    student ||--o{ enrollment : "student_id (unique class + student)"
```

Chỉ mục và ràng buộc unique (schema thật):

- `invoice_payment_code_uq (payment_code)`, `invoice_pay_token_uq (pay_token)` — unique
  index (không inline) để SQLite coi nhiều dòng NULL là khác nhau; kèm index
  org/student/enrollment — packages/db/src/schema/invoice.ts:40-59. ✅
- `org_bank_link_company_xid_uq`, `org_bank_link_bank_account_xid_uq` — cùng kỹ thuật
  NULL-distinct; PK là org_id nên 1 link/org — packages/db/src/schema/org-bank-link.ts:20-46. ✅
- `payment_transaction_provider_txn_uq (provider, provider_txn_id)` — IPN gửi lại / sweep
  kéo lại / thu tay thử lại đều no-op — packages/db/src/schema/payment-transaction.ts:52-56. ✅
- `enrollment_class_student_uq (class_id, student_id)` — bất biến 4: một membership —
  packages/db/src/schema/enrollment.ts:40-42. ✅
- `student_org_email_uq (org_id, lower(trim(email))) WHERE trim(email) != ''` — trùng email
  TRONG một org là bất khả thi; OQ-04 chỉ còn kịch bản khác org — packages/db/src/schema/student.ts:67-69. ✅

Ghi chú quan hệ app-level:

- `invoice.enrollment_id` và `payment_transaction.invoice_id` cố ý không FK để hồ sơ tài
  chính sống sót khi dòng tham chiếu bị xóa; tính hợp lệ kiểm ở thời điểm ghi (phía
  tuition-invoicing) — packages/db/src/schema/invoice.ts:11-25,
  packages/db/src/schema/payment-transaction.ts:5-22. ✅
- `paid_amount` = SUM các dòng khớp của ledger, recomputed — never incremented directly —
  packages/db/src/schema/invoice.ts:19-25, packages/db/src/schema/payment-transaction.ts:7-9. ✅
- Học phí là cột của lớp (per-student), không derive từ invoice —
  packages/db/src/schema/class.ts:33-36 (comment persist-vs-derive carve-out). ✅
- invoice có thể không gắn lớp (enrollment_id rỗng) → unlinkedPaid phân hệ B —
  apps/web/src/lib/tuition-from-kernel.ts:329-399. ✅

Phân hệ A KHÔNG tạo bảng riêng — dùng đúng các bảng domain thanh toán trên; phần trang
bị (backfill payment_code/pay_token) chỉ UPDATE 2 cột nullable của invoice —
apps/server/src/lib/payment-instructions.ts:21-55. ✅
