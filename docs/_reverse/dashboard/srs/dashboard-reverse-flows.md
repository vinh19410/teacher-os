# dashboard — Flows (reverse)

> Mỗi flow có sequenceDiagram + flowchart. Nguồn chính: apps/web/src/routes/_auth/dashboard.tsx, apps/server/src/routes/dashboard-reminders.ts, apps/server/src/app.ts, apps/web/src/lib/repos/dashboard-reminders.ts.

## F1 — Mở dashboard và tải dữ liệu tổng hợp

**Chuẩn bị:** giáo viên đã có session (đăng nhập); org được bootstrap tự động nếu trống (apps/server/src/app.ts:278-291).

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant WEB as Web route /dashboard
    participant API as API server
    GV->>WEB: Mở /dashboard (hoặc redirect từ /)
    WEB->>WEB: _auth beforeLoad kiem tra session
    alt Chưa đăng nhập
        WEB-->>GV: Chuyển hướng /login (returnUrl)
    else Đã đăng nhập
        WEB->>API: GET /api/kernel (snapshot org)
        API-->>WEB: 200 snapshot (students, classes, lessons, invoices, assignments)
        WEB->>WEB: KPI + lịch hôm nay + lịch sắp tới + Cần kiểm tra (client-side)
        WEB->>API: GET /api/dashboard/reminders (chỉ khi dataUpdatedAt > 0)
        API->>API: resolveReminderScope(role)
        API->>API: computeReminders (3 nhóm truy vấn)
        API-->>WEB: 200 JSON (date, attendance, overdueGrading, tuition?)
        WEB->>WEB: Parse zod contract
        WEB-->>GV: 3 thẻ việc cần làm
    end
```

```mermaid
flowchart TD
    A["GV mở /dashboard"] --> B{"Có session?"}
    B -->|Không| C["Chuyển hướng /login"]
    B -->|Có| D["Tải kernel snapshot GET /api/kernel"]
    D --> E{"dataUpdatedAt > 0?"}
    E -->|Chưa| F["Giữ skeleton 3 thẻ (aria-busy)"]
    E -->|Có| G["GET /api/dashboard/reminders"]
    G --> H{"Kết quả fetch?"}
    H -->|Lỗi| I["Hiện 'Không tải được bộ đếm nhắc việc.' + nút Thử lại"]
    H -->|Thành công| J["Render 3 thẻ + tiêu đề theo ngày"]
    J --> K["Render 4 KPI + Lịch hôm nay + Lịch sắp tới + Cần kiểm tra"]
    I -->|"bấm Thử lại"| G
```

Nguồn: apps/web/src/routes/_auth/dashboard.tsx:67-164, apps/web/src/routes/_auth/dashboard.tsx:167-296; apps/web/src/routes/index.tsx:3-7; apps/web/src/routes/_auth/route.tsx:6-37; apps/e2e/specs/login.smoke.spec.ts:10-18 (sign-up dẫn tới dashboard với org bootstrap).

## F2 — Bấm thẻ nhắc việc → màn đích đã lọc (AC-001)

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant WEB as Web app
    GV->>WEB: Bấm toàn thẻ (1 điểm bấm, link inset-0)
    alt Thẻ ca học chưa điểm danh
        WEB-->>GV: /attendance?date=hôm-nay-VN&status=pending
    else Thẻ bài quá hạn chấm
        WEB-->>GV: /grading?status=awaiting
    else Thẻ học phí
        WEB-->>GV: /tuition
    end
```

```mermaid
flowchart TD
    A["Bấm thẻ nhắc việc"] --> B{"Thẻ nào?"}
    B -->|Ca học| C["Đích /attendance?date=&status=pending"]
    B -->|Chấm bài| D["Đích /grading?status=awaiting"]
    B -->|Học phí| E["Đích /tuition"]
    C --> F["Màn Điểm danh tổng theo ngày, lọc sẵn pending"]
    D --> G["Màn Không gian chấm, lọc sẵn awaiting"]
    E --> H["Màn Sổ học phí (guard tài chính ở màn đích)"]
```

Nguồn: apps/web/src/components/dashboard/reminder-cards.tsx:45-77, apps/web/src/components/dashboard/reminder-cards.tsx:96-104; e2e assert URL apps/e2e/specs/dashboard-reminders.spec.ts:143-163.

## F3 — Server tính bộ đếm reminders

