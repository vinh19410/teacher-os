# dashboard — ERD & Entity Reference (reverse)

> Phạm vi: các entity mà feature dashboard ĐỌC (server `computeReminders` + client kernel snapshot). `DASHBOARD_REMINDERS` là read model tính toán, không persist. Mọi entity trong quan hệ đều có khối thuộc tính.

```mermaid
erDiagram
    ORGANIZATION ||--o{ MEMBERSHIP : "co thanh vien"
    ORGANIZATION ||--o{ CLASS_TABLE : "co lop"
    ORGANIZATION ||--o{ STUDENT : "co hoc vien"
    ORGANIZATION ||--o{ ENROLLMENT : "co ghi danh"
    ORGANIZATION ||--o{ LESSON : "co buoi hoc"
    ORGANIZATION ||--o{ INVOICE : "co hoa don"
    ORGANIZATION ||--o{ QUIZ_ATTEMPT : "co bai nop"
    ORGANIZATION ||--o{ ASSIGNMENT_PROMPT : "co de ngan hang"
    ORGANIZATION ||--o{ ASSIGNMENT_TEST : "co bo de"
    ORGANIZATION ||--o{ CLASS_ASSIGNMENT : "co bai giao lop"
    CLASS_TABLE ||--o{ ENROLLMENT : "gom hoc vien"
    STUDENT ||--o{ ENROLLMENT : "tham gia lop"
    CLASS_TABLE ||--o{ LESSON : "co buoi"
    ENROLLMENT ||--o{ LESSON : "the hien buoi theo hoc vien"
    STUDENT ||--o{ INVOICE : "phat sinh hoa don"
    CLASS_TABLE ||--o{ CLASS_ASSIGNMENT : "duoc giao bai"
    ASSIGNMENT_PROMPT ||--o{ CLASS_ASSIGNMENT : "snapshot de"
    CLASS_ASSIGNMENT ||--o{ QUIZ_ATTEMPT : "nhan bai nop theo lop"
    ASSIGNMENT_TEST ||--o{ QUIZ_ATTEMPT : "nhan bai nop tu hoc"
    DASHBOARD_REMINDERS }o--|| ORGANIZATION : "doc theo org"

    ORGANIZATION {
        string id PK
        string name
    }
    MEMBERSHIP {
        string id PK
        string org_id FK
        string user_id FK
        string role "teacher | owner | admin | ta | class_teacher"
    }
    CLASS_TABLE {
        string id PK
        string org_id FK
        string name
        string status
    }
    STUDENT {
        string id PK
        string org_id FK
        string name
        string avatar "client-derived"
        number pkg_remaining "client-derived tu goi"
    }
    ENROLLMENT {
        string id PK
        string org_id FK
        string class_id FK
        string student_id FK
        string status "join chi nhan active"
    }
    LESSON {
        string id PK
        string org_id FK
        string class_id FK
        string enrollment_id FK
        number day "1-7 Mon-first"
        string time "HH:mm"
        number dur "phut"
        string date "yyyy-mm-dd, NULL = legacy"
        string status "upcoming | completed | cancelled | holiday | absent"
        string attendance "excused | unexcused | NULL"
        string topic
    }
    INVOICE {
        string id PK
        string org_id FK
        string student_id FK
        string enrollment_id
        number amount
        number paid_amount
        string status "paid | unpaid | ..."
        string due "yyyy-mm-dd hoac rong"
    }
    QUIZ_ATTEMPT {
        string id PK "demo-attempt:% la bai mau, bi loai"
        string org_id FK
        string assignment_id FK
        string test_id FK
        string student_id FK
        string mode "assignment | practice"
        string status "submitted"
        string submitted_at
        json grade_scores "NULL = chua cham"
    }
    ASSIGNMENT_PROMPT {
        string id PK
        string org_id FK
        string skill "writing | speaking | ..."
        string writing_part "khac rong = de hybrid Writing"
        string status
    }
    ASSIGNMENT_TEST {
        string id PK
        string org_id FK
        string skill "writing | speaking | reading ..."
        string status
    }
    CLASS_ASSIGNMENT {
        string id PK
        string org_id FK
        string class_id FK
        string prompt_id FK
        string due
        string available_at "NULL = hien ngay"
    }
    DASHBOARD_REMINDERS {
        string date "yyyy-mm-dd gio VN"
        number attendance_pending
        array attendance_items "toi da 3"
        number overdue_count
        number overdue_writing
        number overdue_speaking
        number tuition_students "optional"
        number tuition_outstanding "optional, VND clamp"
    }
```

