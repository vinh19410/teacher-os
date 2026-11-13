---
type: reverse-srs
feature: notifications-teacher
status: draft
updated: 2026-11-12
source_commit: d6c0f6b5
confidence_summary: "✅61 🔵13 🟡10 — OQ 9 (đếm cơ học trên spec notifications-teacher-reverse-spec.md, loại dòng legend/confidence_summary; tổng 15 file: ✅62 🔵13 🟡21)"
links:
  - reverse-sources.md
  - reverse-gaps.md
  - _evidence.md
  - srs/notifications-teacher-reverse-flows.md
  - srs/notifications-teacher-reverse-states.md
  - srs/notifications-teacher-reverse-erd.md
  - usecases/notifications-teacher-reverse-usecase-index.md
  - usecases/uc-01-xem-nhat-ky-thong-bao.md
  - usecases/uc-02-loc-tim-kiem-phan-trang.md
  - usecases/uc-03-xem-chi-tiet-thong-bao.md
  - usecases/uc-04-gui-lai-mot-thong-bao-loi.md
  - usecases/uc-05-gui-lai-tat-ca-muc-loi.md
  - usecases/uc-06-hoc-vien-doc-thong-bao-in-app.md
  - usecases/uc-07-phat-sinh-dong-nhat-ky.md
---

# notifications-teacher — SRS tái lập (reverse)

> Trạng thái: `draft` (tái lập từ code, chưa duyệt). Toàn bộ nhãn: ✅ chắc chắn (code khẳng định trực tiếp tại cite) · 🔵 xác nhận bởi ≥2 bằng chứng độc lập · 🟡 suy luận BA — bắt buộc kèm OQ; mỗi mệnh đề mang nhãn nằm ở cột mô tả + Nguồn, còn cột Priority (FR/NFR) và Severity (ma trận lỗi) là phân loại của nhà phân tích (OQ-01).

## 0. Truy vết nguồn & độ tin cậy

- **Nguồn:** xem [`reverse-sources.md`](./reverse-sources.md) (S1–S52, liên tục).
- **Câu hỏi mở / Negative-search:** xem [`reverse-gaps.md`](./reverse-gaps.md) (OQ-01…OQ-09; NEG-1…NEG-6; không phát hiện Conflict code-vs-code).
- **Bằng chứng chi tiết theo hạng mục:** xem [`_evidence.md`](./_evidence.md).
- Feature `notifications-teacher` = **nhật ký thông báo GV đã gửi** trên màn `/notifications`: mỗi lần hệ thống nhắc học viên (mời vào lớp, giao bài, trả điểm, học phí, đổi lịch, nghỉ lễ) tạo 1 dòng ghi lại đã nhắc ai, lúc nào, qua kênh nào, gửi tới đâu; GV lọc/tìm, mở chi tiết, và gửi lại Email các dòng lỗi. Mục tiêu nghiệp vụ bậc cao hơn (đối soát để ra quyết định gì) là 🟡 Inferred — OQ-02.
- Hai bề mặt thông báo SONG SONG, không trùng bảng: nhật ký này đọc bảng `notification_record` (1 dòng = 1 thông báo cho 1 học viên), còn chuông topbar đọc bảng `notif` (feed org-level, chỉ ghi bởi tính năng lịch nghỉ) 🔵 [S9 — packages/db/src/schema/notification-record.ts:19-54; S10 — packages/db/src/schema/notif.ts:11-26; S23 — apps/server/src/routes/reporting/loaders.ts:30-50; S22 — apps/server/src/routes/snapshot.ts:350; NEG-4 — màn + repo không đụng `notifs`, exit 1].
- NƠI GHI duy nhất của `notification_record` là `enqueueNotifications` trong service thông báo; mọi route nghiệp vụ đi qua nó (trực tiếp hoặc qua `notify()`/`emitNotifications` fail-open) 🔵 [S2 — apps/server/src/lib/notifications/enqueue.ts:73; NEG-5 — `insert(notificationRecord` đúng 1 kết quả; S4 — apps/server/src/lib/notifications/emit.ts:61-91; S19 — apps/server/src/routes/kernel.ts:337-345].
- **Plan-ref trong comment code (grep `TOS-21|TOS-22|TOS-23|#454|#463|#464`):**

| Vị trí comment | Plan | Nội dung comment (tóm) |
|---|---|---|
| apps/server/src/routes/notification-logs.ts:29 | #454, TOS-21 phase 5 | "Màn [5] Nhật ký gửi thông báo — Route ĐỌC org-scoped, mount TRONG kernelRoutes để thừa hưởng Origin guard + role gate teacher" |
| apps/server/src/routes/notification-logs.ts:31 | — | "không mount standalone" |
| packages/db/src/schema/notification-record.ts:17-18 | TOS-21 D1, TOS-22/23 | "(plan TOS-21 D1). Cột failed/retry_count/last_error có sẵn cho TOS-22/23" |
| apps/server/src/lib/notifications/requeue.ts:13, :73 | #454, #464; TOS-23 D1, D2, D5 | "và API Gửi lại (#454, #464)"; "Không INSERT, không đổi idempotency_key hay read_at" |
| apps/server/src/lib/notifications/deliver.ts:112-120 | TOS-21 D4, TOS-22 D1–D4 | "tối đa 3 lượt thử … E-selfomy-alignment-010 … read_at là nguồn chân lý" |
| apps/server/src/lib/notifications/emit.ts:14, :19, :41 | #454; TOS-22 (#463) D6 | studentOrigin cho link tuyệt đối; retryDelaysMs "chỉ test/E2E truyền [0, 0]" |
| apps/server/src/lib/notifications/templates.ts:57-149 | #454 phase 3 | 5 builder sự kiện "#454 phase 3" |
| apps/server/src/routes/kernel.ts:336-338 | #454 phase 3 | "phát thông báo SAU khi ghi nghiệp vụ thành công, TRƯỚC return c.json … fail-open" |
| apps/server/src/routes/kernel.ts:3393 | — | `/debt-reminders` gắn `requireFinanceRole` (ngoại lệ fail-open) |
| packages/api/src/contracts.ts:3895, :3906, :3939, :3988 | #454; TOS-22 (#463); TOS-23 (#464) | event types; "4 nhóm chip lọc màn notification log (plan TOS-21 D2)"; MAX 3 lần thử; RESEND_BATCH_LIMIT |
| apps/web/src/routes/_auth/notifications/index.tsx:42 | #454, TOS-21 phase 5 | "Màn [5] … Bộ lọc sống trên URL" |
| apps/web/src/lib/repos/notifications.ts:2 | #454, TOS-21 phase 5 | "Notification logs read repo" |
| apps/web/src/components/notifications/notification-detail-dialog.tsx:53 | #454, phase 5 | "Dialog chi tiết 1 thông báo" |
| apps/server/src/routes/student.ts:755, :762 | TOS-21 D7 | "inbox học viên cần studentCtx"; "50 dòng mới nhất" |

