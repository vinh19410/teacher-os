# srs/notifications-teacher-reverse-flows — notifications-teacher

Mỗi flow có CẢ HAI diagram (sequence + flowchart). Chỉ vẽ bước có trong code; bước suy đoán không vẽ, ghi ở reverse-gaps. Wording người dùng trích NGUYÊN VĂN từ throw-site/render.

Ghi chú về kiểm thử mermaid: 14/14 khối PASS; 25 cảnh báo NGHĨA còn lại đều là node terminal không có cạnh đi tiếp trong flowchart (điểm kết thúc thật của luồng: toast, empty-state, return lỗi, 404, hộp thoại đóng) — không phải thiếu bước.

## F1 — Xem nhật ký thông báo (GET /api/notification-logs)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Web as Man hinh /notifications
    participant Repo as repos/notifications
    participant API as GET /api/notification-logs
    participant DB as D1
    GV->>Web: mo /notifications (q, event, status, page song tren URL)
    Web->>Web: validateNotificationsSearch - gia tri le ve undefined - page duoi 2 bo
    Web->>Repo: notificationLogsQueryOptions(queryParams)
    Repo->>API: GET /api/notification-logs voi credentials include
    API->>API: read kernelCtx - thieu thi 401 unauthorized
    API->>API: notificationLogQuerySchema.safeParse - lech thi 400 invalid query
    API->>DB: read rows - inner join student - where orgId + q + event + status - order created_at desc, id desc - limit 20 offset
    API->>DB: read total - cung where voi rows
    API->>DB: read counts - where chi q + event - group by status
    DB-->>API: rows + total + statusGroups
    API->>API: doi createdAt, sentAt, readAt sang ISO - counts.all la tong cac nhom
    API-->>Repo: NotificationLogResponse
    Repo->>Repo: notificationLogResponseSchema.parse
    Repo-->>Web: rows + total + counts + page + pageSize 20
    Web-->>GV: bang 6 cot + chip badge dem + phan trang server-side
    note right of Web : loi 401 goi reauth - loi khac hien "Khong tai duoc nhat ky thong bao. Thu tai lai trang."
```

```mermaid
flowchart TD
    A["GV mở /notifications"] --> B["validateNotificationsSearch"]
    B -->|"giá trị lạ"| C["về mặc định, bỏ khỏi URL"]
    B -->|"hợp lệ"| D["GET /api/notification-logs"]
    C --> D
    D --> E{"kernelCtx tồn tại?"}
    E -->|"không"| F["401 unauthorized → reauth()"]
    E -->|"có"| G{"zod parse query đạt?"}
    G -->|"không"| H["400 invalid query"]
    G -->|"đạt"| I{"có q?"}
    I -->|"có"| J["escape phần trăm gạch dưới, LIKE 4 trường: student.name + recipient_email + student.email (khi có kênh email) + title"]
    I -->|"không"| K["lọc orgId + event + status"]
    J --> L["3 query song song: rows limit 20 offset + total + counts theo q + event"]
    K --> L
    L --> M{"counts.all = 0 và không có filter?"}
    M -->|"có"| N["empty-state toàn cục: Chưa có thông báo nào"]
    M -->|"không"| O{"rows rỗng?"}
    O -->|"có"| P["Không có thông báo nào phù hợp với bộ lọc."]
    O -->|"không"| Q["render bảng + chip badge + phân trang"]
```

Nguồn: apps/server/src/routes/notification-logs.ts:71-189; apps/server/src/lib/notifications/requeue.ts:19-59; packages/api/src/contracts.ts:3946-3987; apps/web/src/routes/_auth/notifications/index.tsx:56-90, apps/web/src/routes/_auth/notifications/index.tsx:186-204, apps/web/src/routes/_auth/notifications/index.tsx:319-345, apps/web/src/routes/_auth/notifications/index.tsx:368-450; apps/web/src/lib/repos/notifications.ts:29-59; test: apps/server/src/routes/notification-logs.test.ts:169-317, apps/web/src/routes/_auth/notifications/index.test.tsx:128-318; E2E: apps/e2e/specs/notifications-ac-001.spec.ts:196-409.

## F2 — Xem chi tiết một thông báo (chỉ client)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Row as Hang bang (moi trang thai)
    participant Dialog as NotificationDetailDialog
    GV->>Row: bam nut eye - aria-label "Xem chi tiết thông báo cho {tên}"
    Row->>Dialog: setDetailRow(row) - Modal title = row.title
    Dialog-->>GV: body pre-wrap + Người nhận + Người gửi + Reply-To + Gửi lúc + Đọc lúc + Số lần thử lại "N/3 lần thử" + Lỗi gửi (chi khi co last_error)
    GV->>Dialog: dong modal
    Dialog-->>Row: onClose → setDetailRow(null)
```