## Entity Reference

| Entity | Vai trò trong dashboard | Nguồn chính (repo-relative) |
|--------|-------------------------|------------------------------|
| ORGANIZATION | Phạm vi mọi truy vấn (orgId predicate) | apps/server/src/routes/dashboard-reminders.ts:66-67, 110-131, 240-250 |
| MEMBERSHIP | role quyết định `finance` (ẩn/hiện thẻ 3) | apps/server/src/app.ts:296-300; apps/server/src/routes/dashboard-reminders.ts:273-280; packages/auth/src/role.ts:75-87 |
| CLASS_TABLE | Tên lớp trên thẻ 1 + lịch | apps/server/src/routes/dashboard-reminders.ts:101-113; apps/web/src/routes/_auth/dashboard.tsx:213-215 |
| STUDENT | Bảng "Cần kiểm tra" (client) + đếm học viên nợ (server) | apps/web/src/routes/_auth/dashboard.tsx:177-181, 271-289; apps/server/src/routes/dashboard-reminders.ts:252 |
| ENROLLMENT | Join `status="active"` khi đếm ca | apps/server/src/routes/dashboard-reminders.ts:114-122 |
| LESSON | Thẻ 1 + Lịch hôm nay + Lịch sắp tới + Risk | apps/server/src/routes/dashboard-reminders.ts:99-158; apps/web/src/lib/dashboard-from-kernel.ts:13-178 |
| INVOICE | Thẻ 3 (server) + KPI "Còn phải thu" (client) | apps/server/src/routes/dashboard-reminders.ts:231-258; apps/web/src/lib/tuition-from-kernel.ts:28-48 |
| QUIZ_ATTEMPT | Thẻ 2 (bài quá hạn chấm) | apps/server/src/routes/dashboard-reminders.ts:160-222 |
| ASSIGNMENT_PROMPT | skill + writingPart (hybrid Writing) | apps/server/src/routes/dashboard-reminders.ts:162-198; packages/api/src/lib/ielts-band.ts:61-85 |
| ASSIGNMENT_TEST | Deck practice writing/speaking | apps/server/src/routes/dashboard-reminders.ts:200-222 |
| CLASS_ASSIGNMENT | Bài gắn lớp + availableAt | apps/server/src/routes/dashboard-reminders.ts:167-198; apps/server/src/lib/assignment-visibility.ts:11-16 |
| DASHBOARD_REMINDERS | Read model trả về web (không persist) | packages/api/src/contracts.ts:2680-2719; apps/web/src/components/dashboard/reminder-cards.tsx:42-80 |

## Quan hệ (ý nghĩa nghiệp vụ)

| Quan hệ | Ý nghĩa với dashboard | Cite |
|---------|------------------------|------|
| ORGANIZATION 1—N mọi entity | Cô lập dữ liệu org (IDOR guard) — org khác không đếm | apps/server/src/routes/dashboard-reminders.ts:110-131, 240-250; test apps/server/src/routes/dashboard-reminders.test.ts:270-275, 495-501 |
| CLASS_TABLE 1—N LESSON 1—1 ENROLLMENT (per-lesson) | Ca học gắn lớp qua enrollment active; bucket dated (classId,date) / legacy (classId,time) | apps/server/src/routes/dashboard-reminders.ts:99-158 |
| CLASS_TABLE 1—N CLASS_ASSIGNMENT N—1 ASSIGNMENT_PROMPT | Bài lớp → prompt (skill/writingPart) quyết định phân loại writing | apps/server/src/routes/dashboard-reminders.ts:167-198, 224-229 |
| ASSIGNMENT_TEST 1—N QUIZ_ATTEMPT | Practice tự học chỉ tính writing/speaking, loại demo | apps/server/src/routes/dashboard-reminders.ts:200-222 |
| STUDENT 1—N INVOICE | Đếm học viên distinct có hóa đơn đến hạn; cộng outstanding | apps/server/src/routes/dashboard-reminders.ts:231-258 |
| ORGANIZATION 1—1 DASHBOARD_REMINDERS (đọc) | 1 response/1 org/1 lần gọi; không persist | packages/api/src/contracts.ts:2688-2716 |
