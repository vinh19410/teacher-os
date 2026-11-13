---
type: reverse-srs-erd
feature: students
updated: 2026-11-11
---

# students — ERD tái lập (reverse)

```mermaid
erDiagram
    ORGANIZATION ||--o{ STUDENT : "co nhieu ho so hoc vien"
    STUDENT ||--o{ ENROLLMENT : "ghi danh vao lop"
    CLASS ||--o{ ENROLLMENT : "gom hoc vien"
    STUDENT ||--o{ SESSION_PACKAGE : "so huu goi buoi"
    STUDENT ||--o{ INVOICE : "co hoa don hoc phi"
    ORGANIZATION ||--o{ STUDENT_INVITATION : "gui loi moi org"
    STUDENT_INVITATION }o--o| STUDENT : "auto-accept khi tao ho so cung email"

    STUDENT {
        text id PK
        text org_id FK "UNIQUE theo org + lower(trim(email)) partial"
        text name "notNull"
        text phone "default chuoi rong"
        text email "default chuoi rong - danh tinh portal"
        text zalo "copy phone khi GV tao"
        text parent_name "phu huynh"
        text parent_phone "sdt phu huynh"
        text entry_score "chuoi tu do <= 50 ky tu - NULL la chua co"
        text exam_interest "ielts / toeic - portal onboarding ghi"
        text current_level "portal onboarding ghi"
        text target_score "band/diem muc tieu - portal ghi"
        text learning_goals "JSON array key"
        text learning_goals_note "ghi chu <= 200 ky tu"
        text daily_study_hours "portal onboarding ghi"
        integer onboarding_completed_at "NULL = chua lien ket portal"
        integer last_invite_email_at "cooldown resend 60s"
        integer created_at "mac dinh now"
    }

    ORGANIZATION {
        text id PK
        text name "ten to chuc"
        integer created_at
    }

    ENROLLMENT {
        text id PK
        text org_id FK
        text class_id FK
        text student_id FK
        text status "invited / active"
        integer created_at
    }

    SESSION_PACKAGE {
        text id PK
        text enrollment_id FK "nullable - parked"
        text student_id FK
        integer total "tong buoi"
        integer price "hoc phi"
        text mode "Online / Offline"
        text expiry "han su dung"
        text status "active / parked / ..."
    }

    INVOICE {
        text id PK
        text org_id FK
        text student_id FK
        text enrollment_id FK
        integer amount
        integer paid_amount
        text status "unpaid / paid / overdue"
        text due "han thanh toan"
        text type "loai hoa don"
    }

    STUDENT_INVITATION {
        text id PK
        text org_id FK
        text inviter_user_id FK
        text email "lower(trim) unique khi pending theo org"
        text status "pending / accepted / rejected / canceled"
        integer created_at
        integer updated_at
    }
    CLASS {
        text id PK
        text org_id FK
        text name "ten lop"
        integer sessions_total "1-52"
        integer tuition_fee
    }

```

## Entity Reference

| Entity | Mô tả nghiệp vụ | Thuộc tính chính | Nguồn | Nhãn |
|--------|-----------------|------------------|-------|------|
| student | Hồ sơ học viên **org-scoped** — người học trong một tổ chức; không có cột trạng thái, không có cột gói (invariant "Person only") | org_id, name, phone, email, zalo, parent_*, entry_score, exam_interest…onboarding_completed_at, last_invite_email_at | `packages/db/src/schema/student.ts:11-71` | ✅ |
| organization | Tổ chức (trung tâm dạy) sở hữu danh sách học viên | id, name, created_at | `packages/db/src/schema/student.ts:19-21` (FK) | ✅ |
| enrollment | Bản ghi học viên gắn lớp; trạng thái invited/active (chi tiết ở enrollment-lifecycle) | class_id, student_id, status | `apps/server/src/routes/kernel.ts:544-554` | ✅ |
| session_package | Gói buổi học; nguồn khối "pkg" trên danh sách (mới nhất `active`) | total, price, mode, start, expiry, status, enrollment_id nullable | `apps/server/src/routes/snapshot.ts:284-311`; `apps/web/src/lib/repos/students.ts:34-42` | ✅ |
| invoice | Hóa đơn học phí của học viên; nguồn tab Học phí | amount, paid_amount, status, due, type | `apps/server/src/routes/snapshot.ts:61-93` | ✅ |
| student_invitation | Lời mời vào tổ chức (liên kết nhẹ — feature student-invitations); unique `pending` theo (org, email) | email, status, inviter_user_id | `packages/db/src/schema/student-invitation.ts:10-43` | ✅ |
| class | Lớp học (được học viên ghi danh qua enrollment) | id, name, sessions_total, tuition_fee | `apps/server/src/routes/kernel.ts:544-554`; `packages/db/src/schema/class.ts` | ✅ |

## Quan hệ

| Từ | Đến | Bản số | Ý nghĩa | Nguồn | Nhãn |
|----|-----|--------|---------|-------|------|
| organization | student | 1-n | Mỗi hồ sơ thuộc đúng 1 org; xóa org → cascade xóa hồ sơ | `packages/db/src/schema/student.ts:19-21` | ✅ |
| student | enrollment | 1-n | Học viên có thể ở nhiều lớp (mỗi lớp 1 enrollment) | `kernel.ts:544-554`; unique (class, student) ở enrollment schema | ✅ |
| class | enrollment | 1-n | Lớp chứa nhiều học viên | như trên | ✅ |
| student | session_package | 1-n | Học viên có thể có nhiều gói; view lấy gói `active` mới nhất | `repos/students.ts:34-42` | ✅ |
| student | invoice | 1-n | Hóa đơn theo học viên (org-scoped, #320) | `snapshot.ts:61-93` | ✅ |
| organization | student_invitation | 1-n | Lời mời theo org; unique pending (org, email) | `packages/db/src/schema/student-invitation.ts:36-42` | ✅ |
| student_invitation | student | 0..1-0..n | Không FK trực tiếp — khớp nghiệp vụ qua (org_id, lower(trim(email))); khi GV tạo hồ sơ trùng email pending → invitation `accepted`; khi portal accept → tạo hồ sơ | `kernel.ts:530-543,612-638` (portal accept — boundary) | 🔵 (liên kết logic, không phải FK) |

## Notes

* Không vẽ bảng `lesson`/`assignment`/`report` trong ERD này dù chi tiết học viên có đọc (tab Lịch sử/Bài tập) — chúng thuộc feature attendance/grading; student chỉ là FK nghiệp vụ (`l.sid` ở view model). 
* Thuộc tính DB thật được giữ nguyên tên cột; view model web (`Student` có `tags/notes/targetBand`) KHÔNG phải entity DB — không mô hình hóa ở đây (đã ghi ở BR-016).
* Migration 0065 chỉ là `ALTER TABLE student ADD entry_score text` — cột nullable, không backfill. ✅ `packages/db/src/migrations/0065_student_entry_score.sql:1`