```mermaid
sequenceDiagram
    participant WEB as Web app
    participant MW as Middleware bootstrap
    participant RT as GET /api/dashboard/reminders
    WEB->>MW: Request kèm cookie session
    alt Chưa đăng nhập
        MW-->>WEB: 401 unauthorized
    else Session role student
        MW-->>WEB: 403 ACCOUNT_STUDENT_ROLE (không bootstrap org)
    else Session role admin
        MW-->>WEB: 403 ACCOUNT_ADMIN_ROLE
    else Teacher hợp lệ
        MW->>RT: kernelCtx {orgId, userId, role}
        RT->>RT: resolveReminderScope(role) - luôn kind=org, finance=canAccessFinance(role)
        RT->>RT: Ca hôm nay: lesson upcoming + dated(date=today) hoặc legacy(day=weekday ISO)
        RT->>RT: Bài quá hạn: quizAttempt submitted + grade null + submittedAt < now-24h
        RT->>RT: Hóa đơn (nếu finance): due khác rỗng, due <= today+7, chưa thu đủ
        RT->>RT: Parse lại qua dashboardRemindersResponseSchema
        RT-->>WEB: 200 JSON (tuition bỏ hẳn khi finance=false)
    end
```

```mermaid
flowchart TD
    A["Request GET /api/dashboard/reminders"] --> B{"Session hợp lệ?"}
    B -->|Không có session| C["401 unauthorized"]
    B -->|role student| D["403 ACCOUNT_STUDENT_ROLE"]
    B -->|role admin| E["403 ACCOUNT_ADMIN_ROLE"]
    B -->|teacher| F["resolveReminderScope(role)"]
    F --> G{"finance = canAccessFinance(role)?"}
    G -->|"false (ta / class_teacher)"| H["Tính attendance + overdueGrading, bỏ block tuition"]
    G -->|true| I["Tính attendance + overdueGrading + tuition"]
    H --> J["Parse zod .strict()"]
    I --> J
    J --> K["200 JSON"]
```

Nguồn: apps/server/src/routes/dashboard-reminders.ts:80-300; apps/server/src/app.ts:202-303; test apps/server/src/routes/dashboard-reminders.test.ts:585-622.

## F4 — Tự làm mới bộ đếm theo vòng đời kernel snapshot

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant BUS as Kernel command bus
    participant Q as TanStack Query
    participant RT as GET /api/dashboard/reminders
    GV->>BUS: Thao tác kernel (vd check-in / thu tiền)
    BUS->>BUS: refetchQueries exact:true trên ["kernel"]
    BUS-->>Q: Snapshot mới - dataUpdatedAt thay đổi
    Q->>Q: Query key reminders mới (kèm timestamp) - staleTime Infinity
    Q->>RT: Tự refetch
    RT-->>Q: Bộ đếm mới
    Q-->>GV: 3 thẻ cập nhật
```

```mermaid
flowchart TD
    USER(["Giáo viên"]) --> A["Thực hiện action kernel"]
    USER --> H["Bấm nút 'Làm mới dữ liệu' hoặc 'Thử lại'"]
    A --> B["Refresh snapshot exact trên key kernel"]
    B --> C{"dataUpdatedAt đổi?"}
    C -->|Không| D["Giữ nguyên bộ đếm"]
    C -->|Có| E["Query key reminders mới khác key cũ"]
    E --> F["TanStack Query tự refetch"]
    F --> G["Render bộ đếm mới"]
    H --> I["refetch thủ công"]
    I --> G
```

Nguồn: apps/web/src/lib/repos/dashboard-reminders.ts:16-24; apps/web/src/routes/_auth/dashboard.tsx:81-96, apps/web/src/routes/_auth/dashboard.tsx:135-142; test refetch apps/web/src/routes/_auth/dashboard.test.tsx:248-282.

## F5 — Chặn tài khoản sai app (student/admin)

```mermaid
sequenceDiagram
    participant CL as Trình duyệt (cookie chung)
    participant MW as Middleware bootstrap
    participant UI as Web UI
    CL->>MW: Session student/admin chạm kernel tree
    alt role student
        MW-->>CL: 403 ACCOUNT_STUDENT_ROLE
    else role admin
        MW-->>CL: 403 ACCOUNT_ADMIN_ROLE
    end
    CL->>UI: Fetch snapshot lỗi 403 (mã trong reason)
    UI->>UI: isStudentRoleRejected nhận diện mã
    UI-->>UI: Blocked view thay workspace
```

```mermaid
flowchart TD
    A["Session truy cập app giáo viên"] --> B{"user.role?"}
    B -->|student| C["403 ACCOUNT_STUDENT_ROLE"]
    B -->|admin| D["403 ACCOUNT_ADMIN_ROLE"]
    B -->|"teacher / owner"| E["Cho phép - tiếp tục dashboard"]
    C --> F["Blocked view 'Đây là tài khoản học viên' + Đăng xuất"]
    D --> F
    F --> G["DB không tăng org / membership"]
```

Nguồn: apps/server/src/app.ts:221-242; apps/web/src/lib/repos/kernel.ts:718-726 (isStudentRoleRejected); e2e apps/e2e/specs/account-role-separation.spec.ts:120-150.
