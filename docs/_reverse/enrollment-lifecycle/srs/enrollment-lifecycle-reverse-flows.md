---
type: reverse-srs-flows
feature: enrollment-lifecycle
updated: 2026-11-11
---

# enrollment-lifecycle — Flows tái lập (reverse)

> Mỗi flow: `sequenceDiagram` + `flowchart`, chỉ vẽ bước có trong code. Nhãn: ✅ chắc chắn · 🔵 suy đoán · 🟡 cần xác nhận.

## Flow 1: Giáo viên thêm học viên vào lớp (tạo invited)

### Sequence — Thêm học viên vào lớp

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant W as Web lop hoc
    participant K as Kernel API
    participant N as Thong bao + Mailer
    GV->>W: Mo modal "Them hoc vien vao lop"
    W->>W: Loc hoc vien chua nam trong lop (ke ca invited)
    alt Chon hoc vien co san
        GV->>W: Chon hoc vien + (checkbox) Kich hoat ngay
        W->>K: POST /api/classes/{id}/enroll {studentId, activateNow}
        K->>K: Kiem tra lop 404 - hoc vien 404 - trung 409
        K->>K: INSERT enrollment status invited
    else Tao hoc vien moi
        GV->>W: Nhap ten + (email, SDT) + classId
        W->>K: POST /api/students {classId, activateNow}
        K->>K: Email trung org - 409 STUDENT_ALREADY_IN_ORG
        K->>K: Batch INSERT student + enrollment invited
    end
    alt activateNow = true
        K->>K: activateEnrollment (goi Flow 2/3 dung ham)
        K-->>W: 201 {enrollmentId, activated true}
    else activateNow khong chon
        K->>N: enqueue class_enrolled (khoa enrollmentId) + email loi moi
        K-->>W: 201 {enrollmentId, activated false, inviteEmailSent}
    end
    W-->>GV: Roster hien badge "Da moi" - KPI "N cho xac nhan"
    Note over K,N: Mailer loi khong chan 201 - tra inviteEmailSent false (E-EL-016)
```

### Activity — Thêm học viên vào lớp

```mermaid
flowchart TD
    A["Mo modal them hoc vien"] --> B{"Che do?"}
    B -->|"co san"| C["POST /classes/id/enroll"]
    B -->|"tao moi"| D["POST /students + classId"]
    D --> E{"Email trung trong org?"}
    E -->|"co"| F["409 STUDENT_ALREADY_IN_ORG - callout moi lai"]
    E -->|"khong"| G["Insert student + enrollment invited"]
    C --> H{"Lop - hoc vien - trung?"}
    H -->|"loi"| I["404 class/student - 409 already enrolled"]
    H -->|"hop le"| G
    G --> J{"activateNow?"}
    J -->|"true"| K["activateEnrollment - 500 neu loi"]
    J -->|"false"| L["class_enrolled + email loi moi"]
    K --> M["201 - roster Da moi hoac Dang hoc"]
    L --> M
```

## Flow 2: Kích hoạt bởi giáo viên (nút "Kích hoạt")

### Sequence — Kích hoạt bởi giáo viên

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant W as Web roster
    participant K as POST /api/enrollments/id/accept
    participant A as activateEnrollment
    participant M as materializeSchedule
    GV->>W: Bam "Kich hoat" tren dong invited
    W->>GV: Modal "Kich hoat hoc vien?" - noi sinh goi + lich
    GV->>W: Xac nhan "Kich hoat"
    W->>K: POST accept
    K->>A: activateEnrollment(orgId, enrollmentId)
    A->>A: Pre-read org-scoped - khong thay - 404 enrollment not found
    alt Da active truoc do
        A->>A: Backfill study-pack - tra ok (idempotent)
    else Van invited
        A->>A: CAS UPDATE SET active WHERE status invited
        A->>M: Sinh sessionPackage + lessons (guard retry x3)
        A->>A: Backfill study-pack target
    end
    K-->>W: 200 ok true
    W-->>GV: Toast "Da kich hoat hoc vien vao lop" - badge Dang hoc - 0/12 buoi
    Note over A,M: Lop khong thay - 404 class not found - activateNow loi thi 500 E-EL-004
```

### Activity — Kích hoạt bởi giáo viên

```mermaid
flowchart TD
    A["Bam Kich hoat + xac nhan"] --> B["POST /enrollments/id/accept"]
    B --> C{"Enrollment cung org?"}
    C -->|"khong"| D["404 enrollment not found"]
    C -->|"co"| E{"Da active?"}
    E -->|"co"| F["Backfill study-pack - 200 (khong tao them)"]
    E -->|"khong"| G{"Lop ton tai cung org?"}
    G -->|"khong"| H["error class - 404 class not found"]
    G -->|"co"| I["CAS UPDATE invited - active"]
    I --> J{"CAS thanh cong?"}
    J -->|"khong - request khac da flip"| F
    J -->|"co"| K["materialize goi + chuoi buoi - retry 3"]
    K --> L{"Guard pass?"}
    L -->|"co"| M["Insert package + lessons + holiday rows"]
    L -->|"khong 3 lan"| N["throw guard retry exhausted - 500"]
    M --> O["Backfill study-pack - 200"]
```

