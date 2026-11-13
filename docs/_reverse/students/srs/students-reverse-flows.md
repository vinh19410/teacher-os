---
type: reverse-srs-flows
feature: students
updated: 2026-11-11
---

# students — Flows tái lập (reverse)

> Quy ước: mọi nhãn đều truy vết được trong code (cite ở `_evidence.md`). Không vẽ bước không có trong code.

## Flow 1: Xem danh sách học viên + tìm kiếm/lọc

### Sequence — Xem danh sách học viên

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant W as Web SPA /students
    participant K as Kernel API
    GV->>W: Mo trang /students
    W->>K: GET /api/kernel (session teacher)
    K-->>W: 200 snapshot students org-scoped (loai demo-student)
    W->>W: mapStudents (pkg active moi nhat, done/remaining derive, portalLinked)
    W->>W: Tinh KPI + pendingStudents + gop invitations pending
    W-->>GV: Kicker - 2 tab - bang hoc vien + badge trang thai
    GV->>W: Chon chip loc hoac tab
    W-->>GV: Danh sach loc client-side (khong goi API them)
    Note over W,K: Khong co tim kiem hay phan trang server-side (OQ-8)
```

### Activity — Xem danh sách học viên

```mermaid
flowchart TD
    A["Mo /students"] --> B["GET /api/kernel"]
    B --> C["mapStudents + KPI"]
    C --> D{"Tab?"}
    D -->|"Hoc vien"| E["Bang hoc vien + badge portal"]
    D -->|"Loi moi dang cho"| F["pendingStudents + invitations pending unique"]
    E --> G{"Chip loc?"}
    G -->|"Tat ca"| H["Toan bo danh sach"]
    G -->|"Chip khac"| I["Loc theo tags"]
    I --> J["tags luon rong - danh sach rong (OQ-3)"]
    E --> K["Click dong"]
    K --> L["navigate /students/:id"]
    B --> M["401 unauthorized neu chua dang nhap"]
```

## Flow 2: Xem chi tiết học viên (hồ sơ, lớp, điểm đầu vào)

### Sequence — Xem chi tiết học viên

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant W as SPA /students/:id
    participant D as Data store (snapshot)
    GV->>W: Click dong hoc vien
    W->>W: navigate /students/:studentId
    W->>D: studentById(studentId)
    alt Khong tim thay
        W-->>GV: Card Khong tim thay hoc vien + link ve danh sach
    else Tim thay
        D-->>W: student + classes (qua enrollments) + lessons + invoices + assignments
        W-->>GV: Header lien he + avatar + tags + nut Zalo - resend
        GV->>W: Chuyen tab Ho so - Lich su buoi - Hoc phi - Bai tap
        W-->>GV: Entry score (Chua co neu rong) - lop hoc + badge Da moi - phu huynh
    end
    Note over W: Khong co nut sua ho so (khong ton tai API update - OQ-2)
```

### Activity — Xem chi tiết học viên

```mermaid
flowchart TD
    A["Click dong hoc vien"] --> B["studentById theo URL id"]
    B --> C{"Ton tai?"}
    C -->|"Khong"| D["notFound - card Khong tim thay hoc vien"]
    D --> E["Link ve /students"]
    C -->|"Co"| F["Header lien he + Zalo"]
    F --> G{"Tab?"}
    G -->|"Ho so"| H["Lop hoc + Diem dau vao + Phu huynh + Ghi chu"]
    G -->|"Lich su buoi"| I["Bang lessons cua student"]
    G -->|"Hoc phi"| J["Tong ket + bang hoa don - click mo /tuition/:id"]
    G -->|"Bai tap"| K["Class assignment + grading rows"]
```

## Flow 3: Thêm học viên thủ công (tạo hồ sơ + tùy chọn ghi danh + mail mời)

> Flow này tồn tại trong code dù PDR nói ngược lại (OQ-1). KHÔNG có flow "cập nhật thông tin học viên" — code không có đường nào (FR-022, G-2).

