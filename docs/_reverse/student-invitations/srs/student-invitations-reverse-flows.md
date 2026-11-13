```markdown
---
type: reverse-srs-flows
feature: student-invitations
updated: 2026-11-11
---

# student-invitations — Flows tái lập (reverse)

> Mỗi flow bóc từ code; bước nào có trong code mới vẽ. Nhãn 🔵/🟡 đánh dấu bước suy đoán/cần xác nhận (chi tiết OQ ở `../reverse-gaps.md`).

## Flow 1: GV mời HV qua email (tạo lời mời + uniqueness per org+email)

### Sequence — GV mời học viên

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as API kernel
    participant DB as DB lời mời
    participant MAIL as Mailer ngoài
    GV->>API: Nhập email + bấm "Gửi lời mời"
    API->>API: Chuẩn hóa email trim + lowercase
    alt Email sai định dạng
        API-->>GV: 400 "invalid body" (E-009)
    else Email đã có hồ sơ trong org
        API-->>GV: 409 E-001 + callout gửi lại mời portal
    else Đang có lời mời pending
        API-->>GV: 409 E-002 + invitationId
    else Vừa thu hồi trong 60s
        API-->>GV: 429 E-003 + Retry-After
    else Mailer chưa cấu hình
        API-->>GV: 503 E-004
    end
    API->>DB: Insert lời mời pending
    API->>MAIL: Gửi email đồng bộ timeout 5s
    alt Gửi lỗi
        API->>DB: Xóa lời mời vừa tạo (trừ khi đã accepted)
        API-->>GV: 502 E-005
    else Gửi OK
        API-->>GV: 201 object lời mời + toast "Đã gửi lời mời tới {email}"
    end
    Note over API,DB: Trùng pending đồng thời bị chặn bởi unique index (race → 409 E-002)
```

### Activity — GV mời học viên

```mermaid
flowchart TD
    A["GV nhập email"] --> B{"Email hợp lệ?"}
    B -->|Không| E1["E-010 lỗi dưới field"]
    B -->|Có| C{"Đã có hồ sơ trong org?"}
    C -->|Có| E2["E-001 409 + callout"]
    C -->|Không| D{"Đang có pending?"}
    D -->|Có| E3["E-002 409 + nút gửi lại"]
    D -->|Không| F{"Cancel trong 60s gần nhất?"}
    F -->|Có| E4["E-003 429 Retry-After"]
    F -->|Không| G{"Mailer sẵn sàng?"}
    G -->|Không| E5["E-004 503"]
    G -->|Có| H["Insert pending + gửi mail 5s"]
    H --> I{"Gửi OK?"}
    I -->|Không| J["Xóa pending + E-005 502"]
    I -->|Có| K["201 + toast thành công"]
```

## Flow 2: GV gửi lại lời mời pending (resend, cooldown CAS)

### Sequence — Gửi lại lời mời

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as API kernel
    participant DB as DB lời mời
    participant MAIL as Mailer ngoài
    GV->>API: Bấm "Gửi lại lời mời" trên lời mời pending
    API->>DB: Đọc lời mời theo id + org
    alt Không phải pending
        API-->>GV: 404 E-006 (web tự refresh danh sách)
    else Trong cooldown updatedAt
        API-->>GV: 429 E-003 + Retry-After
    end
    API->>DB: CAS update updatedAt (WHERE pending AND updatedAt cũ)
    alt CAS thua
        API->>DB: Đọc lại
        API-->>GV: 404 E-006 hoặc 429 tối thiểu 1s
    else CAS thắng
        API->>MAIL: Gửi email với key mới student_invite id resend token
        alt Gửi lỗi
            API->>DB: Hoàn nguyên updatedAt cũ
            API-->>GV: 502 E-005
        else OK
            API-->>GV: 200 ok true + updatedAt mới + toast "Đã gửi lại lời mời tới {email}"
        end
    end
    Note over API: Mỗi lần resend sinh token ngẫu nhiên nên idempotency key không trùng