```mermaid
flowchart TD
    A["Bấm nút eye trên dòng"] --> B["mở Modal title = tiêu đề thông báo"]
    B --> C["hiển thị nội dung + metadata gửi"]
    C --> D{"giá trị thời gian null?"}
    D -->|"null"| E["hiển thị gạch ngang"]
    D -->|"có"| F["định dạng vi-VN, Asia/Ho_Chi_Minh"]
    E --> G["đóng → về bảng không đổi dữ liệu"]
    F --> G
```

Nguồn: apps/web/src/routes/_auth/notifications/index.tsx:188, apps/web/src/routes/_auth/notifications/index.tsx:540-547, apps/web/src/routes/_auth/notifications/index.tsx:604-610; apps/web/src/components/notifications/notification-detail-dialog.tsx:35-89; test: apps/web/src/routes/_auth/notifications/index.test.tsx:224-272.

## F3 — Gửi lại một thông báo lỗi (POST /:id/resend)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Web as Man hinh /notifications
    participant API as POST /api/notification-logs/:id/resend
    participant DB as D1
    participant Del as deliverNotifications (nen)
    GV->>Web: bam nut "Gửi lại" tren dong failed
    Web->>API: POST /:id/resend body "{}" credentials include
    API->>API: read kernelCtx - thieu thi 401
    API->>DB: read ban ghi theo orgId + id - join student
    API->>API: khong thay → 404 not_found - status khac failed → 409 not_failed
    API->>API: student.email trim rong → 200 requeued 0 kèm skipped reason no_email
    API->>DB: update status queued + retry_count 0 + last_error null + recipient_email = email hien tai + channels nang cap CASE
    API->>Del: triggerResendDelivery(requeuedIds) - runInBackground hoac await
    Del-->>API: ket qua theo F6
    API-->>Web: 200 { requeued, skipped, remaining }
    Web->>Web: formatResendToast → toast + invalidateQueries(notificationLogsAllQueryKey)
    Web-->>GV: toast "Đã đưa N thông báo về hàng đợi để gửi lại."
```

```mermaid
flowchart TD
    A["Bấm Gửi lại trên dòng failed"] --> B["POST /:id/resend"]
    B --> C{"bản ghi thuộc org và tồn tại?"}
    C -->|"không"| D["404 not_found → toast: Không thể gửi lại thông báo. Vui lòng thử lại."]
    C -->|"có"| E{"status = failed?"}
    E -->|"không"| F["409 not_failed → toast: Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi."]
    E -->|"có"| G{"student.email trống?"}
    G -->|"có"| H["200 skipped no_email → toast lỗi: Bỏ qua 1 thông báo do học viên chưa có email."]
    G -->|"không"| I["reset queued, retry 0, email hiện tại, nâng kênh"]
    I --> J["deliverNotifications tối đa 3 lượt (F6)"]
    J --> K["toast thành công + làm mới danh sách"]
```

Nguồn: apps/server/src/routes/notification-logs.ts:50-69, apps/server/src/routes/notification-logs.ts:221-239; apps/server/src/lib/notifications/requeue.ts:61-142; apps/web/src/routes/_auth/notifications/index.tsx:147-168, apps/web/src/routes/_auth/notifications/index.tsx:206-231, apps/web/src/routes/_auth/notifications/index.tsx:523-539; test: apps/server/src/routes/notification-logs.test.ts:453-648, apps/server/src/routes/notification-logs.test.ts:769-802; E2E: apps/e2e/specs/notifications-ac-003.spec.ts:130-386.

## F4 — Gửi lại tất cả mục lỗi theo bộ lọc (POST /resend-failed)

```mermaid
sequenceDiagram
    actor GV as Giao vien
    participant Web as Man hinh /notifications
    participant Modal as Modal "Gửi lại tất cả thông báo lỗi?"
    participant API as POST /api/notification-logs/resend-failed
    participant DB as D1
    participant Del as deliverNotifications (nen)
    GV->>Web: thay nut "Gửi lại tất cả mục lỗi (N)" khi counts.failed > 0
    GV->>Modal: bam nut mo modal xac nhan
    alt Hủy
        GV->>Modal: Hủy
        Modal-->>Web: đóng - không gọi API
    else Xác nhận gửi lại
        GV->>Modal: "Xác nhận gửi lại"
        Modal->>API: POST /resend-failed body { q, event } - khong nhan status
        API->>API: read kernelCtx - 401; body JSON hỏng → 400 invalid json; lệch schema strict → 400 invalid body
        API->>DB: read eligible failed + email hợp lệ theo q + event - limit 50 mới nhất
        API->>DB: read tổng eligible + read danh sách no_email tách riêng
        API->>DB: update loạt queued + retry 0 + email hiện tại + nâng kênh - WHERE status failed
        API->>Del: triggerResendDelivery(requeuedIds)
        API-->>Web: 200 { requeued, skipped no_email, remaining = eligible - requeued }
        Web-->>GV: toast theo formatResendToast + đóng modal + làm mới
    end
