```markdown
---
type: reverse-usecase
feature: student-invitations
uc: UC-02 — Quản lý lời mời đang chờ (danh sách / gửi lại / thu hồi)
status: draft
updated: 2026-11-11
links:
  - docs/_reverse/student-invitations/student-invitations-reverse-spec.md
  - docs/_reverse/student-invitations/usecases/student-invitations-reverse-usecase-index.md
  - docs/_reverse/student-invitations/_evidence.md
---

# UC-02 — Quản lý lời mời đang chờ (reverse)

> Trạng thái: `draft` (tái lập, chưa duyệt). Nhãn: ✅ chắc chắn (code khẳng định) · 🔵 suy đoán (≥2 điểm corroborate) · 🟡 cần xác nhận (code câm → OQ).

## a. Tổng quan

| Hạng mục | Nội dung | Nguồn | Nhãn |
|----------|----------|-------|------|
| UC ID | UC-02 | S10 | ✅ |
| Tên nghiệp vụ | Quản lý lời mời học viên đang chờ: xem danh sách, gửi lại email, thu hồi lời mời | S4, S10 | ✅ |
| Actor chính | Giáo viên / Chủ trung tâm (role có quyền `canPublishGrade`) | `packages/auth/src/role.ts:116-138` | ✅ |
| Actor phụ | Hệ thống gửi mail (nhận lệnh resend) | apps/server/src/lib/notifications/invite-email.ts:31-47 | ✅ |
| Mức độ | Người dùng đầy đủ | S10 | 🟡 OQ-11 (mức độ use case là phán đoán BA, không có nguồn) |
| Tiền điều kiện | Đã đăng nhập cổng GV; org context hợp lệ; lời mời ở trạng thái `pending` | apps/server/src/routes/kernel.ts:912-924, apps/server/src/app.ts:221-306 | ✅ |
| Hậu điều kiện thành công | Danh sách cập nhật; lời mời được gửi lại (reset cooldown) hoặc chuyển `canceled` | apps/server/src/routes/kernel.ts:978-1017, apps/server/src/routes/kernel.ts:1346-1380 | ✅ |

## b. Trigger

GV mở trang "Học viên" → tab "Lời mời đang chờ" và bấm "Gửi lại" hoặc "Thu hồi" trên một hàng lời mời. ✅ apps/web/src/routes/_auth/students/index.tsx:50-60 (tab + đếm), apps/web/src/components/students/pending-invitations-list.tsx:166-184 (nút hành động).

## c. Điều kiện vào (preconditions)

1. Session GV hợp lệ (Better-Auth). ✅ apps/server/src/routes/kernel.ts:912-924
2. Role thuộc teacher/owner/admin/class_teacher — `ta` bị chặn ở các lệnh ghi. ✅ apps/server/src/routes/kernel.ts:219-231 (canManageStudentInvites), apps/server/src/routes/kernel.ts:928, 1349 (403 "Trợ giảng không có quyền quản lý lời mời học viên")
3. Lời mời vẫn `pending` tại thời điểm bấm (không bị accept/reject/cancel trước đó). ✅ apps/server/src/routes/kernel.ts:978-1017 (CAS theo updatedAt), apps/server/src/routes/kernel.ts:1354-1380 (404 INVITATION_NOT_FOUND)
4. Danh sách lời mời đã load thành công (không lỗi mạng/403). ✅ apps/web/src/components/students/pending-invitations-list.tsx:50-64

## d. Luồng chính (main success scenario)

| # | Bước nghiệp vụ (ngôn ngữ BA) | Nguồn | Nhãn |
|---|------------------------------|-------|------|
| 1 | GV vào trang "Học viên"; hệ thống hiển thị 2 tab: "Học viên (n)" và "Lời mời đang chờ (n)" (n gộp hồ sơ chưa portalLinked + lời mời pending sau khử trùng #616) | apps/web/src/routes/_auth/students/index.tsx:45-121 | ✅ |
| 2 | Tab "Lời mời đang chờ" lấy danh sách lời mời của org qua GET /api/students/invitations, client lọc chỉ giữ `pending` và khử email trùng hồ sơ chờ | apps/web/src/lib/repos/invitations.ts:59-68,172-180; apps/web/src/lib/repos/students.ts:108-116; apps/server/src/routes/kernel.ts:912-923 | ✅ |
| 3 | Server trả về từng lời mời: email, trạng thái, createdAt, updatedAt, inviterUserId (KHÔNG có tên người mời/tên org — chỉ GET /api/student/notifications phía portal mới join 2 trường này) | apps/server/src/routes/kernel.ts:912-923; packages/api/src/contracts.ts:2943-2953 | ✅ |
| 4 | Hệ thống render mỗi lời mời thành 1 hàng: email, "Đã gửi lúc {thời gian}", badge "Đang chờ chấp nhận", nút "Gửi lại lời mời" + "Thu hồi" | apps/web/src/components/students/pending-invitations-list.tsx:131-184 | ✅ |
| 5 | Với mỗi lời mời còn hạn cooldown, nút "Gửi lại (Ns)" hiện đếm ngược và bị vô hiệu; hết cooldown nhãn về "Gửi lại lời mời" | apps/web/src/components/students/pending-invite-callout.tsx:62-109 | ✅ |
| 6 | GV bấm "Gửi lại" → POST /api/students/invitations/:id/resend (giữ nguyên email, tạo idempotency key mới) | apps/web/src/lib/repos/invitations.ts:95-135; apps/server/src/routes/kernel.ts:925-1071 | ✅ |
| 7 | Server kiểm tra CAS: hàng vẫn `pending` và `updatedAt` chưa đổi kể từ lúc client nhận → mới gửi lại | apps/server/src/routes/kernel.ts:978-1017 | ✅ |
| 8 | Mail gửi thành công → cập nhật `updatedAt` (mốc cooldown mới), trả lời mời đã cập nhật; toast "Đã gửi lại lời mời" | apps/server/src/routes/kernel.ts:1019-1044; apps/web/src/components/students/pending-invite-callout.tsx:111-140 | ✅ |
| 9 | GV bấm "Thu hồi" (cancel) → DELETE /api/students/invitations/:id ngay (không hộp thoại xác nhận trong code) | apps/web/src/components/students/pending-invitations-list.tsx:37-47,168-184; apps/web/src/lib/repos/invitations.ts:95-116; apps/server/src/routes/kernel.ts:1346-1380 | ✅ |
| 10 | Server đặt trạng thái `canceled` (chỉ khi vẫn `pending`); lời mời biến mất khỏi danh sách chờ; toast "Đã thu hồi lời mời" | apps/server/src/routes/kernel.ts:1361-1380; apps/web/src/components/students/pending-invitations-list.tsx:40-48 | ✅ |
| 11 | Danh sách trống → empty state "Chưa có lời mời nào đang chờ" + mô tả "Gửi lời mời qua email để học viên nhận thông báo và tham gia vào tổ chức của bạn." + nút "Mời học viên" | apps/web/src/components/students/pending-invitations-list.tsx:66-94 | ✅ |

### e. Ràng buộc dữ liệu tại bước 2-10

1. Lời mời gửi lại KHÔNG cho sửa email (chỉ reuse id + email cũ). ✅ packages/api/src/contracts.ts:2930-2935 (schema resend không có field email)
2. Cooldown gửi lại: `DEFAULT_INVITE_COOLDOWN_MS = 60_000` (DI được, E2E truyền 0). ✅ apps/server/src/routes/kernel.ts:214-217; apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:52-100
3. Vi phạm cooldown → 429 + header `Retry-After` + wording "Vui lòng đợi {n} giây trước khi gửi lại lời mời." ✅ apps/server/src/routes/kernel.ts:233-253 (cooldownResponse)
4. CAS resend: nếu `updatedAt` đã đổi (lời mời vừa bị chấp nhận/thu hồi) → 409/404 INVITATION_NOT_FOUND, KHÔNG gửi mail. ✅ apps/server/src/routes/kernel.ts:978-1017; apps/server/src/student-invitation.test.ts:580-656
5. Bỏ đếm ngược: `retryAfterSeconds = max(1, ceil((previousAt + cooldown - now)/1000))`. ✅ apps/server/src/routes/kernel.ts:233-253

## f. Luồng thay thế & ngoại lệ

| # | Kịch bản | Xử lý hệ thống | Nguồn | Nhãn |
|---|----------|----------------|-------|------|
| E2E-1a (A1) | GV bấm "Gửi lại" trong vòng 60s kể từ lần gửi trước | 429 INVITATION_RESEND_COOLDOWN + `Retry-After`; client hiện đếm ngược trên nút, không gửi mail | apps/server/src/routes/kernel.ts:233-253,966-976; apps/web/src/components/students/pending-invite-callout.tsx:62-109 | ✅ |
| A2 | GV bấm "Gửi lại" nhưng lời mời đã bị học viên chấp nhận / thu hồi ở phiên khác → `updatedAt` đổi so với bản client | CAS fail → 404/409 INVITATION_NOT_FOUND; client refetch danh sách, hàng cũ biến mất | apps/server/src/routes/kernel.ts:978-1017; apps/server/src/student-invitation.test.ts:580-656 | ✅ |
| A3 | Mail resend fail (SMTP/hub lỗi) | Trả 502 INVITATION_EMAIL_FAILED; server HOÀN TÁC `updatedAt` về giá trị cũ (không reset cooldown vô nghĩa); giữ nguyên `pending` | apps/server/src/routes/kernel.ts:1046-1055; apps/server/src/student-invitation.test.ts:658-750 | ✅ |
| A4 | Resend khi mailer chưa cấu hình | 503 INVITATION_EMAIL_UNAVAILABLE | apps/server/src/routes/kernel.ts:929-938 | ✅ |
| A5 | Trợ giảng (ta) bấm resend/cancel | 403 "Trợ giảng không có quyền quản lý lời mời học viên" | apps/server/src/routes/kernel.ts:925-940, 1346-1360; apps/server/src/student-invitation.test.ts:567-577 | ✅ |
| A6 | Cancel lời mời rồi mời lại cùng email | Được phép: unique index chỉ áp dụng `WHERE status='pending'`; lời mời `canceled` mới tạo OK; cooldown chỉ quét các hàng `canceled` gần nhất | packages/db/src/migrations/0025_spotty_betty_ross.sql:15; apps/server/src/routes/kernel.ts:770-800 | ✅ |
| A7 | Cancel lời mời rồi mời lại trong 60s | 429 cooldown (dựa trên hàng `canceled` mới nhất) | apps/server/src/routes/kernel.ts:770-800; apps/server/src/student-invitation.test.ts:486-507 | ✅ |
| A8 | GET danh sách khi chưa có lời mời nào | 200 + mảng rỗng → empty state | apps/web/src/components/students/pending-invitations-list.tsx:66-94 | ✅ |
| A9 | Abort timeout 15s ở client khi resend | AbortError → toast lỗi chung, giữ nguyên trạng thái | apps/web/src/lib/repos/invitations.ts:131-132 | ✅ |
| A10 | Role gate bị bỏ qua cho GET list (endpoint không kiểm tra role `ta`) | 🟡 xem OQ-3 — `ta` vẫn xem được danh sách (chỉ bị chặn ở ghi) | apps/server/src/routes/kernel.ts:912-924 | 🟡 |

## g. NFR liên quan

| ID | Yêu cầu | Nguồn | Nhãn |
|----|---------|-------|------|
| NFR-STUDENT-INVITATIONS-003 | Client đặt AbortSignal 15s cho resend/cancel | apps/web/src/lib/repos/invitations.ts:131-132 | ✅ |
| NFR-STUDENT-INVITATIONS-004 | Mail resend đồng bộ timeout 5s (SYNC_INVITE_MAIL_TIMEOUT_MS) | apps/server/src/routes/kernel.ts:217 | ✅ |
| NFR-STUDENT-INVITATIONS-005 | Toast phản hồi tức thì sau hành động (resend/cancel) | apps/web/src/components/students/pending-invitations-list.tsx:40-48 | ✅ |

## h. Truy vết

### UC-02 ↔ FR ↔ Error ↔ Test

| FR | Điểm UC | Error | Test phủ | Nguồn | Nhãn |
|----|---------|-------|----------|-------|------|
| FR-STUDENT-INVITATIONS-008 (xem danh sách lời mời) | d2-d4, e1 | — | apps/server/src/student-invitation.test.ts:236-278; apps/web/src/components/students/pending-invitations-list.test.tsx | S5, S10 | ✅ |
| FR-STUDENT-INVITATIONS-010 (gửi lại lời mời pending) | d5-d8, A1-A4 | E-003, E-004, E-005, E-006 | apps/server/src/student-invitation.test.ts:580-656; apps/e2e/specs/student-org-invitation-and-switcher.spec.ts:52-100 | S5, S10, S12 | ✅ |
| FR-STUDENT-INVITATIONS-009 (thu hồi lời mời) | d9-d10, A6-A7 | E-006 | apps/server/src/student-invitation.test.ts:236-278, 486-507; apps/web/src/components/students/pending-invitations-list.test.tsx | S5, S10 | ✅ |
| BR-STUDENT-INVITATIONS-005 (cooldown 60s) | e2-e5, A1, A7 | E-003 | apps/server/src/student-invitation.test.ts:486-507 | S5 | ✅ |
| BR-STUDENT-INVITATIONS-007 (CAS resend + hoàn nguyên updatedAt) | e4, A2 | E-006 | apps/server/src/student-invitation.test.ts:580-656 | S5 | ✅ |
| BR-STUDENT-INVITATIONS-005 (mời lại sau cancel) | A6-A7 | E-003 | apps/server/src/student-invitation.test.ts:486-507 | S5 | 🔵 |
| BR-STUDENT-INVITATIONS-009 (role gate ta) | c2, A5 | E-008 | apps/server/src/student-invitation.test.ts:567-577 | S5 | ✅ |
| — (empty state, spec không có FR riêng) | d11, A8 | — | apps/web/src/components/students/pending-invitations-list.test.tsx (empty render) | S10 | ✅ |

### Ghi chú reverse

- GET /api/students/invitations KHÔNG nằm trong nhóm có `canManageStudentInvites` — chỉ các lệnh ghi mới bị chặn `ta`. 🟡 OQ-3. ✅ apps/server/src/routes/kernel.ts:912-924
- Không có test nào phủ riêng lỗi AbortError 15s (chỉ có logic code). 🟡 OQ-9
```
