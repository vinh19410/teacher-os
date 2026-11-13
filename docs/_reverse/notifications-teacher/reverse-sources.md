# reverse-sources — notifications-teacher

Quy ước: `confidence` gắn độ phủ bằng chứng của nguồn trong spec này; `encoding` = cách dữ liệu tổ chức trong nguồn. Mọi `[S<n>]` trong spec phải resolve về bảng này. `wc -l` đã kiểm bằng `awk 'END{print NR}'` trước khi cite range (kèm cột "Số dòng").

| S-id | Path | Loại | Số dòng | Range đọc | Confidence | Ghi chú vai trò |
|---|---|---|---|---|---|---|
| S1 | apps/server/src/routes/notification-logs.ts | Server route (Hono) | 242 | 1–242 | high | GET /api/notification-logs + POST resend-failed + POST /:id/resend; PAGE_SIZE 20; triggerResendDelivery |
| S2 | apps/server/src/lib/notifications/enqueue.ts | Server service | 80 | 1–80 | high | NƠI GHI INSERT notification_record; channels/status theo email; chunk 50; onConflictDoNothing |
| S3 | apps/server/src/lib/notifications/deliver.ts | Server service | 232 | 1–232 | high | Vòng gửi ≤ 3 lượt; sanitize E-010 ≤ 500; render email; read_at truth |
| S4 | apps/server/src/lib/notifications/emit.ts | Server service | 91 | 1–91 | high | emitNotifications fail-open; notificationDepsFrom; resolveMailer |
| S5 | apps/server/src/lib/notifications/requeue.ts | Server service | 233 | 1–233 | high | Filter q/event (2 chế độ khớp email); requeueSingle + requeueFailed (limit 50, skip no_email) |
| S6 | apps/server/src/lib/notifications/templates.ts | Server builder | 193 | 1–193 | high | 7 builder sự kiện; khóa idempotency; nội dung tiêu đề/body/link |
| S7 | apps/server/src/lib/notifications/org-mail-sender.ts | Server service | 43 | 1–43 | high | sender_name = org.name; reply_to = email chủ org teacher/owner sớm nhất |
| S8 | apps/server/src/lib/notifications/invite-email.ts | Server builder | 75 | 1–75 | high | Email lời mời (boundary luồng mời — dùng renderHtml/text của deliver) |
| S9 | packages/db/src/schema/notification-record.ts | DB schema (Drizzle) | 72 | 1–72 | high | Bảng notification_record; enum status; unique + 2 index |
| S10 | packages/db/src/schema/notif.ts | DB schema (Drizzle) | 26 | 1–26 | high | Bảng notif (feed chuông org) — đối chiếu ranh giới, KHÔNG phải nguồn màn [5] |
| S11 | packages/api/src/contracts.ts | API contract (Zod) | 4801 | 3884–4038 (+grep) | high | 7 event types, 4 groups, status, MAX_EMAIL_ATTEMPTS, E-selfomy-alignment-010, query/row/response schema, RESEND_BATCH_LIMIT 50, resend body strict, inbox schema |
| S12 | apps/web/src/routes/_auth/notifications/index.tsx | Web route (TanStack) | 647 | 1–647 | high | Màn [5]: validateSearch, debounce 300ms, chip + badge, bảng, phân trang, modal bulk, formatResendToast |
| S13 | apps/web/src/lib/repos/notifications.ts | Web repo client | 103 | 1–103 | high | fetch + zod parse; PAGE_SIZE 20; query key prefix; 2 hàm resend |
| S14 | apps/web/src/components/notifications/notification-detail-dialog.tsx | Web component | 89 | 1–89 | high | Dialog chi tiết; nhãn trạng thái dùng chung |
| S15 | apps/web/src/lib/notification-error.ts | Web util | 31 | 1–31 | high | formatDeliveryError: E-010 short ≤ 80 + tooltip; fallback |
| S16 | apps/web/src/components/layout/sidebar.tsx | Web component | 214 | 76–90, 185–205 | high | Mục "Nhật ký thông báo" → /notifications; active-key prefix (cross-ref) |
| S17 | apps/web/src/components/layout/notif-panel.tsx | Web component | 41 | 1–41 | high | Panel chuông render feed `notif` (cross-ref — bề mặt khác) |
| S18 | apps/web/src/components/layout/topbar.tsx | Web component | 51 | 1–51 | high | Chuông topbar dùng useData().notifs (cross-ref) |
| S19 | apps/server/src/routes/kernel.ts | Server route (Hono) | 3523 | 337–345, 638–660, 1617–1626, 283–302, 3103–3110, 3392–3480, 3502–3503 | high | notify() fail-open; các callsite phát sự kiện; deliverSingleClassInviteSync; mount /notification-logs; debt-reminders |
| S20 | apps/server/src/app.ts | Server bootstrap | 472 | 215–237 | high | Gate 403 student/admin trước kernel tree |
| S21 | apps/server/src/routes/student.ts | Server route (student) | 2468 | 755–841 | high | GET /api/student/inbox + POST /:id/read (boundary — read_at nguồn chân lý) |
| S22 | apps/server/src/routes/snapshot.ts | Server route | 873 | 350 | high | Kernel snapshot nạp notifs = loadNotifs (cross-ref) |
| S23 | apps/server/src/routes/reporting/loaders.ts | Server loader | 62 | 30–50 | high | loadNotifs đọc bảng notif (cross-ref) |
| S24 | apps/server/src/routes/reporting/index.ts | Server route | 153 | 25–40 | high | notifRoutes GET /api/notifs (cross-ref) |
| S25 | apps/server/src/routes/grading.ts | Server route (Hono) | 1471 | 1113–1131 | high | Callsite grade_returned (boundary phát sự kiện) |
| S26 | apps/server/src/routes/assignments/index.ts | Server route (Hono) | 532 | 175–191 | high | Callsite grade_returned điểm per-học viên (boundary) |
| S27 | apps/server/src/routes/holidays.ts | Server route (Hono) | 1012 | 585–605, 636–671, 963–980 | high | Callsite holiday_created + NƠI GHI bảng notif (apply/undo) |
| S28 | packages/db/src/migrations/0048_small_champions.sql | SQL migration | 29 | 1–29 | high | CREATE TABLE notification_record + unique + 2 index |
| S29 | packages/db/src/migrations/0005_mature_sasquatch.sql | SQL migration | 38 | 11–25 | high | CREATE TABLE notif + index (feed) |
| S30 | packages/db/src/migrations/0060_study_pack.sql | SQL migration | 79 | 1 | high | DELETE dòng event_type self_study_released (dấu vết event type đã gỡ) |
| S31 | packages/auth/src/mail/mailer.ts | Auth mailer | 130 | 1–130 | high | MailInput (replyTo, fromName, Idempotency-Key); composeFrom; Resend |
| S32 | apps/server/src/index.ts | Server bootstrap | 177 | 160–170 | high | studentOrigin parse từ STUDENT_ORIGINS[0] |
| S33 | apps/server/src/routes/notification-logs.test.ts | Unit test server | 802 | 1–802 | high | R1: 17 test — org-scope, lọc, q escape, phân trang, counts, resend 1/loạt, 409/404, no_email, E-010, Origin/Content-Type |
| S34 | apps/server/src/lib/notifications/notifications.test.ts | Unit test service | 618 | 1–618 | high | R1: 17 test — enqueue/deliver/emit; sent ngay khi không email; 3 lượt; redact; read_at |
| S35 | apps/server/src/lib/notifications/templates.test.ts | Unit test builder | 123 | 1–123 | high | R1: 7 test — builder sự kiện + khóa chống trùng |
| S36 | apps/server/src/kernel.test.ts | Unit test app | 7844 | 7446–7844, 2430–2520 | high | R1: 9 test phát sự kiện trên core writes + fail-open + studentOrigin; test /api/notifs |
| S37 | apps/server/src/routes/student-inbox.test.ts | Unit test server | 329 | 1–329 | high | R1: 11 test inbox học viên (boundary — read_at, failed giữ status) |
| S38 | apps/web/src/routes/_auth/notifications/index.test.tsx | Web component test | 486 | 1–486 | high | R1: 14 it — validateSearch, badge, URL sync, debounce, dialog, lỗi E-010, phân trang, resend |
| S39 | apps/web/src/lib/repos/notifications.test.ts | Web repo test | 188 | 1–188 | high | R1: 9 test — fetch parse contract, URL sạch, resend, 409 |
| S40 | apps/web/src/lib/notification-error.test.ts | Web util test | 42 | 1–42 | high | R1: 4 it — formatDeliveryError |
| S41 | apps/e2e/specs/notifications-ac-001.spec.ts | E2E (Playwright) | 409 | 1–409 | high | R1: AC-001 TOS-21 — email + in-app, filter, idempotent, "Đã xem" |
| S42 | apps/e2e/specs/notifications-ac-002.spec.ts | E2E (Playwright) | 241 | 1–241 | high | R1: AC-002 TOS-22 — 3 lượt → failed + E-010, 3 viewport |
| S43 | apps/e2e/specs/notifications-ac-003.spec.ts | E2E (Playwright) | 386 | 1–386 | high | R1: AC-003 TOS-23 — Gửi lại 1/tất cả, không nhân bản in-app, email mới |
| S44 | apps/e2e/src/boot.ts | E2E boot | 299 | 54–80, 195–201 | high | recordingMailer + nhánh @bounce.test giả lỗi gửi |
| S45 | plans/261026-2054-tos-21-notification-queue-email-inapp/plan.md | Plan doc | 123 | 1–123 | high | Quyết định D1–D9 TOS-21 (bảng, khóa, kênh, màn [5], D8 màn dùng chung) |
| S46 | plans/261026-2054-tos-21-notification-queue-email-inapp/phase-05-notification-logs-screen.md | Plan phase | 32 | 1–32 | high | Đặc tả phase 5 màn [5] (route + UI + test) |
| S47 | plans/261027-0127-tos-22-notification-auto-retry-failed/plan.md | Plan doc | 144 | 19–49 | high | Quyết định D1–D8 TOS-22 (3 lượt, E-010, dòng lỗi đỏ) |
| S48 | plans/261027-0127-tos-23-notification-manual-resend/plan.md | Plan doc | 148 | 30–49 | high | Quyết định D1–D7 TOS-23 (reset nguyên tử, limit 50, UI gửi lại, D6 quyền) |
| S49 | apps/web/src/routes/_auth/route.tsx | Web route layout | 45 | 1–45 | high | beforeLoad redirect khi chưa đăng nhập (guard phía web) |
| S50 | apps/web/src/components/assignments/assignment-status.ts | Web util | 206 | 84–100 | high | fmtWhen dùng cho cột Thời gian (cross-ref) |
| S51 | apps/web/src/components/assignments/status-tag.tsx | Web component | 34 | 21–34 | high | StatusTag tone ok/warn/danger (cross-ref) |
| S52 | packages/db/src/migrations/0016_real_butterfly.sql | SQL migration | 16 | 13 | high | Cột settings preferred_channel "Zalo trước, email dự phòng" (cross-ref NEG-1 — feature khác) |

Ghi chú R2 (i18n): negative-search `find` + `grep` theo `*i18n*/*locale*/*messages*` và `useTranslation|i18next|react-i18next` trên apps/web/src, apps/server/src, packages/api/src — không có kết quả (chi tiết NEG-2 trong reverse-gaps.md). Không có S-id riêng cho catalog vì không tồn tại.

Ghi chú phạm vi: S8, S16–S18, S21–S24, S27, S31, S44, S49–S52 là nguồn ranh giới/cross-ref (không soạn lại feature khác); S45–S48 là kế hoạch (plan-ref), dùng để đối chiếu ý định — không thay code làm bằng chứng hành vi.