```

```mermaid
flowchart TD
    A["counts.failed > 0"] --> B["nút header: Gửi lại tất cả mục lỗi (N)"]
    B --> C["mở Modal xác nhận"]
    C --> D{"lựa chọn"}
    D -->|"Hủy"| E["đóng, 0 request"]
    D -->|"Xác nhận gửi lại"| F["POST /resend-failed { q, event }"]
    F --> G{"body đạt schema strict?"}
    G -->|"JSON hỏng"| H["400 invalid json"]
    G -->|"thừa/thiếu trường"| I["400 invalid body"]
    G -->|"đạt"| J["chọn tối đa 50 dòng failed mới nhất có email hợp lệ"]
    J --> K["reset loạt + tách no_email vào skipped"]
    K --> L["deliver lại + trả remaining"]
    L --> M{"requeued = 0 và skipped > 0?"}
    M -->|"có"| N["toast lỗi: Bỏ qua N thông báo do học viên chưa có email."]
    M -->|"không"| O["toast thành công + số bỏ qua + số còn lại"]
```

Nguồn: apps/server/src/routes/notification-logs.ts:191-219; apps/server/src/lib/notifications/requeue.ts:144-233; packages/api/src/contracts.ts:3989-4016; apps/web/src/routes/_auth/notifications/index.tsx:233-254, apps/web/src/routes/_auth/notifications/index.tsx:337-365, apps/web/src/routes/_auth/notifications/index.tsx:612-644; test: apps/server/src/routes/notification-logs.test.ts:319-452, apps/server/src/routes/notification-logs.test.ts:649-768; E2E: apps/e2e/specs/notifications-ac-003.spec.ts:130-386.

## F5 — Dòng nhật ký xuất hiện từ nghiệp vụ gốc (boundary — emit/enqueue)

```mermaid
sequenceDiagram
    participant Rt as Route nghiep vu (enroll, giao bai, cham bai, hoa don, nhac no, doi lich, nghi le)
    participant Em as emitNotifications (notify)
    participant En as enqueueNotifications
    participant DB as D1
    participant Dl as deliverNotifications (nen)
    Rt->>Rt: ghi nghiep vu goc thanh cong
    Rt->>Em: notify(orgId, events) sau khi ghi, truoc khi return json
    Em->>En: enqueue(db, orgId, events)
    En->>DB: read email hoc vien trong org (chunk 50)
    En->>DB: read resolveOrgMailSender - ten org + email chu org som nhat
    En->>En: bo qua hoc vien khac org - co email → channels email,in_app - khong → in_app
    En->>En: khong email → status sent ngay, sent_at = luc tao
    En->>DB: insert notification_record onConflictDoNothing chunk 50 - unique org_id + idempotency_key
    En-->>Em: createdIds
    Em->>Dl: deliverNotifications(createdIds) - runInBackground hoac await
    note right of Em : loi emit bi nuot (fail-open) - nghiep vu goc van tra 2xx
```

```mermaid
flowchart TD
    A["Route nghiệp vụ ghi thành công"] --> B["dựng NotificationEvent (templates.ts)"]
    B --> C["notify / emitNotifications"]
    C --> D{"enqueue lỗi?"}
    D -->|"có"| E["console.error - nghiệp vụ gốc vẫn 2xx"]
    D -->|"không"| F["resolve email + sender → chèn dòng, bỏ qua trùng khóa"]
    F --> G{"học viên có email?"}
    G -->|"có"| H["channels email,in_app - status queued"]
    G -->|"không"| I["channels in_app - status sent ngay"]
    H --> J["deliver nền (F6)"]
    I --> K["dòng sẵn sàng trên nhật ký với trạng thái Đã gửi"]
    E --> L["không có dòng mới trên nhật ký"]