```

### Activity — Gửi lại lời mời

```mermaid
flowchart TD
    A["Bấm Gửi lại lời mời"] --> B{"Lời mời pending?"}
    B -->|Không| E1["E-006 404 + refresh"]
    B -->|Có| C{"Vượt 60s từ lần gửi trước?"}
    C -->|Không| E2["E-003 429 + đếm ngược"]
    C -->|Có| D{"CAS claim updatedAt"}
    D -->|Thua| E3["429 tối thiểu 1s hoặc 404"]
    D -->|Thắng| E{"Gửi mail OK?"}
    E -->|Không| F["Hoàn nguyên updatedAt + 502"]
    E -->|Có| G["200 + toast thành công"]
```

## Flow 3: GV thu hồi lời mời pending (cancel)

### Sequence — Thu hồi lời mời

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as API kernel
    participant DB as DB lời mời
    GV->>API: Bấm "Thu hồi" trên lời mời pending
    alt Role không đủ quyền
        API-->>GV: 403 E-008
    else Lời mời không pending
        API-->>GV: 404 E-006
    else OK
        API->>DB: Update status canceled + updatedAt
        API-->>GV: 200 ok true + toast "Đã thu hồi lời mời tới {email}"
    end
    Note over DB: Dòng được GIỮ LẠI với status canceled, không xóa; mời lại trong 60s kể từ createdAt sẽ 429
```

### Activity — Thu hồi lời mời

```mermaid
flowchart TD
    A["Bấm Thu hồi"] --> B{"Role đủ quyền?"}
    B -->|Không| E1["E-008 403"]
    B -->|Có| C{"Lời mời pending?"}
    C -->|Không| E2["E-006 404"]
    C -->|Có| D["Đánh dấu canceled"]
    D --> F["Toast thu hồi thành công"]
    F --> G["Mời lại trong 60s sẽ 429 E-003"]
```

## Flow 4: HV nhận thông báo + chấp nhận (cross-portal hop — trọng tâm)

### Sequence — Học viên chấp nhận lời mời

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant Portal as Student Portal
    participant API as API portal
    participant DB as DB hồ sơ + lời mời
    Note over HV,Portal: HV nhận email lời mời rồi đăng ký hoặc đăng nhập portal bằng đúng email
    HV->>Portal: Đăng nhập (email đã xác thực)
    Portal->>API: GET /api/student/me
    alt Chưa có hồ sơ (chỉ có lời mời pending)
        API-->>Portal: 403 NOT_LINKED
        Portal->>HV: Màn "Tài khoản chưa được liên kết" hướng dẫn bấm chuông
    end
    Portal->>API: GET /api/student/notifications (poll 15s)
    API-->>Portal: Lời mời pending + tên org + tên người mời
    HV->>Portal: Bấm chuông rồi "Chấp nhận"
    Portal->>API: POST /api/student/invitations/:id/accept
    alt Lời mời không pending hoặc sai email
        API-->>Portal: 404 E-006
    else OK
        API->>DB: Update lời mời sang accepted
        API->>DB: Org đích chưa có hồ sơ → insert hồ sơ mới
        API-->>Portal: 200 ok + orgId
    end
    Portal->>Portal: localStorage org active = orgId mới + invalidate queries
    Portal->>HV: Toast "Đã tham gia {orgName}" + điều hướng /onboarding nếu chưa onboarding
    Note over DB: Provisioning KHÔNG tự cấp hồ sơ khi còn pending invitation nên HV phải accept để có hồ sơ
```

### Activity — Học viên chấp nhận lời mời

```mermaid
flowchart TD
    A["HV đăng nhập portal"] --> B{"Email đã xác thực?"}
    B -->|Không| E1["Màn Email chưa được xác thực E-013"]
    B -->|Có| C{"Có hồ sơ học viên?"}
    C -->|"Không có + còn lời mời"| D["Màn Tài khoản chưa liên kết E-012"]
    C -->|Có| E["Vào portal"]
    D --> F["Bấm chuông xem Lời mời"]
    E --> F
    F --> G{"Bấm Chấp nhận?"}
    G -->|Từ chối| H["Flow 5"]
    G -->|Chấp nhận| I{"Lời mời pending + đúng email?"}
    I -->|Không| E2["E-006 404"]
    I -->|Có| J["Lời mời accepted + tạo hồ sơ nếu thiếu"]
    J --> K["Org active chuyển sang org mới"]
    K --> L{"Đã onboarding?"}
    L -->|Chưa| M["Điều hướng /onboarding"]
    L -->|Rồi| N["Overview org mới"]
