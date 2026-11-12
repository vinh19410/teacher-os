---
type: reverse-srs-erd
feature: online-payment
status: draft
updated: 2026-11-12
---

# online-payment — ERD tái lập (reverse)

> Khớp schema thật. ORGANIZATION và STUDENT chỉ liệt kê cột liên quan đến feature này (phần còn lại thuộc feature khác); ba bảng còn lại liệt kê ĐỦ cột theo schema.

```mermaid
erDiagram
    ORGANIZATION ||--o| ORG_BANK_LINK : "co mot lien ket ngan hang"
    ORGANIZATION ||--o{ INVOICE : "phat hanh hoa don"
    STUDENT ||--o{ INVOICE : "duoc lap hoa don"
    ORGANIZATION ||--o{ PAYMENT_TRANSACTION : "dong so giao dich"
    INVOICE |o--o{ PAYMENT_TRANSACTION : "duoc ghi nhan boi khong FK"
    ORGANIZATION {
        text id PK
        text name "ten to chuc hien tren trang cong khai"
    }
    STUDENT {
        text id PK
        text name "ten hoc vien hien tren trang cong khai"
    }
    INVOICE {
        text id PK
        text org_id FK
        text student_id FK
        text enrollment_id "khong FK - tu gia to chi"
        integer amount "so tien hoa don"
        text status "unpaid / paid - tinh lai tu so"
        text due "ngay han dinh dang ISO"
        text note "ghi chu giao vien - bi luoc tren trang cong khai"
        text date "ngay phat hanh"
        text type "loai hoa don"
        text method "nhan phuong thuc hien thi"
        text payment_code "ma chuyen khoan - unique - nullable"
        text pay_token "token link cong khai - unique - nullable"
        integer paid_amount "tinh lai tu so giao dich khop"
        integer created_at "thoi diem tao"
    }
    PAYMENT_TRANSACTION {
        text id PK
        text org_id FK
        text provider "mac dinh sepay_bankhub hoac thu cong"
        text provider_txn_id "ma giao dich ben ngoai - unique theo cap provider"
        text bank_account_xid "tai khoan nhan tien"
        integer amount "toan bo so tien giao dich"
        text content "noi dung chuyen khoan goc"
        text reference_code "ma tham chieu"
        text transaction_date "chuoi thoi diem theo nha cung cap"
        text payment_code "ma hoc phi trich duoc - nullable"
        text invoice_id "khong FK - nullable khi chua khop"
        text match_status "unmatched / matched / ignored"
        text unmatched_reason "no_code / foreign_code / unknown_code / invoice_paid"
        text raw "payload goc - chi giu khi chua khop"
        text method "chi phieu thu cong - transfer / cash / other"
        text recorded_by "chi phieu thu cong - nguoi ghi"
        integer created_at "thoi diem tao"
    }
    ORG_BANK_LINK {
        text org_id PK "khoa chinh dong thoi khoa ngoai to chuc"
        text company_xid "ma dai dien tren hub - unique - nullable"
        text bank_account_xid "tai khoan hien tai - unique - nullable"
        text past_bank_account_xids "danh sach tai khoan cu - mac dinh rong"
        text status "none / linked / inactive / unlinked"
        text brand_name "ten ngan hang"
        text bank_bin "ma bin ngan hang"
        text bank_code "ma ngan hang"
        text account_number "so tai khoan"
        text account_holder_name "ten chu tai khoan"
        integer last_event_at "thoi diem su kien cuoi - guard thoi gian"
        integer last_reconciled_at "thoi diem doi soat cuoi - cooldown 60 giay"
        integer linked_at "thoi diem lien ket"
        integer updated_at "thoi diem cap nhat"
    }
```

**Ghi chú quan hệ:**
- `invoice_id` trên sổ giao dịch cố ý không có khóa ngoại — hồ sơ tài chính sống sót khi dòng tham chiếu bị xóa; tương tự `enrollment_id` trên hóa đơn. — ✅ [S7] `packages/db/src/schema/payment-transaction.ts:11-24`, `packages/db/src/schema/invoice.ts:12-17`.
- `paid_amount` trên hóa đơn không bao giờ cộng trực tiếp — luôn dựng lại từ tổng các dòng khớp. — ✅ [S7] `packages/db/src/schema/invoice.ts:19-24`; [S4] `apps/server/src/lib/payments/recompute-invoice.ts:5-6`.
- Khóa chống trùng duy nhất của cả feature: cặp nhà cung cấp + mã giao dịch bên ngoài (unique index). — ✅ [S7] `packages/db/src/schema/payment-transaction.ts:53-56`.