```

Nguồn: apps/server/src/routes/kernel.ts:337-345, apps/server/src/routes/kernel.ts:638-660, apps/server/src/routes/kernel.ts:1617-1626, apps/server/src/routes/kernel.ts:3101-3108, apps/server/src/routes/kernel.ts:3392-3480; apps/server/src/routes/grading.ts:1113-1131; apps/server/src/routes/assignments/index.ts:180-191; apps/server/src/routes/holidays.ts:636-671; apps/server/src/lib/notifications/emit.ts:61-91; apps/server/src/lib/notifications/enqueue.ts:20-80; apps/server/src/lib/notifications/templates.ts:40-193; apps/server/src/lib/notifications/org-mail-sender.ts:16-43; test: apps/server/src/kernel.test.ts:7446-7844, apps/server/src/lib/notifications/notifications.test.ts:33-516, apps/server/src/routes/debt-reminders.test.ts:1-395.

## F6 — Vòng gửi email tối đa 3 lượt (boundary — deliver)

```mermaid
sequenceDiagram
    participant Dl as deliverNotifications
    participant DB as D1
    participant Ml as Mailer (Resend)
    loop pass 1 den 3 (MAX_EMAIL_ATTEMPTS)
        Dl->>DB: re-select queued + retry_count < 3 dau moi luot
        Dl->>Ml: send to, subject = title, html/text render, Idempotency-Key, replyTo, fromName
        alt gui OK
            Ml-->>Dl: 2xx
            Dl->>DB: update status = CASE read_at null → sent, nguoc lai read + sent_at = now + last_error = null
        else gui loi
            Ml-->>Dl: throw
            Dl->>Dl: sanitizeDeliveryError - redact Bearer va re_..., cat ≤ 500 ky tu
            Dl->>DB: update retry_count + 1 - cham 3 → status failed + last_error E-selfomy-alignment-010
        end
        Dl->>Dl: con luot → cho retryDelaysMs (mac dinh 2s, 5s) roi lam luot ke
    end
    note right of Dl : vang mailer → giu queued + console.warn - khong co gi bi danh failed
```

```mermaid
flowchart TD
    A["deliverNotifications(ids)"] --> B{"có mailer?"}
    B -->|"không"| C["console.warn - giữ queued"]
    B -->|"có"| D["pass 1: re-select queued retry < 3 có kênh email"]
    D --> E{"mailer OK?"}
    E -->|"có"| F["status = read_at null ? sent : read + sent_at + last_error null"]
    E -->|"không"| G["sanitize lỗi + retry_count + 1"]
    G --> H{"retry_count + 1 >= 3?"}
    H -->|"có"| I["status failed + last_error E-selfomy-alignment-010"]
    H -->|"không"| J["giữ queued, chờ 2s hoặc 5s → pass kế"]
    J --> D
    F --> K["bỏ qua dòng không có kênh email hoặc thiếu recipientEmail"]
```

Nguồn: apps/server/src/lib/notifications/deliver.ts:12-53, apps/server/src/lib/notifications/deliver.ts:111-231; packages/api/src/contracts.ts:3940-3943; packages/auth/src/mail/mailer.ts:52-130; test: apps/server/src/lib/notifications/notifications.test.ts:180-463, apps/server/src/lib/notifications/notifications.test.ts:255-299; E2E: apps/e2e/specs/notifications-ac-002.spec.ts:91-241.

## F7 — Học viên đọc in-app → dòng nhật ký chuyển "Đã xem" (boundary)

```mermaid
sequenceDiagram
    actor HV as Hoc vien (student portal)
    participant API as /api/student/inbox
    participant DB as D1
    HV->>API: GET /api/student/inbox (requireStudent)
    API->>DB: read 50 dong moi nhat cua chinh HV trong org - khong tra recipient_email, reply_to_email, last_error
    API-->>HV: items + unread (dem read_at null)
    HV->>API: POST /api/student/inbox/:id/read
    API->>DB: read ban ghi theo id + orgId + studentId
    API->>API: khong thay → 404 "Không tìm thấy thông báo"
    alt read_at con null
        API->>DB: update read_at = now - chi status sent → read - queued va failed giu nguyen
    else da co read_at
        API-->>HV: { ok: true } - khong ghi lai
    end
    note right of API : GV thay dong chuyen "Đã xem" tai cot Trang thai man /notifications
```

```mermaid
flowchart TD
    A["Học viên mở thông báo trên cổng"] --> B["POST /api/student/inbox/:id/read"]
    B --> C{"bản ghi thuộc HV trong org?"}
    C -->|"không"| D["404 Không tìm thấy thông báo"]
    C -->|"có"| E{"read_at null?"}
    E -->|"không"| F["200 ok, không ghi lại"]
    E -->|"có"| G["read_at = now"]
    G --> H{"status = sent?"}
    H -->|"có"| I["status = read → nhật ký GV: Đã xem"]
    H -->|"không"| J["giữ status (queued chờ deliver, failed giữ nguyên)"]
```

Nguồn: apps/server/src/routes/student.ts:755-841; packages/api/src/contracts.ts:4018-4036; apps/server/src/lib/notifications/deliver.ts:193-207; test: apps/server/src/routes/student-inbox.test.ts:1-329, apps/server/src/lib/notifications/notifications.test.ts:420-450.