## Flow 3: Học viên chấp nhận từ portal (nút "Tham gia lớp")

### Sequence — Chấp nhận từ portal

```mermaid
sequenceDiagram
    actor HV as Hoc vien (portal)
    participant P as Portal trang chu / lop
    participant S as /api/student/enrollments/id/accept
    participant A as activateEnrollment
    HV->>P: Xem the lop tag "Cho kich hoat"
    P->>P: Mo ta "Giao vien da moi ban vao lop..."
    HV->>P: Bam "Tham gia lop"
    P->>S: POST accept (Origin + JSON bat buoc)
    S->>S: CSRF - Origin sai 403 - content-type sai 415
    S->>S: requireStudent - role khac student 403
    S->>S: So huu - enrollment.studentId = minh cung org
    alt Khong phai enrollment cua minh
        S-->>P: 404 enrollment not found - status giu invited
    else La cua minh
        S->>A: activateEnrollment (CUNG ham voi Flow 2)
        A->>A: CAS invited - active + goi + lessons + study-pack
        S-->>P: 200 ok true
        P->>P: Invalidate overview - the doi sang tien do + buoi toi
    end
    Note over S,A: Ket cuc giong Flow 2 - chi khac scoping dau vao
```

### Activity — Chấp nhận từ portal

```mermaid
flowchart TD
    A["The lop Cho kich hoat"] --> B["Bam Tham gia lop"]
    B --> C{"Origin + JSON hop le?"}
    C -->|"khong"| D["403 hoac 415"]
    C -->|"co"| E{"La hoc vien trong enrollment?"}
    E -->|"khong"| F["404 - status giu invited"]
    E -->|"co"| G["activateEnrollment"]
    G --> H{"Status?"}
    H -->|"invited"| I["CAS flip + sinh goi + buoi"]
    H -->|"active"| J["200 khong nhan doi"]
    I --> K["200 - invalidate overview"]
    J --> K
    K --> L["The lop hien tien do + buoi toi"]
```

## Flow 4: Hủy lời mời enrollment (chỉ invited)

### Sequence — Hủy lời mời

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant W as Web roster
    participant K as DELETE /api/enrollments/id
    GV->>W: Bam "Huy loi moi" tren dong invited
    W->>GV: Modal "Huy loi moi tham gia lop?" - xoa khoi danh sach moi
    GV->>W: Xac nhan "Huy loi moi"
    W->>K: DELETE /api/enrollments/{id}
    K->>K: Lookup org-scoped - khong thay - 404
    alt status khac invited (active)
        K-->>W: 409 cannot delete active enrollment
    else invited
        K->>K: DELETE row enrollment
        K-->>W: 200 ok true
        W-->>GV: Row bien mat - co the moi lai cung hoc vien
    end
    Note over K: Khong co trang thai cancelled - xoa han row - moi lai tao enrollment moi
```

### Activity — Hủy lời mời

```mermaid
flowchart TD
    A["Bam Huy loi moi"] --> B["Modal xac nhan"]
    B --> C["DELETE /enrollments/id"]
    C --> D{"Tim thay cung org?"}
    D -->|"khong"| E["404 enrollment not found"]
    D -->|"co"| F{"Status?"}
    F -->|"active"| G["409 cannot delete active enrollment"]
    F -->|"invited"| H["Xoa row enrollment"]
    H --> I["200 - roster mat dong"]
    I --> J["Mo lai duoc cung hoc vien - 201"]
```

## Flow 5: Hóa đơn / bài tập gặp enrollment chưa active (chặn)

### Sequence — Chặn khi chưa active

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant W as Web /tuition hoac Giao bai
    participant K as Kernel API
    GV->>W: Mo "Tao hoa don" hoac "Giao bai tap"
    W->>W: Picker/roster chi liet ke enrollment active (an invited)
    alt Van chon duoc invited qua API
        GV->>K: POST /api/invoices {enrollmentId cua invited}
        K->>K: Lookup org-scoped
        K-->>GV: 409 "Hoc vien chua dong y tham gia lop"
    else Giao bai chua invited
        GV->>K: POST /api/classes/id/assignments {studentIds co invited}
        K->>K: Roster active khong chua invited
        K-->>GV: 400 "student not enrolled"
    else Khong ton tai / khac org
        GV->>K: POST /api/invoices {enrollmentId la}
        K-->>GV: 404 "enrollment not found"
    end
    Note over W: UI chan truoc - picker an hoc vien invited (e2e create-invoice 219-248)
```

### Activity — Chặn khi chưa active

```mermaid
flowchart TD
    A["Muon lap hoa don / giao bai"] --> B{"Enrollment status?"}
    B -->|"active"| C["Cho phep - 201"]
    B -->|"invited"| D["Hoa don - 409 chua dong y tham gia lop"]
    B -->|"invited"| E["Giao bai - 400 student not enrolled"]
    B -->|"khong ton tai"| F["404 enrollment not found"]
    D --> G["Kich hoat hoc vien truoc (Flow 2)"]
    E --> G
    G --> C
```