- Kế hoạch liên quan: TOS-21 #454 (plans/261026-2054-…, D1–D9 + phase-05 màn [5]), TOS-22 #463 (auto-retry 3 lượt), TOS-23 #464 (manual resend) — dùng đối chiếu ý định, không thay code làm bằng chứng hành vi [S45 — plans/261026-2054-tos-21-notification-queue-email-inapp/plan.md:1-123; S47 — plans/261027-0127-tos-22-notification-auto-retry-failed/plan.md:19-49; S48 — plans/261027-0127-tos-23-notification-manual-resend/plan.md:30-49].
- `existing_doc = null` (docs/_reverse/reverse-plan.json:340-351 — slug `notifications-teacher`, 4 nguồn, confidence medium, flag `async`) → không có Mục 0.3 "Khác biệt với tài liệu chính".

## 0.1 Bảng S tóm tắt (đánh số trùng reverse-sources.md)

| Nhóm | S-id | Vai trò |
|---|---|---|
| API route | S1 | GET list + POST resend-failed + POST /:id/resend (242 dòng) |
| Service thông báo | S2–S8 | enqueue (GHI), deliver (3 lượt), emit (fail-open), requeue (reset), templates (7 builder), org-mail-sender, invite-email (biên) |
| Schema DB | S9, S10 | notification_record (feature này) vs notif (feed chuông — đối chiếu) |
| Migration | S28–S30, S52 | DDL 2 bảng; dấu vết event type đã gỡ; preferred_channel "Zalo trước" (feature khác) |
| Contract | S11 | 7 event types, 4 nhóm, 4 status, schemas query/row/response/resend/inbox |
| Web màn [5] | S12–S16, S49–S51 | route màn + repo + dialog + util lỗi + sidebar + guard layout + util hiển thị |
| Web đối chiếu | S17, S18 | panel chuông + topbar (bề mặt `notif`) |
| Server biên | S19–S27, S32 | kernel (notify + callsite + mount), gate app, inbox học viên, snapshot, reporting notif, callsite grading/assignments/holidays, studentOrigin |
| Mail | S31 | Mailer Resend: MailInput, Idempotency-Key, composeFrom |
| Kiểm thử | S33–S44 | unit/đề màn/E2E AC-001..003 + boot recordingMailer |
| Kế hoạch | S45–S48 | plan TOS-21/22/23 |

## 1. Scope

**Trong scope:**

- Màn `/notifications` "Nhật ký gửi thông báo (Email & In-app)" cho app GV: bảng 20 dòng/trang, chip Nhóm sự kiện + Trạng thái, ô tìm kiếm, phân trang server-side, mọi bộ lọc sống trên URL 🔵 [S12 — apps/web/src/routes/_auth/notifications/index.tsx:42-56, :347-450, :556-595; S13 — apps/web/src/lib/repos/notifications.ts:2-17; S46 — plans/261026-2054-tos-21-notification-queue-email-inapp/phase-05-notification-logs-screen.md:1-32].
- API đọc `GET /api/notification-logs?q=&event=&status=&page=` trả rows + total + counts + page + pageSize, org-scoped 🔵 [S1 — apps/server/src/routes/notification-logs.ts:71-189; S11 — packages/api/src/contracts.ts:3946-3983; S33 — apps/server/src/routes/notification-logs.test.ts:169-317].
- Dialog chi tiết 1 thông báo (metadata gửi: người gửi, Reply-To, thời điểm, lần thử, lỗi đầy đủ) + rút gọn lỗi trên dòng 🔵 [S14 — apps/web/src/components/notifications/notification-detail-dialog.tsx:35-89; S15 — apps/web/src/lib/notification-error.ts:14-31].
- Gửi lại Email: 1 dòng (`POST /:id/resend`) và loạt theo bộ lọc (`POST /resend-failed`, tối đa 50) — reset nguyên tử trên cùng bản ghi rồi deliver nền 🔵 [S1 — apps/server/src/routes/notification-logs.ts:191-239; S5 — apps/server/src/lib/notifications/requeue.ts:61-142, apps/server/src/lib/notifications/requeue.ts:144-233; S43 — apps/e2e/specs/notifications-ac-003.spec.ts:1-386].
- Hàng đợi + vòng gửi email tự động tối đa 3 lượt (nền `runInBackground`), trạng thái queued/sent/read/failed, `E-selfomy-alignment-010` khi hết lượt 🔵 [S2 — apps/server/src/lib/notifications/enqueue.ts:55-79; S3 — apps/server/src/lib/notifications/deliver.ts:112-129, apps/server/src/lib/notifications/deliver.ts:207-225; S11 — packages/api/src/contracts.ts:3939-3943; S42 — apps/e2e/specs/notifications-ac-002.spec.ts:1-241].
- Nơi phát sinh dòng nhật ký: 7 loại sự kiện nghiệp vụ × học viên, khóa chống trùng, snapshot email/người gửi; fail-open đối với nghiệp vụ gốc (ngoại lệ `/debt-reminders` trả `{queued, skipped}`) 🔵 [S6 — apps/server/src/lib/notifications/templates.ts:40-193; S2 — apps/server/src/lib/notifications/enqueue.ts:20-79; S19 — apps/server/src/routes/kernel.ts:337-345, apps/server/src/routes/kernel.ts:3393-3480; S35 — apps/server/src/lib/notifications/templates.test.ts:1-123].
- Biên đọc học viên: in-app inbox 50 dòng + hành vi đọc quyết định trạng thái "Đã xem" trên nhật ký GV 🔵 [S21 — apps/server/src/routes/student.ts:755-841; S37 — apps/server/src/routes/student-inbox.test.ts:1-329; S41 — apps/e2e/specs/notifications-ac-001.spec.ts:196-409].

**Ngoài scope (chỉ trích làm bằng chứng chéo / ranh giới):**

