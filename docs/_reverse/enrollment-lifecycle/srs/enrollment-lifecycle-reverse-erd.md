---
type: reverse-srs-erd
feature: enrollment-lifecycle
updated: 2026-11-11
---

# enrollment-lifecycle — ERD tái lập (reverse)

```mermaid
erDiagram
    ORGANIZATION ||--o{ STUDENT : "co"
    ORGANIZATION ||--o{ CLASS : "co"
    CLASS ||--o{ ENROLLMENT : "ghi danh"
    STUDENT ||--o{ ENROLLMENT : "thuoc lop"
    ENROLLMENT ||--o| SESSION_PACKAGE : "kich hoat sinh goi - unique"
    ENROLLMENT ||--o{ LESSON : "kich hoat sinh buoi"
    CLASS ||--o{ LESSON : "lop"
    ENROLLMENT ||--o{ INVOICE : "enrollmentId TEXT KHONG FK - bat buoc active luc tao"
    STUDENT ||--o{ INVOICE : "sinh vien tra hoc phi"
    CLASS ||--o{ CLASS_ASSIGNMENT : "giao cho lop"
    CLASS_ASSIGNMENT ||--o{ CLASS_ASSIGNMENT_TARGET : "hoc vien nhan - chi active"
    STUDENT ||--o{ CLASS_ASSIGNMENT_TARGET : "nhan bai"

    ENROLLMENT {
        string id PK
        string org_id FK
        string class_id FK
        string student_id FK
        string status "invited hoac active"
        timestamp created_at
    }
    SESSION_PACKAGE {
        string id PK
        string enrollment_id FK "unique - null khi parked"
        string student_id FK
        int total "derive tu lop"
        int price "tuitionFee cua lop"
        string mode
        string status
    }
    INVOICE {
        string id PK
        string enrollment_id "TEXT khong FK"
        string student_id FK
        int amount
        string due
        string status
    }
    CLASS_ASSIGNMENT {
        string id PK
        string class_id FK
        string prompt_id FK
        string title "snapshot luc giao"
        string due
    }
    CLASS_ASSIGNMENT_TARGET {
        string id PK
        string assignment_id FK
        string student_id FK
        string submitted_at "null = chua nop"
    }
    ORGANIZATION {
        string id PK
        string name
    }
    STUDENT {
        string id PK
        string org_id FK
        string email "unique trong org khi portal-linked"
        string name
    }
    CLASS {
        string id PK
        string org_id FK
        string name
        int sessions_total "1-52"
        int tuition_fee
        string mode
        string schedule
        string scheduling_mode
    }
    LESSON {
        string id PK
        string enrollment_id FK
        string class_id FK
        string date "ngay buoi hoc"
        string status
    }
```

## Entity Reference

| Entity | Mô tả nghiệp vụ | Thuộc tính chính | Nguồn | Nhãn |
|--------|-----------------|------------------|-------|------|
| ENROLLMENT | Dòng roster: học viên ∈ lớp, đúng 1 row mỗi cặp | status invited/active; unique (classId, studentId) | S1 `enrollment.ts:17-47` | ✅ |
| SESSION_PACKAGE | Gói buổi entitlement sinh lúc kích hoạt | unique `session_package_enrollment_uq`; parked khi enrollmentId null | S25 `session-package.ts:31,45,48-50` | ✅ |
| LESSON | Dòng buổi học sinh theo enrollment lúc kích hoạt | enrollmentId, classId, date, status | S4 `enrollment-activation.ts:598-606` | ✅ |
| INVOICE | Hóa đơn học phí; giữ enrollmentId dạng TEXT KHÔNG FK để sống sót khi enrollment xóa; chỉ tạo khi enrollment active | amount int dương, due ISO | S23 `invoice.ts:12-17,35`; S3 `kernel.ts:3069-3071` | ✅ |
| CLASS_ASSIGNMENT (+TARGET) | Lượt giao đề cho lớp + học viên nhận; server chỉ cho target học viên roster active | unique (assignment, student) | S24 `class-assignment.ts:21-78`; S3 `kernel.ts:1564-1577` | ✅ |
| CLASS | Lớp — nguồn derive total/price/mode khi kích hoạt | sessionsTotal (1-52), tuitionFee, mode, schedule, schedulingMode | S4 `enrollment-activation.ts:294-307`; S2 `contracts.ts:122` | ✅ |
| STUDENT | Học viên org-scoped | email unique trong org; portalLinked | S3 `kernel.ts:486-495`; S22 `pdr.md:46` | ✅ |

## Quan hệ

| Từ | Đến | Bản số | Ý nghĩa | Nguồn | Nhãn |
|----|-----|--------|---------|-------|------|
| CLASS | ENROLLMENT | 1-N | Lớp có nhiều dòng roster | S1 FK | ✅ |
| STUDENT | ENROLLMENT | 1-N | Học viên có thể ở nhiều lớp (mỗi lớp 1 row) | S1 unique (classId, studentId) | ✅ |
| ENROLLMENT | SESSION_PACKAGE | 1-0..1 | Kích hoạt sinh đúng 1 gói (unique); chưa kích hoạt = 0 gói | S25 unique; S19 `kernel.test.ts:1682-1722,7176` | ✅ |
| ENROLLMENT | LESSON | 1-N | Kích hoạt sinh N dòng buổi (N = số buổi lớp; legacy = 0) | S4; S19 `kernel.test.ts:4884-4888` | ✅ |
| ENROLLMENT | INVOICE | 1-N (logical, không FK) | Hóa đơn dính enrollment; xóa enrollment không xóa hóa đơn | S23 `invoice.ts:15-17` | ✅ |
| CLASS | CLASS_ASSIGNMENT | 1-N | Giao đề theo lớp | S24 | ✅ |
| CLASS_ASSIGNMENT | TARGET | 1-N | Học viên nhận; chỉ chọn từ roster active lúc giao | S24; S3 `kernel.ts:1564-1577` | ✅ |

## Notes

* `INVOICE.enrollment_id` CỐ Ý không FK (giữ record tài chính khi enrollment bị xóa; hợp lệ kiểm tại lúc ghi) — thuộc tính DB thật cố ý đưa vào vì là ràng buộc nghiệp vụ vòng đời. ✅ [S23 `invoice.ts:15-17`]
* `ORGANIZATION`, `STUDENT`, `CLASS` chỉ vẽ khung để đọc bản số — chi tiết entity thuộc feature khác.
* Không có bảng audit cho hủy lời mời (xóa hẳn row) — xem Gap Mục 10.
