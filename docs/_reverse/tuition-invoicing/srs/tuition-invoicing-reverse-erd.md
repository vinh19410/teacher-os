# ERD nghịch đảo — tuition-invoicing

> Nhãn: ✅ chắc chắn (code khẳng định: validator/hằng/guard/enum/migration/chuỗi lỗi) · 🔵 suy đoán (≥2 chỗ code hậu thuẫn) · 🟡 cần xác nhận (vì sao/mục tiêu/priority → OQ).

Kiểu cột theo SQLite (text/integer). Quan hệ nét liền `--` = khóa ngoài thật trong schema (xóa-đổ-domino); nét đứt `..` = tham chiếu thuần **app-level không ràng buộc xóa** (thiết kế có chủ ý để dòng tiền sống sót khi bản ghi gốc bị xóa) ✅ [S5] packages/db/src/schema/invoice.ts:12-18, [S9] packages/db/src/schema/payment-transaction.ts:16-19.

```mermaid
erDiagram
    ORGANIZATION ||--o{ STUDENT : "quan ly"
    ORGANIZATION ||--o{ CLASS : "so huu"
    ORGANIZATION ||--o{ ENROLLMENT : "pham vi"
    CLASS ||--o{ ENROLLMENT : "ghi danh"
    STUDENT ||--o{ ENROLLMENT : "thuoc lop"
    ORGANIZATION ||--o{ INVOICE : "phat hanh"
    STUDENT ||--o{ INVOICE : "chiu nghia vu"
    ORGANIZATION ||--o{ PAYMENT_TRANSACTION : "nhan tien vao"
    ORGANIZATION ||--o| ORG_BANK_LINK : "toi da mot lien ket ngan hang"
    ENROLLMENT ||..o{ INVOICE : "tham chieu thuan app-level khong FK"
    INVOICE ||..o{ PAYMENT_TRANSACTION : "khop tien app-level khong FK"
    ORGANIZATION {
        text id PK
        text name "ten to chuc"
        integer createdAt "moc ms"
    }
    STUDENT {
        text id PK
        text org_id FK "cascade"
        text name
        text phone "mac dinh rong"
        text email "unique theo org khi khac rong"
        text zalo
        text parent_name
        text parent_phone
        text exam_interest "null duoc phep"
        text current_level "null duoc phep"
        text target_score "null duoc phep"
        text entry_score "null duoc phep"
        text learning_goals "JSON array string"
        text learning_goals_note "null duoc phep"
        text daily_study_hours "null duoc phep"
        integer onboarding_completed_at "moc ms, null = chua onboarding"
        integer last_invite_email_at "moc ms, cooldown gui lai"
        integer createdAt "moc ms"
    }
    CLASS {
        text id PK
        text org_id FK "cascade"
        text name
        text level "mac dinh rong"
        text type "mac dinh ielts"
        text skills "JSON array string"
        text mode "mac dinh Online"
        text syllabus_id "FK giao trinh - ngoai pham vi feature"
        text schedule "mac dinh rong"
        integer sessions_total "mac dinh 0"
        integer sessions_done "mac dinh 0"
        text status "mac dinh active"
        text start_date "mac dinh rong"
        text scheduling_mode "auto hoac manual"
        integer tuition_fee "VND toan khoa, null = chua thiet lap"
        text notes
        integer createdAt "moc ms"
    }
    ENROLLMENT {
        text id PK
        text org_id FK "cascade"
        text class_id FK "cascade"
        text student_id FK "cascade"
        text status "invited hoac active"
        integer createdAt "moc ms"
    }
    INVOICE {
        text id PK "uuid"
        text org_id FK "cascade"
        text student_id FK "cascade"
        text enrollment_id "van ban thuan khong FK, mac dinh rong"
        integer amount "VND"
        text status "unpaid hoac paid, mac dinh unpaid"
        text due "ISO yyyy-mm-dd, mac dinh rong"
        text note "mac dinh rong"
        text date "mac dinh rong, khong con writer"
        text type "mac dinh rong, khong con writer"
        text method "mac dinh la dau gach ngang"
        text payment_code "null duoc phep, unique khi co gia tri"
        text pay_token "null duoc phep, unique khi co gia tri"
        integer paid_amount "tinh lai tu so, mac dinh 0"
        integer createdAt "moc ms"
    }
    PAYMENT_TRANSACTION {
        text id PK "uuid"
        text org_id FK "cascade"
        text provider "sepay_bankhub hoac manual"
        text provider_txn_id "khoa chong trung cung provider"
        text bank_account_xid "mac dinh rong"
        integer amount "VND"
        text content "noi dung chuyen khoan"
        text reference_code "mac dinh rong"
        text transaction_date "mac dinh rong"
        text payment_code "ma tim thay trong noi dung, null duoc phep"
        text invoice_id "van ban thuan khong FK, null khi chua khop"
        text match_status "unmatched hoac matched hoac ignored"
        text unmatched_reason "no_code unknown_code foreign_code invoice_paid"
        text raw "payload goc, chi giu khi chua khop"
        text method "chi phieu thu: transfer cash other"
        text recorded_by "userId nguoi lap, chi phieu thu"
        integer createdAt "moc ms"
    }
    ORG_BANK_LINK {
        text org_id PK "FK cascade, mot dong moi org"
        text company_xid "null khi dang tao, unique khi co"
        text bank_account_xid "null duoc phep, unique khi co"
        text past_bank_account_xids "JSON array lich su tai khoan cu"
        text status "none linked inactive unlinked"
        text brand_name
        text bank_bin
        text bank_code
        text account_number
        text account_holder_name
        integer last_event_at "mac dinh 0"
        integer last_reconciled_at "mac dinh 0"
        integer linkedAt "moc ms, null duoc phep"
        integer updatedAt "moc ms"
    }
```

Ghi chú:
- Giá trị `match_status` writer ghi thực tế: `unmatched` (mặc định), `matched` (khớp/gán), `ignored` (bỏ qua) ✅ [S9] packages/db/src/schema/payment-transaction.ts:41, [S4] apps/server/src/routes/payment-transactions.ts:140-148.
- `raw` rỗng khi đã khớp để gọn dữ liệu cá nhân ✅ [S9] packages/db/src/schema/payment-transaction.ts:19-21.
- Hai chỉ mục duy nhất trên cột rỗng-được-phép của hóa đơn dùng uniqueIndex riêng (nhiều NULL coi là khác nhau) ✅ [S5] packages/db/src/schema/invoice.ts:55-60.
- Đăng ký duy nhất theo (lớp, học viên) ✅ [S67] packages/db/src/schema/enrollment.ts:39-43.
- Cột `org_bank_link` mốc thời gian dùng kiểu mili-giây hoặc epoch tùy cột theo schema gốc ✅ [S69] packages/db/src/schema/org-bank-link.ts:36-41.