- Tính năng GỬI thông báo theo nghiệp vụ (form soạn nhắc nợ, mời vào lớp…) — chỉ bóc điểm phát sự kiện (UC-07 là biên).
- Feed chuông topbar (bảng `notif`, panel + topbar) — bề mặt khác [S17 — apps/web/src/components/layout/notif-panel.tsx:1-41; S18 — apps/web/src/components/layout/topbar.tsx:1-51].
- Zalo OA: chỉ tồn tại dạng metadata báo cáo phụ huynh + setting preferred_channel; KHÔNG có trong hàng đợi thông báo (NEG-1) — tương lai kênh là 🟡 OQ-04.
- Báo cáo phụ huynh (#173), cấu hình settings org, i18n (không có hạ tầng — NEG-2, OQ-06).

## 2. Actors

| Actor | Vai trò trong feature | Bằng chứng | Mức |
|---|---|---|---|
| Giáo viên (mọi thành viên org trên app GV) | Actor chính: xem nhật ký, lọc/tìm, mở chi tiết, Gửi lại 1/loạt. Màn dùng chung org, không guard tài chính (TOS-23 D6) | apps/server/src/routes/notification-logs.ts:29-31; plans/261027-0127-tos-23-notification-manual-resend/plan.md (D6); apps/web/src/components/layout/sidebar.tsx:76-90 | ✅ |
| Session student (portal) | Bị chặn 403 ở gate app trước kernel tree — không xem, không gửi lại | apps/server/src/app.ts:226-233; packages/api/src/contracts.ts:1984 | ✅ |
| Session role admin | Bị chặn 403 trên kernel tree (chỉ làm việc trên /api/admin) | apps/server/src/app.ts:235-239; packages/api/src/contracts.ts:1986-1987 | ✅ |
| Học viên (student portal, boundary) | Đọc in-app inbox + đánh dấu đã đọc — nguồn duy nhất của "Đã xem" trên nhật ký GV | apps/server/src/routes/student.ts:755-841; apps/e2e/specs/notifications-ac-001.spec.ts:196-409 | ✅ |
| Hệ thống (route nghiệp vụ) | Phát sinh dòng nhật ký sau khi ghi nghiệp vụ (mời/giao bài/trả điểm/học phí/đổi lịch/nghỉ lễ/nhắc nợ) | apps/server/src/routes/kernel.ts:336-345, apps/server/src/routes/kernel.ts:638-660, apps/server/src/routes/kernel.ts:3393-3480; apps/server/src/routes/grading.ts:1113-1131; apps/server/src/routes/assignments/index.ts:180-191; apps/server/src/routes/holidays.ts:636-671 | ✅ |
| Mailer ngoài (Resend) | Gửi Email thật qua HTTP API với Idempotency-Key; lỗi → vòng thử lại | packages/auth/src/mail/mailer.ts:19-90; apps/e2e/src/boot.ts:54-80 | ✅ |
| Người nhận cuối (phụ huynh/học viên đọc email) | Không thao tác trong feature; hành vi đọc email không quay về hệ thống (không có pixel/track) 🟡 OQ-02 | apps/server/src/lib/notifications/deliver.ts:135-158 (chỉ render + gửi) | 🟡 |

- Mục tiêu nghiệp vụ của người dùng màn (đối soát ra quyết định gì, tần suất nào) không ghi trong code/plan → OQ-02.

## 3. Functional Requirements

> Cột Priority là đề xuất của nhà phân tích (không có nguồn P0/P1 trong code/test — OQ-01).

| Mã | Tên | Hành vi + bằng chứng | Priority |
|---|---|---|---|
| FR-01 | Đọc nhật ký org-scoped | ✅ GET `/api/notification-logs` kiểm `kernelCtx` (401 `unauthorized` nếu thiếu), parse query Zod (400 `invalid query`), chạy 3 query song song: 20 dòng join `student` lấy tên, sort `created_at` desc rồi `id` desc, LIMIT 20 OFFSET; total; counts GROUP BY status; trả `{rows, total, counts, page, pageSize: 20}` — mọi mệnh đề WHERE có `org_id` của phiên [S1 — apps/server/src/routes/notification-logs.ts:71-189; S11 — packages/api/src/contracts.ts:3946-3983; S33 — apps/server/src/routes/notification-logs.test.ts:169-230] | P1 |
| FR-02 | Tìm kiếm q server-side | ✅ `q` chuyển lower LIKE đã escape `% _ \` trên `student.name`, `recipient_email`, `title`; `student.email` chỉ tham gia khớp khi dòng có `recipient_email` (chế độ snapshot — BR-09) [S1 — apps/server/src/routes/notification-logs.ts:28-46, :89-95; S33 — apps/server/src/routes/notification-logs.test.ts:231-317] | P1 |
| FR-03 | Lọc event + status | ✅ `event` lọc theo `event_group` (4 nhóm enum), `status` theo 4 trạng thái enum; giá trị lạ bị Zod từ chối [S1 — apps/server/src/routes/notification-logs.ts:75-84; S11 — packages/api/src/contracts.ts:3907-3914, packages/api/src/contracts.ts:3931-3936, packages/api/src/contracts.ts:3946-3952] | P1 |
| FR-04 | Chip Trạng thái + badge đếm | ✅ Chip "Tất cả / Đang chờ / Đã gửi / Đã xem / Lỗi gửi" mang badge đếm do server trả (`counts` tính trên q+event — BR-07), đếm không đổi khi đang lọc status; aria-label "Trạng thái" [S12 — apps/web/src/routes/_auth/notifications/index.tsx:107-114, :298, :426-447; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:128-223] | P1 |
| FR-05 | Chip Nhóm sự kiện + validateSearch | ✅ Chip 5 lựa chọn "Tất cả / Mời vào lớp / Giao bài / Trả điểm / Học phí / Đổi lịch / Nghỉ lễ" → `?event=`; `validateSearch` chỉ chấp nhận giá trị trong danh sách, `page` chỉ số nguyên ≥ 2, `q` trim — giá trị lạ về mặc định và mặc định không lên URL [S12 — apps/web/src/routes/_auth/notifications/index.tsx:56-85, :92-105, :131-145; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:128-149] | P2 |
| FR-06 | Tìm kiếm debounce 300ms lên URL | ✅ Ô tìm giữ state local, ngừng gõ 300ms mới đẩy `?q=` lên URL (replace) và quay về trang 1; `q` đổi từ phía URL (back/forward, link chia sẻ) sync ngược xuống input — comment "chuẩn trang /grading" [S12 — apps/web/src/routes/_auth/notifications/index.tsx:175-180, :256-292; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:128-223] | P2 |
| FR-07 | Bảng 6 cột + thao tác dòng | ✅ Cột "Thời gian / Người nhận / Sự kiện / Kênh / Trạng thái / (Thao tác)": thời gian fmt vi-VN Asia/Ho_Chi_Minh; Người nhận = tên học viên + email (nếu có); Sự kiện + Kênh hiển thị nhãn Việt; Trạng thái tag màu (failed đỏ, queued vàng, còn lại xanh); cột Thao tác có nút eye aria "Xem chi tiết thông báo cho {tên}" (mọi dòng) và nút "Gửi lại" (chỉ dòng failed, disable khi đang gửi); emptyMessage bảng "Chưa có thông báo." [S12 — apps/web/src/routes/_auth/notifications/index.tsx:455-553; S14 — apps/web/src/components/notifications/notification-detail-dialog.tsx:8-16; S50 — apps/web/src/components/assignments/assignment-status.ts:84-100; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:149-171] | P1 |
| FR-08 | Rút gọn lỗi trên dòng failed | ✅ `formatDeliveryError`: short "E-010: <nguyên nhân ≤80 ký tự> sau N lần thử" kèm `title` = fullText (tooltip); thiếu lỗi → fallback "Không gửi được email"; mã máy `E-selfomy-alignment-010:` bị cắt khỏi bản rút gọn, giữ nguyên trong tooltip [S15 — apps/web/src/lib/notification-error.ts:14-31; S12 — apps/web/src/routes/_auth/notifications/index.tsx:466-496; S40 — apps/web/src/lib/notification-error.test.ts:1-42] | P1 |
| FR-09 | Dialog chi tiết thông báo | ✅ Nút eye mở modal: tiêu đề = tiêu đề thông báo, body pre-wrap; các trường Người nhận (tên · email), Người gửi ("—" nếu rỗng), Reply-To ("—" khi null), Gửi lúc, Đọc lúc ("—" khi null), Số lần thử lại "N/3 lần thử"; dòng lỗi thêm mục Lỗi gửi với `last_error` đầy đủ; đóng modal không đổi dữ liệu [S14 — apps/web/src/components/notifications/notification-detail-dialog.tsx:35-89; S12 — apps/web/src/routes/_auth/notifications/index.tsx:597-606; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:224-272] | P1 |
| FR-10 | Phân trang server-side | ✅ Dòng "Trang {page} / {pageCount} · {total} thông báo" (aria-live polite, kèm " · đang cập nhật…" khi fetching); nút "Trang trước"/"Trang sau" disable ở đầu/cuối; `?page=` sống trên URL, đổi filter luôn về trang 1 [S12 — apps/web/src/routes/_auth/notifications/index.tsx:556-595, :412-419, :437-444; S13 — apps/web/src/lib/repos/notifications.ts:17] | P2 |
| FR-11 | Trạng thái màn (loading/empty) | ✅ Đang tải: "Đang tải nhật ký thông báo…"; rỗng toàn cục khi `counts.all = 0` và không có filter: "Chưa có thông báo nào" + mô tả "Khi hệ thống gửi thông báo mời vào lớp, trả điểm, học phí hoặc đổi lịch cho học viên, nhật ký gửi sẽ xuất hiện tại đây."; rỗng có filter: "Không có thông báo nào phù hợp với bộ lọc." — vẫn giữ thanh lọc [S12 — apps/web/src/routes/_auth/notifications/index.tsx:319-333, :368-387, :447-451; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:290-318] | P2 |
| FR-12 | Hết phiên → reauth | ✅ Lỗi tải danh sách 401 → `reauth()` điều hướng đăng nhập lại [S12 — apps/web/src/routes/_auth/notifications/index.tsx:199-204; S39 — apps/web/src/lib/repos/notifications.test.ts:1-188] | P1 |
| FR-13 | Gửi lại một thông báo lỗi | ✅ Bấm "Gửi lại" → POST `/api/notification-logs/:id/resend` body `"{}"`; server xác nhận bản ghi thuộc org và đang `failed`, reset nguyên tử trên CÙNG bản ghi: status `queued`, retry_count 0, last_error null, `recipient_email` = email hiện tại (correlated subquery), channels nâng cấp CASE — không INSERT, không đổi `idempotency_key`/`read_at`/`created_at`; rồi deliver nền; thành công → toast + invalidate toàn bộ query màn [S1 — apps/server/src/routes/notification-logs.ts:50-69, :221-239; S5 — apps/server/src/lib/notifications/requeue.ts:61-142; S12 — apps/web/src/routes/_auth/notifications/index.tsx:206-231, :523-539; S43 — apps/e2e/specs/notifications-ac-003.spec.ts:130-386] | P1 |
| FR-14 | Gửi lại tất cả mục lỗi theo bộ lọc | ✅ Nút header "Gửi lại tất cả mục lỗi (N)" (N = counts.failed) chỉ hiện khi N > 0, disable khi đang gửi; bấm → modal "Gửi lại tất cả thông báo lỗi?" mô tả "Đưa {N} thông báo lỗi trong bộ lọc hiện tại về hàng đợi để gửi lại Email. Thông báo In-app trên cổng học viên không bị gửi trùng."; xác nhận → POST `/resend-failed` body `{q?, event?}` `.strict()` (không nhận status), server reset tối đa 50 dòng `failed` mới nhất có email hợp lệ khớp bộ lọc, dòng thiếu email vào `skipped`, trả `{requeued, skipped, remaining}` [S1 — apps/server/src/routes/notification-logs.ts:191-219; S11 — packages/api/src/contracts.ts:3989-3998; S5 — apps/server/src/lib/notifications/requeue.ts:144-233; S12 — apps/web/src/routes/_auth/notifications/index.tsx:233-254, :337-365, :612-644; S43 — apps/e2e/specs/notifications-ac-003.spec.ts:130-386] | P1 |
| FR-15 | Toast kết quả Gửi lại | ✅ `formatResendToast`: toàn bộ bị skip → toast lỗi "Bỏ qua {N} thông báo do học viên chưa có email."; ngược lại "Đã đưa {N} thông báo về hàng đợi để gửi lại." + (nếu có) "Bỏ qua {N} mục thiếu email." + (nếu còn) "Còn {N} mục lỗi, bấm lại để gửi tiếp."; lỗi 409 → "Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi."; lỗi khác single → "Không thể gửi lại thông báo. Vui lòng thử lại.", bulk → "Không thể gửi lại các thông báo lỗi. Vui lòng thử lại." [S12 — apps/web/src/routes/_auth/notifications/index.tsx:147-168, :206-231, :233-254; S38 — apps/web/src/routes/_auth/notifications/index.test.tsx:273-289; S39 — apps/web/src/lib/repos/notifications.test.ts:154-188] | P1 |
| FR-16 | Phát sinh dòng nhật ký (nơi GHI) | ✅ Route nghiệp vụ dựng event từ builder thuần với khóa chống trùng nguyên văn: `tuition_reminder:<invoiceId>:<vnDate>`, `class_enrolled:<enrollmentId>`, `assignment_published:<classAssignmentId>:<studentId>`, `grade_returned:<attemptId>`, `invoice_issued:<invoiceId>`, `schedule_changed:<classId>:<date>:<editedAtMs>:<studentId>`, `holiday_created:<holidayId>:<studentId>`; `enqueueNotifications` resolve email học viên theo chunk 50 + `resolveOrgMailSender` (sender = tên org, reply_to = email teacher/owner sớm nhất), học viên không thuộc org bỏ qua, INSERT `onConflictDoNothing` theo unique (org_id, idempotency_key) — replay nghiệp vụ không nhân đôi dòng [S6 — apps/server/src/lib/notifications/templates.ts:40-193; S2 — apps/server/src/lib/notifications/enqueue.ts:20-79; S7 — apps/server/src/lib/notifications/org-mail-sender.ts:14-43; S9 — packages/db/src/schema/notification-record.ts:57-59; S35 — apps/server/src/lib/notifications/templates.test.ts:1-123] | P1 |
| FR-17 | Vòng gửi email nền ≤ 3 lượt | ✅ Sau enqueue, `deliverNotifications` chạy qua `runInBackground` (vắng thì await): mỗi lượt re-select từ DB (chống gửi trùng khi chạy song song), lỗi lượt 1–2 giữ `queued` + retry_count+1 + last_error raw, chạm lượt 3 → `failed` kèm "E-selfomy-alignment-010: <nguyên nhân>" (≤500 ký tự, redact Bearer/re_); gửi OK → `sent`, hoặc `read` nếu `read_at` đã có; dòng chỉ in_app không qua mailer; vắng mailer cấu hình → giữ `queued` + console.warn; link trong thư dựng từ `studentOrigin` [S3 — apps/server/src/lib/notifications/deliver.ts:112-129, :135-158, :175, :207-225; S2 — apps/server/src/lib/notifications/enqueue.ts:70-78 (INSERT); S4 — apps/server/src/lib/notifications/emit.ts:14-22, :45-60, :80-83 (deliver chạy nền); S31 — packages/auth/src/mail/mailer.ts:19-90; S34 — apps/server/src/lib/notifications/notifications.test.ts:33-299; S42 — apps/e2e/specs/notifications-ac-002.spec.ts:1-241] | P1 |
| FR-18 | In-app học viên + "Đã xem" | ✅ GET `/api/student/inbox` trả 50 dòng mới nhất của chính học viên kèm `unread`, KHÔNG trả `recipient_email`/`reply_to_email`/`last_error`; POST `/inbox/:id/read`: nếu `read_at` null → đặt now và chỉ khi status `sent` nâng thành `read` (queued giữ, failed giữ), đã có `read_at` → 200 không ghi lại; id lạ/không thuộc học viên → 404 "Không tìm thấy thông báo" [S21 — apps/server/src/routes/student.ts:755-841; S11 — packages/api/src/contracts.ts:4014-4034; S37 — apps/server/src/routes/student-inbox.test.ts:1-329; S41 — apps/e2e/specs/notifications-ac-001.spec.ts:196-409] | P1 |
| FR-19 | Quyền xem + Gửi lại | ✅ Cùng gate màn [5]: mọi thành viên org qua kernelRoutes (thừa hưởng Origin guard + role gate teacher), không thêm guard tài chính; student/admin bị 403 ở gate app; TOS-23 D6 khóa quyết định này [S1 — apps/server/src/routes/notification-logs.ts:29-31; S20 — apps/server/src/app.ts:226-239; S48 — plans/261027-0127-tos-23-notification-manual-resend/plan.md (D6); S33 — apps/server/src/routes/notification-logs.test.ts:1-802] | P1 |
| FR-20 | Điểm vào màn | ✅ Sidebar mục "Nhật ký thông báo" → `/notifications`; active-key theo prefix để sáng mục khi đang ở màn (kể cả có search params) [S16 — apps/web/src/components/layout/sidebar.tsx:76-90, :185-205; S12 — apps/web/src/routes/_auth/notifications/index.tsx:84-86] | P2 |

## 4. Non-Functional Requirements

> Cột Priority là đề xuất của nhà phân tích (OQ-01).

| Mã | Tên | Hành vi + bằng chứng | Priority |
|---|---|---|---|
| NFR-01 | Hiệu năng đọc | ✅ 1 request GET = đúng 3 query chạy song song (`Promise.all`); counts gom 1 query GROUP BY status thay vì N+1 (comment trong code) [S1 — apps/server/src/routes/notification-logs.ts:91-152] | P1 |
| NFR-02 | Phản hồi nhập liệu | ✅ Debounce 300ms cho ô tìm; badge " · đang cập nhật…" khi refetch; filter đổi → về trang 1 ngay [S12 — apps/web/src/routes/_auth/notifications/index.tsx:256-292, :561-564, :412-419] | P2 |
| NFR-03 | CSRF + định dạng POST | ✅ Kernel chặn mọi POST/PUT/PATCH/DELETE thiếu Origin hợp lệ (403 fail-closed — comment "Cookies are SameSite=None") và POST body phải `application/json` (415); route thừa hưởng do mount trong kernelRoutes [S19 — apps/server/src/routes/kernel.ts:186-206; S1 — apps/server/src/routes/notification-logs.ts:29-31; S33 — apps/server/src/routes/notification-logs.test.ts:769-802] | P1 |
| NFR-04 | Che giấu bí mật trong lỗi | ✅ `sanitizeDeliveryError` redact `Bearer <token>` → "Bearer [REDACTED]" và `re_…` (Resend key) → "[REDACTED]", cắt ≤500 ký tự cả bản raw lẫn bản sentinel [S3 — apps/server/src/lib/notifications/deliver.ts:11-12, :32-56; S34 — apps/server/src/lib/notifications/notifications.test.ts:33-516] | P1 |
| NFR-05 | Idempotency + chống race | ✅ Unique (org_id, idempotency_key) chặn nhân bản ở tầng DB; INSERT `onConflictDoNothing`; mỗi lượt deliver re-select + UPDATE có điều kiện `status='queued'`; resend UPDATE có điều kiện `status='failed'` → bấm 2 lần cho 409/200 idempotent [S9 — packages/db/src/schema/notification-record.ts:57-59; S2 — apps/server/src/lib/notifications/enqueue.ts:73-77; S3 — apps/server/src/lib/notifications/deliver.ts:207-225; S5 — apps/server/src/lib/notifications/requeue.ts:122-142] | P1 |
| NFR-06 | Nghiệp vụ gốc không vỡ | ✅ `emitNotifications`/`notify()` nuốt mọi lỗi thông báo (fail-open) — thao tác gốc vẫn 2xx; send lại sau reset bọc `.catch` tránh unhandled rejection [S4 — apps/server/src/lib/notifications/emit.ts:61-91; S19 — apps/server/src/routes/kernel.ts:336-345; S1 — apps/server/src/routes/notification-logs.ts:50-69; S36 — apps/server/src/kernel.test.ts:7446-7844] | P1 |
| NFR-07 | Giới hạn định lượng | ✅ Trang 20 dòng; lô resend 50; inbox 50; last_error 500 ký tự; lỗi rút gọn 80 ký tự; 3 lượt thử; chờ mặc định 2000/5000 ms [S1 — apps/server/src/routes/notification-logs.ts:26; S11 — packages/api/src/contracts.ts:3989; S21 — apps/server/src/routes/student.ts:762-770; S3 — apps/server/src/lib/notifications/deliver.ts:12-13; S15 — apps/web/src/lib/notification-error.ts:14-31] | P2 |
| NFR-08 | Khả năng tiếp cận | ✅ aria-label các nút ("Gửi lại thông báo cho {tên}", "Xem chi tiết thông báo cho {tên}", "Trang trước", "Trang sau", "Nhóm sự kiện", "Trạng thái"); dòng phân trang aria-live polite [S12 — apps/web/src/routes/_auth/notifications/index.tsx:404, :436, :527, :537, :561-594] | P2 |
| NFR-09 | Kiểm thử không gửi ra ngoài | ✅ E2E dùng recordingMailer cục bộ + nhánh địa chỉ `@bounce.test` giả lỗi gửi; `retryDelaysMs` injectable (chỉ test truyền `[0, 0]` — comment code) [S44 — apps/e2e/src/boot.ts:54-80, :195-201; S4 — apps/server/src/lib/notifications/emit.ts:19-22; S41 — apps/e2e/specs/notifications-ac-001.spec.ts:1-409] | P2 |
| NFR-10 | Dung lượng dữ liệu theo năm | 🟡 App code chỉ INSERT, không có aging/xóa — bảng tăng vô hạn trên D1; migration 0060 có DELETE một lần cho event_type đã gỡ khỏi schema (S30); chưa có ngưỡng hay chính sách [S9 — packages/db/src/schema/notification-record.ts:57-71; S30 — packages/db/src/migrations/0060_study_pack.sql:1] | P3 |

## 5. Business Rules

| Mã | Quy tắc | Bằng chứng |
|---|---|---|
| BR-01 | ✅ Gửi lại KHÔNG tạo bản ghi mới: reset nguyên tử trên cùng dòng `notification_record` → thông báo In-app (đọc từ cùng dòng) không bao giờ nhân bản | apps/server/src/lib/notifications/requeue.ts:73-142 (comment "Không INSERT, không đổi idempotency_key hay read_at" :73); plans/261027-0127-tos-23-notification-manual-resend/plan.md (D1); apps/e2e/specs/notifications-ac-003.spec.ts:130-386 |
| BR-02 | ✅ Mỗi sự kiện × học viên = ĐÚNG 1 dòng: khóa idempotency canonical theo sự kiện + unique (org_id, idempotency_key) + `onConflictDoNothing` — replay nghiệp vụ không nhân đôi | apps/server/src/lib/notifications/templates.ts:40-193; apps/server/src/lib/notifications/enqueue.ts:73-77; packages/db/src/schema/notification-record.ts:57-59; apps/server/src/lib/notifications/templates.test.ts:105-123 |
| BR-03 | ✅ `read_at` là nguồn chân lý của "Đã xem": đọc khi `queued` → đặt read_at nhưng giữ `queued` (deliver sau chuyển thẳng `read`); bản ghi `failed` vẫn đọc được nhưng giữ `failed`; gửi lại không xóa `read_at` | apps/server/src/routes/student.ts:825-836; apps/server/src/lib/notifications/deliver.ts:193-207; plans/261027-0127-tos-23-notification-manual-resend/plan.md (D5); apps/server/src/routes/student-inbox.test.ts:1-329 |
| BR-04 | ✅ Học viên không có email → dòng `sent` ngay khi tạo, kênh `in_app` (không có gì để deliver) — và vẫn đọc được in-app như mọi dòng khác | apps/server/src/lib/notifications/enqueue.ts:59-65; apps/server/src/lib/notifications/notifications.test.ts:130-154; apps/server/src/routes/student.ts:778-793 |
| BR-05 | ✅ Gửi lại dùng email HIỆN TẠI của học viên (correlated subquery gán `trim(student.email)` lúc reset, chống TOCTOU); email trống → bản ghi không reset, vào `skipped` lý do `no_email` | apps/server/src/lib/notifications/requeue.ts:110-126, :95-101; plans/261027-0127-tos-23-notification-manual-resend/plan.md (D2); apps/server/src/routes/notification-logs.test.ts:453-603 |
| BR-06 | ✅ Gửi lại loạt: dòng `no_email` được tách truy vấn riêng → không chặn đầu hàng đợi (head-of-line) và KHÔNG cộng vào `remaining` | apps/server/src/lib/notifications/requeue.ts:151-233; plans/261027-0127-tos-23-notification-manual-resend/plan.md (D2); apps/server/src/routes/notification-logs.test.ts:604-768 |
| BR-07 | ✅ Badge đếm chip tính trên bộ lọc q + event, KHÔNG áp status — 1 query GROUP BY status (comment "counts (chip trạng thái): q + event, KHÔNG status") | apps/server/src/routes/notification-logs.ts:36-37, :89-90; apps/web/src/routes/_auth/notifications/index.tsx:298 |
| BR-08 | ✅ Thông báo phát SAU khi ghi nghiệp vụ thành công, TRƯỚC return; lỗi thông báo fail-open (nuốt hết) — ngoại lệ `/debt-reminders` gọi enqueue+deliver đồng bộ để trả đúng `{queued, skipped}` | apps/server/src/routes/kernel.ts:336-345; apps/server/src/lib/notifications/emit.ts:61-91; apps/server/src/routes/kernel.ts:3393-3480; apps/server/src/kernel.test.ts:7446-7844 |
| BR-09 | ✅ Tìm kiếm khớp email theo 2 chế độ: GET khớp `recipient_email` snapshot (chỉ khi dòng có email đã gửi); resend-failed khớp `student.email` hiện tại (`matchCurrentStudentEmail = true`) — lý do: email có thể đã được sửa, lần gửi lại dùng địa chỉ mới (TOS-23 D2) | apps/server/src/routes/notification-logs.ts:28-46; apps/server/src/lib/notifications/requeue.ts:19-59; plans/261027-0127-tos-23-notification-manual-resend/plan.md (D2); apps/server/src/routes/notification-logs.test.ts:231-317 |
| BR-10 | ✅ Màn dùng chung toàn org: mọi thành viên org xem + Gửi lại; không guard tài chính; mọi query ràng buộc `org_id` phiên | apps/server/src/routes/notification-logs.ts:29-31; plans/261027-0127-tos-23-notification-manual-resend/plan.md (D6); apps/server/src/routes/notification-logs.test.ts:169-230 |
| BR-11 | ✅ Hai bề mặt thông báo tách bạch: nhật ký màn [5] = bảng `notification_record`; chuông topbar = bảng `notif` (feed org, chỉ lịch nghỉ ghi); màn `/notifications` không đọc snapshot notifs | packages/db/src/schema/notif.ts:1-26; apps/server/src/routes/holidays.ts:594, :970; apps/server/src/routes/snapshot.ts:350; NEG-4 (exit 1) |
| BR-12 | ✅ Reset chỉ áp dụng dòng đang `failed`; status khác (hoặc thua race 2 người bấm) → 409 `not_failed` — thao tác idempotent | apps/server/src/lib/notifications/requeue.ts:128-140; apps/server/src/routes/notification-logs.ts:230-234; apps/server/src/routes/notification-logs.test.ts:556-603 |
| BR-13 | ✅ Chỉ 2 kênh thực: Email + In-app (`channels` = `in_app` hoặc `email,in_app` do enqueue ghi; nhãn màn có thêm `email` chỉ từ CASE nâng cấp khi resend các dòng kênh rỗng cũ). "Zalo OA" KHÔNG thuộc hàng đợi — chỉ metadata báo cáo phụ huynh + setting preferred_channel (feature khác) | 🔵 apps/server/src/lib/notifications/enqueue.ts:59; apps/server/src/lib/notifications/requeue.ts:117; NEG-1 (exit 1); packages/api/src/contracts.ts:1300-1312; packages/db/src/migrations/0016_real_butterfly.sql:13 — hướng đi Zalo là 🟡 OQ-04 |

## 6. Error Matrix (wording thật, nguyên văn)

> Cột Severity là phân loại của nhà phân tích (OQ-01).

| Mã | Tình huống | HTTP / phản hồi | Người dùng thấy (nguyên văn) | Nguồn | Severity |
|---|---|---|---|---|---|
| E-01 | GET nhật ký khi thiếu kernelCtx (chưa đăng nhập/hết phiên) | 401 `{"error":"unauthorized"}` | Điều hướng về đăng nhập lại (`reauth()`) | apps/server/src/routes/notification-logs.ts:73-74; apps/web/src/routes/_auth/notifications/index.tsx:199-204 | Trung bình |
| E-02 | Session student/admin chạm kernel tree | 403 `{"error":"ACCOUNT_STUDENT_ROLE","code":"ACCOUNT_STUDENT_ROLE"}` / `{"error":"ACCOUNT_ADMIN_ROLE","code":"ACCOUNT_ADMIN_ROLE"}` | Không thấy màn (sidebar chỉ hiện cho app GV); API từ chối | apps/server/src/app.ts:226-239; packages/api/src/contracts.ts:1984-1987 | Thấp |
| E-03 | Query GET lệch enum/page (gọi API trực tiếp; UI đã chặn trước) | 400 `{"error":"invalid query"}` | Card lỗi tải: "Không tải được nhật ký thông báo. Thử tải lại trang." | apps/server/src/routes/notification-logs.ts:75-84; apps/web/src/routes/_auth/notifications/index.tsx:325-333 | Thấp |
| E-04 | POST resend-failed với body không phải JSON hợp lệ | 400 `{"error":"invalid json"}` | Toast lỗi bulk (E-12) | apps/server/src/routes/notification-logs.ts:191-202; apps/web/src/routes/_auth/notifications/index.tsx:251-253 | Thấp |
| E-05 | POST resend-failed thừa/thiếu trường (schema `.strict()`, vd gửi `status`) | 400 `{"error":"invalid body"}` | Toast lỗi bulk (E-12) | packages/api/src/contracts.ts:3992-3998; apps/server/src/routes/notification-logs.ts:200-206 | Thấp |
| E-06 | Gửi lại id lạ hoặc thuộc org khác | 404 `{"error":"not_found"}` | Toast "Không thể gửi lại thông báo. Vui lòng thử lại." | apps/server/src/routes/notification-logs.ts:221-231; apps/web/src/routes/_auth/notifications/index.tsx:229-230 | Thấp |
| E-07 | Gửi lại dòng không còn `failed` (kể cả thua race 2 người bấm cùng lúc) | 409 `{"error":"not_failed"}` | Toast "Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi." (E-13) + làm mới | apps/server/src/routes/notification-logs.ts:233-234; apps/web/src/routes/_auth/notifications/index.tsx:218-228 | Thấp |
| E-08 | POST thiếu Origin hợp lệ (chống CSRF fail-closed) | 403 `{"error":"origin not allowed"}` | Toast lỗi tương ứng mutation ("Không thể gửi lại thông báo. Vui lòng thử lại." / "Không thể gửi lại các thông báo lỗi. Vui lòng thử lại.") | apps/server/src/routes/kernel.ts:190-195 | Thấp |
| E-09 | POST Content-Type không phải application/json | 415 `{"error":"content-type must be application/json"}` | Như E-08 | apps/server/src/routes/kernel.ts:196-201 | Thấp |
| E-10 | Email lỗi đủ 3 lượt → `failed` | Dữ liệu: `last_error = "E-selfomy-alignment-010: <nguyên nhân>"` (≤500 ký tự) | Dòng: "E-010: <nguyên nhân ≤80> sau N lần thử" + tooltip giữ nguyên văn; dialog: Lỗi gửi đầy đủ; fallback "Không gửi được email" | apps/server/src/lib/notifications/deliver.ts:32-56, :207-225; apps/web/src/lib/notification-error.ts:14-31; apps/e2e/specs/notifications-ac-002.spec.ts:91-241 | Cao |
| E-11 | Tải danh sách lỗi (mạng/500/parse) | — (client) | Card "Không tải được nhật ký thông báo. Thử tải lại trang." | apps/web/src/routes/_auth/notifications/index.tsx:325-333 | Trung bình |
| E-12 | Gửi lại loạt lỗi khác (không phải 409) | — (client) | Toast "Không thể gửi lại các thông báo lỗi. Vui lòng thử lại." | apps/web/src/routes/_auth/notifications/index.tsx:251-253 | Thấp |
| E-13 | Client nhận 409 từ Gửi lại 1 dòng | — (client) | Toast "Thông báo này đã được đưa vào hàng đợi hoặc không còn ở trạng thái lỗi." | apps/web/src/routes/_auth/notifications/index.tsx:218-228 | Thấp |
| E-14 | Gửi lại khi học viên trống email | 200 với `skipped: [{id, reason: "no_email"}]` | Toast lỗi "Bỏ qua {N} thông báo do học viên chưa có email." | apps/server/src/lib/notifications/requeue.ts:95-101, :195-226; apps/web/src/routes/_auth/notifications/index.tsx:151-155 | Thấp |
| E-15 | Response lệch contract (row/response Zod parse fail ở repo) | — (client) | ZodError → rơi vào khối lỗi E-11 | apps/web/src/lib/repos/notifications.ts:51, :78, :102; apps/web/src/routes/_auth/notifications/index.tsx:325-333 | Thấp |

Ngoài ma trận (boundary, không phải lỗi của màn GV): học viên đọc in-app id lạ → 404 `{"error":"Không tìm thấy thông báo"}` (apps/server/src/routes/student.ts:823-824).

## 7. Success Metrics

- AC-001 (TOS-21 #454, phase 6): nghiệp vụ phát thông báo → Email tới mailbox giả + bản ghi in-app; dòng nhật ký đúng trạng thái/kênh; học viên đọc → dòng GV chuyển "Đã xem"; replay idempotent không nhân bản 🔵 [S41 — apps/e2e/specs/notifications-ac-001.spec.ts:1-409; S44 — apps/e2e/src/boot.ts:54-80].
- AC-002 (TOS-22 #463): mailer lỗi liên tục → đúng 3 lượt rồi dòng `failed` kèm "E-010", kiểm ở 3 viewport 🔵 [S42 — apps/e2e/specs/notifications-ac-002.spec.ts:1-241].
- AC-003 (TOS-23 #464): Gửi lại 1 dòng và "Gửi lại tất cả" → không nhân bản in-app, email mới được gửi, toast đúng số liệu 🔵 [S43 — apps/e2e/specs/notifications-ac-003.spec.ts:1-386].
- Độ phủ unit: 17 + 17 + 7 + 9 + 11 + 4 (server) + 14 + 9 + 4 (web) test với hành vi liệt kê ở FR/BR — [S33–S40].
- Đo lường sử dụng thực tế (tần suất mở màn, tỉ lệ lỗi gửi thật trong sản xuất) KHÔNG có trong repo → 🟡 OQ-02.

## 8. Entities

Chi tiết đầy đủ: [`srs/notifications-teacher-reverse-erd.md`](./srs/notifications-teacher-reverse-erd.md).

| Thực thể | Vai trò | Ghi chú |
|---|---|---|
| `notification_record` (21 cột) | Bảng chính — 1 dòng = 1 thông báo cho 1 học viên, phục vụ cả Email lẫn In-app | org_id, student_id, event_type (7 enum), event_group (4 enum), title, body, link_path, ref_type, ref_id, channels (default "in_app"), recipient_email (nullable), sender_name, reply_to_email (nullable), status (4 enum), retry_count, last_error, sent_at, read_at, created_at, idempotency_key; unique (org_id, idempotency_key); 2 index org+created, org+student+created ✅ [S9 — packages/db/src/schema/notification-record.ts:19-71; S28 — packages/db/src/migrations/0048_small_champions.sql:1-25, :27-29] |
| `notif` | Đối chiếu ranh giới — feed chuông org (feature lịch nghỉ ghi, snapshot đọc) | 7 cột: org_id, type, title, body, link_path, accent, created_at ✅ [S10 — packages/db/src/schema/notif.ts:11-26; S29 — packages/db/src/migrations/0005_mature_sasquatch.sql:11-25] |
| `student` (tham chiếu) | Tên hiển thị (join lúc GET) + email nguồn lúc enqueue/resend | join org-scoped ✅ [S1 — apps/server/src/routes/notification-logs.ts:96-125; S2 — apps/server/src/lib/notifications/enqueue.ts:31-38; S5 — apps/server/src/lib/notifications/requeue.ts:110-126] |
| `organization` (tham chiếu) | sender_name trong thư = tên org; reply_to = email teacher/owner sớm nhất | ✅ [S7 — apps/server/src/lib/notifications/org-mail-sender.ts:14-43] |

## 9. Flows

Chi tiết đầy đủ (sequence + flowchart cho từng flow): [`srs/notifications-teacher-reverse-flows.md`](./srs/notifications-teacher-reverse-flows.md).

| Flow | Tên | UC |
|---|---|---|
| F1 | Xem nhật ký thông báo (GET /api/notification-logs) — gồm lọc/tìm/phân trang | UC-01, UC-02 |
| F2 | Xem chi tiết một thông báo (chỉ client) | UC-03 |
| F3 | Gửi lại một thông báo lỗi (POST /:id/resend) | UC-04 |
| F4 | Gửi lại tất cả mục lỗi theo bộ lọc (POST /resend-failed) | UC-05 |
| F5 | Dòng nhật ký xuất hiện từ nghiệp vụ gốc (boundary — emit/enqueue) | UC-07 |
| F6 | Vòng gửi email tối đa 3 lượt (boundary — deliver) | UC-04, UC-05, UC-07 |
| F7 | Học viên đọc in-app → dòng nhật ký chuyển "Đã xem" (boundary) | UC-06 |

## 10. Screens

| Màn | Thành tố chính | Bằng chứng |
|---|---|---|
| [5] `/notifications` — "Nhật ký gửi thông báo (Email & In-app)" (app GV) | PageHead kicker "{total} thông báo" + lead; nút header "Gửi lại tất cả mục lỗi (N)"; ô tìm "Tìm theo học viên, email hoặc tiêu đề…"; 2 nhóm chip (Nhóm sự kiện 5 lựa chọn; Trạng thái 5 lựa chọn + badge đếm); bảng 6 cột; phân trang "Trang {page} / {pageCount} · {total} thông báo" + Trang trước/sau; dialog chi tiết; modal "Gửi lại tất cả thông báo lỗi?"; 3 empty-state | ✅ [S12 — apps/web/src/routes/_auth/notifications/index.tsx:347-644] |
| Điều hướng | Sidebar mục "Nhật ký thông báo" → /notifications | ✅ [S16 — apps/web/src/components/layout/sidebar.tsx:76-90, :185-205] |
| Portal học viên (boundary) | Inbox in-app 50 dòng + nút đọc (không phải màn GV) | ✅ [S21 — apps/server/src/routes/student.ts:755-841] |
| Chuông topbar (đối chiếu — KHÔNG phải màn này) | Panel feed `notif` org-level | ✅ [S17 — apps/web/src/components/layout/notif-panel.tsx:1-41; S18 — apps/web/src/components/layout/topbar.tsx:1-51] |

## 11. Constraints

- Kỹ thuật: Cloudflare Workers + Hono; D1 (SQLite); gửi nền `runInBackground` (vắng môi trường thì `await`); mailer Resend qua HTTP với Idempotency-Key + timeoutMs; `studentOrigin` = origin học viên ĐẦU TIÊN trong STUDENT_ORIGINS (đa origin là 🟡 OQ-07) ✅ [S2 — apps/server/src/lib/notifications/enqueue.ts:70-78 (INSERT); S4 — apps/server/src/lib/notifications/emit.ts:80-83 (deliver chạy nền); S31 — packages/auth/src/mail/mailer.ts:19-90; S32 — apps/server/src/index.ts:162-168].
- Thời gian hiển thị: dialog chi tiết dùng `vi-VN` + `Asia/Ho_Chi_Minh`; cột bảng dùng `fmtWhen` định dạng `en-GB` cùng múi giờ; khóa idempotency ngày dùng `vnDate` ✅ [S14 — apps/web/src/components/notifications/notification-detail-dialog.tsx:35-50; S50 — apps/web/src/components/assignments/assignment-status.ts:84-100; S6 — apps/server/src/lib/notifications/templates.ts:47].
- Ngôn ngữ: toàn bộ wording màn/toast là literal tiếng Việt — KHÔNG có hạ tầng i18n (NEG-2 exit 1) → 🟡 OQ-06.
- Dữ liệu: email/recipient là snapshot lúc gửi; chỉ resend cập nhật lại snapshot; không có sửa nội dung/xóa dòng từ màn (chỉ reset trạng thái gửi) ✅ [S5 — apps/server/src/lib/notifications/requeue.ts:110-126; NEG-3].
- Bảo mật: cookie dùng chung cross-subdomain (SameSite=None) → bắt buộc Origin check tường minh + gate vai trò app ✅ [S19 — apps/server/src/routes/kernel.ts:186-190; S20 — apps/server/src/app.ts:218-239].
- Kiểm thử: không gửi email ra ngoài trong E2E (recordingMailer + @bounce.test); retry delays injectable ✅ [S44 — apps/e2e/src/boot.ts:54-80; S4 — apps/server/src/lib/notifications/emit.ts:19-22].

## 12. Open Questions

| Mã | Câu hỏi | Vì sao 🟡 |
|---|---|---|
| OQ-01 | Cột Priority (FR/NFR) và Severity (ma trận lỗi) nên xếp thứ tự nào theo backlog thật? | Phân loại của nhà phân tích, không có nguồn trong code/test |
| OQ-02 | Màn nhật ký phục vụ quyết định gì (đối soát định kỳ? xử lý lỗi là đủ?), tần suất? | Code/plan chỉ nói "màn dùng chung" + wording; ý định kinh doanh không ghi |
| OQ-03 | Có kế hoạch hợp nhất chuông topbar (`notif`) với nhật ký (`notification_record`) không? | 2 bề mặt song song đã rõ trong code; hướng sản phẩm không ghi |
| OQ-04 | Zalo OA có trở thành kênh gửi thật của hàng đợi không, khi nào? | Setting đã ưu tiên "Zalo trước" từ sớm + enum báo cáo có "Zalo OA", nhưng queue chỉ email + in-app |
| OQ-05 | Có cần chính sách aging/archive cho nhật ký không, ngưỡng bao nhiêu? | App code chỉ INSERT (NEG-3); migration 0060 có DELETE một lần cho event_type đã gỡ (S30); giới hạn D1 không ghi trong repo |
| OQ-06 | Wording Việt hard-code — có yêu cầu đa ngôn ngữ trong lộ trình không? | NEG-2: không có i18n infra |
| OQ-07 | Org đa origin học viên: link trong email nên theo origin nào? | `studentOrigin` lấy phần tử đầu tiên (comment "origin cổng học viên đầu tiên") |
| OQ-08 | Đổi tên mã sentinel `E-selfomy-alignment-010` theo convention repo? | Web đã phụ thuộc tiền tố "E-010:" khi rút gọn; đổi tên có chi phí tương thích |
| OQ-09 | Có cần nhảy trang/xuất CSV khi dữ liệu lớn không? | Chỉ có Trang trước/sau + PAGE_SIZE 20 cứng |