### Sequence — Thêm học viên thủ công

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant M as Modal Them hoc vien
    participant K as POST /api/students
    participant X as Mailer
    GV->>M: Nhap name - phone - email - phu huynh - entry score - lop - activateNow
    M->>M: Validate ten + email (regex client)
    alt Ten rong hoac email sai
        M-->>GV: Loi inline - khong goi API
    else Hop le
        M->>K: POST /api/students (JSON - Origin allowlist)
        alt Zod fail
            K-->>M: 400 invalid body
            M-->>GV: Thong bao fail chung
        else classId khong thuoc org
            K-->>M: 404 class not found
            M-->>GV: Thong bao fail chung
        else Email trung trong org
            K-->>M: 409 ALREADY_IN_ORG + existingStudentId + portalLinked
            alt portalLinked = false
                M-->>GV: Callout Cho xac nhan + nut Gui lai loi moi
            else portalLinked = true
                M-->>GV: Email nay da tham gia cong hoc vien
            end
        else activateNow loi kich hoat
            K-->>M: 500 enrollment activation failed
            M-->>GV: Thong bao fail - ho so DA tao
        else Happy path
            K->>K: db.batch insert student + accept invitation pending + enrollment invited
            K->>X: Gui mail moi portal (timeout 5s - best effort)
            X-->>K: OK / loi (chi log)
            K-->>M: 201 id + activated + inviteEmailSent
            M->>K: Refresh snapshot
            K-->>M: 200 snapshot moi
            alt inviteEmailSent = false va co email
                M-->>GV: Toast canh bao chua gui duoc mail
            else
                M-->>GV: Dong modal - hoc vien hien trong danh sach
            end
        end
    end
```

### Activity — Thêm học viên thủ công

```mermaid
flowchart TD
    A["Mo modal Them hoc vien moi"] --> B{"Ten hop le + email hop le?"}
    B -->|"Khong"| C["Loi inline - dung lai"]
    B -->|"Co"| D["POST /api/students"]
    D --> E{"Server kiem tra"}
    E -->|"Zod fail"| F["400 invalid body"]
    E -->|"Lop la"| G["404 class not found"]
    E -->|"Email trung"| H{"portalLinked?"}
    H -->|"false"| I["Callout Cho xac nhan + resend"]
    H -->|"true"| J["Email da tham gia cong hoc vien"]
    E -->|"OK"| K["Batch insert + accept invitation + enrollment invited"]
    K --> L{"activateNow va co lop?"}
    L -->|"Co"| M["activateEnrollment - goi + buoi hoc"]
    M --> N{"Kich hoat OK?"}
    N -->|"Khong"| O["500 enrollment activation failed"]
    N -->|"Co"| P["Gui mail moi"]
    L -->|"Khong"| P
    P --> Q{"Mail OK?"}
    Q -->|"Co"| R["201 + lastInviteEmailAt stamp"]
    Q -->|"Khong"| S["201 + inviteEmailSent false - toast canh bao"]
    R --> T["Refresh snapshot - dong modal"]
    S --> T
```

## Flow 4: Gửi lại lời mời portal (resend từ danh sách/chi tiết)

### Sequence — Gửi lại lời mời portal

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant B as Nut Gui lai loi moi
    participant K as POST /api/students/:id/resend-invite
    participant X as Mailer
    GV->>B: Click (chi voi hoc vien co email + portalLinked=false)
    B->>K: POST resend-invite
    alt Vai tro khong du quyen (ta)
        K-->>B: 403 FORBIDDEN Tro giang khong co quyen
    else Khong co mailer
        K-->>B: 503 INVITATION_EMAIL_UNAVAILABLE
    else Ho so la / demo
        K-->>B: 404 INVITATION_NOT_FOUND Khong tim thay hoc vien
    else Trong cooldown 60 giay
        K-->>B: 429 RESEND_COOLDOWN + Retry-After n giay
        B->>B: Dem nguoc Gui lai (ns)
    else Co enrollmentId sai kem
        K-->>B: 404 Loi moi vao lop khong ton tai
    else Mail loi
        K-->>B: 502 INVITATION_EMAIL_FAILED
        B-->>GV: Toast loi wording server
    else Thanh cong
        K->>X: Gui mail sync 5s
        K->>K: Stamp lastInviteEmailAt (CAS)
        K-->>B: 200 ok
        B-->>GV: Toast Da gui lai loi moi toi email
    end
```

### Activity — Gửi lại lời mời portal

```mermaid
flowchart TD
    A["Nut Gui lai loi moi"] --> B{"Dang gui hoac cooldown?"}
    B -->|"Co"| C["Bo qua click"]
    B -->|"Khong"| D["POST resend-invite"]
    D --> E{"Ket qua"}
    E -->|"429"| F["Doc retryAfterSeconds - bat dau dem nguoc"]
    E -->|"403-404-502-503"| G["Toast loi wording tu server hoac fallback"]
    E -->|"200"| H["Toast thanh cong + refresh danh sach loi moi"]
```

## Flow 5 (ranh giới — không vẽ chi tiết): học viên tự liên kết portal

Hồ sơ chuyển sang "Đã liên kết" khi học viên đăng nhập portal (email verified) và hoàn tất wizard onboarding (`onboardingCompletedAt` được stamp) — thuộc feature `student-*` / `auth-student-signup`. Hand-off: `apps/server/src/routes/student.ts:124-210` (guard + provision), `apps/server/src/routes/student.ts:1241-1289` (onboarding), `apps/server/src/student-provisioning.ts:17-84` (D1-D7).