```

## Flow 5: HV từ chối lời mời

### Sequence — Học viên từ chối

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant Portal as Student Portal
    participant API as API portal
    participant DB as DB lời mời
    HV->>Portal: Bấm "Từ chối" trên lời mời
    Portal->>API: POST /api/student/invitations/:id/reject
    alt Lời mời không pending hoặc sai email
        API-->>Portal: 404 E-006
    else OK
        API->>DB: Update status rejected
        API-->>Portal: 200 ok true
    end
    Portal->>Portal: Refresh danh sách lời mời
    Note over DB: Không tạo hồ sơ nào; GV không nhận thông báo nào (OQ-4)
    Note over DB: GV mời lại email rejected không bị cooldown 60s (BR-012 🔵)
```

### Activity — Học viên từ chối

```mermaid
flowchart TD
    A["Bấm Từ chối"] --> B{"Lời mời pending + đúng email?"}
    B -->|Không| E1["E-006 404"]
    B -->|Có| C["Status rejected"]
    C --> D["Không tạo hồ sơ"]
    D --> E["Chuông hết hiện lời mời này"]
    E --> F["GV mời lại được ngay, không cooldown 🔵"]
```

## Flow 6: HV chuyển org đang hoạt động (org switcher + header)

### Sequence — Chuyển org

```mermaid
sequenceDiagram
    actor HV as Học viên
    participant Portal as Student Portal shell
    participant API as API portal
    HV->>Portal: Mở org switcher "Tổ chức học tập"
    Portal->>API: GET /api/student/orgs
    API-->>Portal: Danh sách org có hồ sơ + cờ isCurrent (mặc định hồ sơ mới nhất)
    HV->>Portal: Chọn org khác
    Portal->>Portal: localStorage org active = orgId mới + invalidate query student
    Portal->>API: Request tiếp theo kèm header x-student-org-id
    API->>API: Guard khớp header với hồ sơ của chính session
    alt Header không khớp hồ sơ nào
        API->>API: Lặng lẽ dùng hồ sơ mới nhất (không lỗi)
    end
    API-->>Portal: Dữ liệu theo org đã chọn
    Note over Portal,API: Thẻ audio/video và link tải dùng dự phòng ?org= vì không gửi được header
```

### Activity — Chuyển org

```mermaid
flowchart TD
    A["Mở org switcher"] --> B{"Có nhiều hơn 1 org?"}
    B -->|Không| C["Hiển thị org duy nhất"]
    B -->|Có| D["Chọn org"]
    D --> E["Lưu org active vào localStorage"]
    E --> F["Invalidate query student"]
    F --> G["Request kèm x-student-org-id"]
    G --> H{"Header khớp hồ sơ session?"}
    H -->|Có| I["Dữ liệu org đã chọn"]
    H -->|Không| J["Fallback hồ sơ mới nhất, không 403"]
```

## Flow 7: GV tạo học viên thủ công cùng email → auto-accept lời mời pending

### Sequence — Tạo HV thủ công tự động chấp nhận lời mời

```mermaid
sequenceDiagram
    actor GV as Giáo viên
    participant API as API kernel
    participant DB as DB hồ sơ + lời mời
    GV->>API: POST /api/students (tên + email)
    alt Email trùng hồ sơ trong org
        API-->>GV: 409 E-009 "Email này đã được dùng cho học viên {name}"
    else OK
        API->>DB: Batch insert hồ sơ + update lời mời pending sang accepted
        API->>API: Gửi email mời portal best-effort
        API-->>GV: 201 + inviteEmailSent
    end
    Note over DB: HV đăng nhập portal sau đó tự khớp hồ sơ theo email đã xác thực
```

### Activity — Tạo HV thủ công auto-accept

```mermaid
flowchart TD
    A["Thêm học viên với email"] --> B{"Email trùng hồ sơ trong org?"}
    B -->|Có| E1["E-009 409"]
    B -->|Không| C["Batch insert hồ sơ + auto-accept lời mời pending"]
    C --> D{"Có enrollment kèm theo?"}
    D -->|Có| E["Tạo enrollment invited và mời portal hoặc kích hoạt"]
    D -->|Không| F["Gửi mời portal best-effort"]
```
```
