---
phase: 1
title: "Service requeueFailedNotifications và 2 endpoint Gửi lại"
status: completed
priority: P0
effort: "4h"
dependencies: ["TOS-22 phase 1"]
---

# Phase 1: Resend API (`requeueFailedNotifications` + `POST /:id/resend` & `POST /resend-failed`)

<!-- Updated: Validation & Red Team Session 1 - Handover decomposition + correlated subquery UPDATE + starvation-free remaining + kernelRoutes 403/415 tests -->

## Goal

Cung cấp contract Zod (`resendFailedBodySchema`, `notificationResendResponseSchema`, `RESEND_BATCH_LIMIT = 50`), hàm dịch vụ `requeueFailedNotifications` đặt lại nguyên tử các bản ghi `failed` về `queued` (`retry_count = 0`, `last_error = null`, cập nhật `recipient_email` từ `student.email` hiện tại bằng correlated subquery, đảm bảo `channels` chứa `'email'`, tách riêng học viên trống email vào `skipped` không gây nghẽn hàng đợi), và 2 endpoint `POST /api/notification-logs/:id/resend` + `POST /api/notification-logs/resend-failed` kích hoạt `deliverNotifications` chạy nền.

## Files to Create or Modify

- Modify: `packages/api/src/contracts.ts`
- Create: `apps/server/src/lib/notifications/requeue.ts`
- Modify: `apps/server/src/routes/notification-logs.ts`
- Modify: `apps/server/src/routes/notification-logs.test.ts`

## Tasks & Steps

### Task 1.1 — Bổ sung contract schema cho API Gửi lại thông báo
- **Goal:** Định nghĩa và export `RESEND_BATCH_LIMIT = 50`, `resendFailedBodySchema`, `notificationResendSkippedItemSchema`, `notificationResendResponseSchema` và các kiểu TypeScript tương ứng trong `@teacher-os/api/contracts`.
- **Target files and symbols:** `packages/api/src/contracts.ts` (ngay sau `notificationLogResponseSchema` tại dòng ~3535).
- **Steps:**
  1. Trong `packages/api/src/contracts.ts`, thêm:
     - `export const RESEND_BATCH_LIMIT = 50;`
     - `export const resendFailedBodySchema = z.object({ q: z.string().optional(), event: z.enum(NOTIFICATION_EVENT_GROUPS).optional() }).strict();`
     - `export type ResendFailedBody = z.infer<typeof resendFailedBodySchema>;`
     - `export const notificationResendSkippedItemSchema = z.object({ id: z.string(), reason: z.literal("no_email") });`
     - `export const notificationResendResponseSchema = z.object({ requeued: z.number().int().min(0), skipped: z.array(notificationResendSkippedItemSchema), remaining: z.number().int().min(0) });`
     - `export type NotificationResendResponse = z.infer<typeof notificationResendResponseSchema>;`
- **Success criteria:** `@teacher-os/api/contracts` export đầy đủ `RESEND_BATCH_LIMIT`, `resendFailedBodySchema`, `ResendFailedBody`, `notificationResendResponseSchema`, `NotificationResendResponse`.
- **Verify:** no verification needed (kiểm tra biên dịch và test ở Task 1.2–1.3).

### Task 1.2 — Viết test đỏ (TDD Red) cho `POST /:id/resend` và `POST /resend-failed`
- **Goal:** Tạo bộ test trong `apps/server/src/routes/notification-logs.test.ts` phủ toàn bộ AC-003 và các ca biên bảo mật/đồng thời trước khi cài đặt route.
- **Target files and symbols:** `apps/server/src/routes/notification-logs.test.ts` (thêm `describe("POST /api/notification-logs resend (#464)")`).
- **Steps:**
  1. Trong `apps/server/src/routes/notification-logs.test.ts`, giữ nguyên các `describe` `GET` hiện có và thêm `describe("POST /api/notification-logs resend (#464)")` dùng DB in-memory khởi tạo mới theo `beforeEach` để các phép ghi không làm bẩn fixture của test `GET`:
     - **Case 1 (Single resend thành công + không nhân bản In-app):** Bản ghi `failed` (`retry_count = 3`, `last_error = "E-selfomy-alignment-010: mailbox unavailable"`, `channels = "email,in_app"`):
       - Khi truyền `runInBackground` thu giữ promise: ngay sau `POST /:id/resend`, response trả `200 { requeued: 1, skipped: [], remaining: 0 }`, bản ghi trong DB đang ở `status = "queued"`, `retryCount = 0`, `lastError = null`. Sau khi `await` promise nền, `mailer` được gọi đúng 1 lần, bản ghi chuyển `status = "sent"`, tổng số dòng `notification_record` của học viên vẫn là 1, và `GET /api/student/inbox` của học viên vẫn trả đúng 1 mục.
     - **Case 2 (Cập nhật Email học viên trước khi resend + bảo toàn `read_at`):** Đổi `student.email` sang `"hoa.moi@gmail.com"` và đặt sẵn `read_at` trên bản ghi `failed` → `POST /:id/resend` gửi thư tới `"hoa.moi@gmail.com"`, cập nhật `recipient_email = "hoa.moi@gmail.com"`, và sau khi gửi xong chuyển thẳng sang `status = "read"` (giữ nguyên `read_at`).
     - **Case 3 (Guard trạng thái & quyền org — 404 / 409 / idempotent khi bấm 2 lần):**
       - `POST /:id/resend` với `id` không tồn tại hoặc thuộc `org-2` → `404`.
       - Bản ghi đang `sent` hoặc `queued` → `409 { error: "not_failed" }`, mailer không được gọi.
       - Bấm `POST /:id/resend` 2 lần liên tiếp (khi `runInBackground` giữ bản ghi ở `queued` hoặc sau khi đã `sent`) → lần 2 trả `409 { error: "not_failed" }`, mailer chỉ được gọi tổng cộng 1 lần.
     - **Case 4 (Học viên trống email — `skipped`):** Học viên có `email = "   "` → `POST /:id/resend` trả `200 { requeued: 0, skipped: [{ id, reason: "no_email" }], remaining: 0 }`, bản ghi giữ nguyên `status = "failed"`, mailer không được gọi.
     - **Case 5 (Bulk `POST /resend-failed` theo bộ lọc `q + event`, giới hạn 50, `remaining` và chống starvation):**
       - Lọc theo `{ event: "tuition" }` hoặc `{ q: "hoa.moi@gmail.com" }` → chỉ reset các bản ghi `failed` khớp bộ lọc của đúng org.
       - Khi có 55 bản ghi `failed` có email hợp lệ và 3 bản ghi `failed` có email trống (dù 3 bản ghi trống email mới hơn): `POST /resend-failed` trả `{ requeued: 50, skipped: [3 mục no_email], remaining: 5 }`; gọi tiếp lần 2 trả `{ requeued: 5, skipped: [3 mục no_email], remaining: 0 }`.
     - **Case 6 (Gửi lại vẫn lỗi → lại `failed` với E-010 sau 3 lượt):** Mailer ném lỗi liên tục với `notificationRetryDelaysMs: [0, 0]` → mailer được gọi đúng 3 lần, bản ghi quay về `status = "failed"`, `retryCount = 3`, `lastError` bắt đầu bằng `"E-selfomy-alignment-010: "`.
     - **Case 7 (Kernel CSRF Origin 403 & Content-Type 415 guard):** Mount qua `kernelRoutes` (với `allowedOrigins: ["http://localhost:5173"]`): request `POST /api/notification-logs/:id/resend` thiếu `Origin` trả `403`; có `Origin` hợp lệ nhưng thiếu `Content-Type: application/json` trả `415`.
- **Success criteria:** File test biên dịch và khi chạy sẽ fail (Red) ở các test gọi `POST /:id/resend` và `POST /resend-failed` (404 vì chưa cài đặt route).
- **Verify:** `pnpm --filter server test -- notification-logs` thoát với mã khác `0` (Red phase).

### Task 1.3 — Cài đặt `requeueFailedNotifications` và 2 route `POST /:id/resend`, `POST /resend-failed`
- **Goal:** Thực thi logic đặt lại bản ghi lỗi trong `apps/server/src/lib/notifications/requeue.ts` và gắn 2 route POST vào `apps/server/src/routes/notification-logs.ts` để toàn bộ unit test xanh.
- **Target files and symbols:**
  - `apps/server/src/lib/notifications/requeue.ts` (`buildNotificationLogFilter`, `requeueSingleFailedNotification`, `requeueFailedNotifications`)
  - `apps/server/src/routes/notification-logs.ts` (`notificationLogRoutes`)
- **Steps:**
  1. Tạo `apps/server/src/lib/notifications/requeue.ts`:
     - Viết hàm `buildNotificationLogFilter(orgId: string, filter: { q?: string; event?: NotificationEventGroup; status?: NotificationStatus }): SQL | undefined`:
       - Escape `%`, `_`, `\` trong `q.trim().toLowerCase()`.
       - Tìm khớp `lower(student.name)`, `lower(coalesce(notificationRecord.recipientEmail, ''))`, `lower(coalesce(student.email, ''))`, hoặc `lower(notificationRecord.title)`.
       - Kết hợp `eq(notificationRecord.orgId, orgId)`, `event ? eq(notificationRecord.eventGroup, event) : undefined`, `status ? eq(notificationRecord.status, status) : undefined`.
     - Viết hàm `requeueSingleFailedNotification(db: Db, orgId: string, id: string)` trả về `{ kind: "not_found" } | { kind: "not_failed" } | { kind: "ok"; response: NotificationResendResponse; requeuedIds: string[] }`:
       - `SELECT notificationRecord.id, notificationRecord.status, student.email` từ `notificationRecord` `innerJoin(student, eq(student.id, notificationRecord.studentId))` với `where(and(eq(notificationRecord.orgId, orgId), eq(notificationRecord.id, id)))`.
       - Nếu không có dòng → `{ kind: "not_found" }`.
       - Nếu `row.status !== "failed"` → `{ kind: "not_failed" }`.
       - Nếu `row.email.trim() === ""` → `{ kind: "ok", response: { requeued: 0, skipped: [{ id, reason: "no_email" }], remaining: 0 }, requeuedIds: [] }`.
       - Thực thi `UPDATE notification_record` với:
         - `status: "queued"`, `retryCount: 0`, `lastError: null`
         - `recipientEmail: sql\`(SELECT trim(${student.email}) FROM ${student} WHERE ${student.id} = ${notificationRecord.studentId} AND ${student.orgId} = ${notificationRecord.orgId})\``
         - `channels: sql\`CASE WHEN ${notificationRecord.channels} = 'in_app' THEN 'email,in_app' WHEN ${notificationRecord.channels} = '' THEN 'email' ELSE ${notificationRecord.channels} END\``
         - `where(and(eq(notificationRecord.orgId, orgId), eq(notificationRecord.id, id), eq(notificationRecord.status, "failed"), sql\`EXISTS (SELECT 1 FROM ${student} WHERE ${student.id} = ${notificationRecord.studentId} AND ${student.orgId} = ${notificationRecord.orgId} AND length(trim(${student.email})) > 0)\`))`
         - `.returning({ id: notificationRecord.id })`.
       - Nếu mảng trả về rỗng (thua race condition) → `{ kind: "not_failed" }`.
       - Ngược lại trả `{ kind: "ok", response: { requeued: 1, skipped: [], remaining: 0 }, requeuedIds: [id] }`.
     - Viết hàm `requeueFailedNotifications(db: Db, orgId: string, filter: { q?: string; event?: NotificationEventGroup; limit?: number })`:
       - Dùng `baseWhere = buildNotificationLogFilter(orgId, { q: filter.q, event: filter.event, status: "failed" })`.
       - Chạy `Promise.all` lấy:
         1. `eligibleRows`: `id` của các dòng `failed` có `sql\`length(trim(${student.email})) > 0\`` sắp xếp `desc(notificationRecord.createdAt), desc(notificationRecord.id)` với `.limit(limit)`.
         2. `eligibleCountRows`: `count()` của các dòng `failed` có `sql\`length(trim(${student.email})) > 0\``.
         3. `noEmailRows`: `id` của các dòng `failed` có `sql\`length(trim(${student.email})) = 0\`` sắp xếp `desc(notificationRecord.createdAt), desc(notificationRecord.id)`.
       - Nếu `eligibleRows.length > 0`, chạy cùng câu `UPDATE ... WHERE inArray(notificationRecord.id, targetIds) ... RETURNING id` như trên để lấy `requeuedIds`.
       - Tính `remaining = Math.max(0, totalEligible - requeuedIds.length)`.
       - Trả `{ response: { requeued: requeuedIds.length, skipped: noEmailRows.map((r) => ({ id: r.id, reason: "no_email" as const })), remaining }, requeuedIds }`.
  2. Trong `apps/server/src/routes/notification-logs.ts`:
     - Mở rộng kiểu `deps` của `notificationLogRoutes` thành `{ getDb(): Db; mailer?: Mailer; runInBackground?(promise: Promise<unknown>): void; studentOrigin?: string; notificationRetryDelaysMs?: number[] }` (tương thích ngược với `{ getDb: () => db }` và nhận tự động toàn bộ trường khi `kernel.ts:1737` truyền `deps`).
     - Dùng `buildNotificationLogFilter` cho `GET /`.
     - Thêm helper nội bộ `triggerResendDelivery(requeuedIds: string[])`: nếu `requeuedIds.length === 0` thì return; gọi `const notifDeps = notificationDepsFrom(deps); const delivery = deliverNotifications(notifDeps.db, notifDeps.mailer, requeuedIds, notifDeps.studentOrigin, notifDeps.retryDelaysMs ? { retryDelaysMs: notifDeps.retryDelaysMs } : undefined).catch((error) => { console.error("[notifications] resend deliver failed", error); });` rồi đưa vào `notifDeps.runInBackground(delivery)` hoặc `await delivery`.
     - Thêm `routes.post("/resend-failed", ...)` (đặt trước hoặc tách rõ với `/:id/resend`): parse JSON body (cho phép body rỗng `{}`) bằng `resendFailedBodySchema.safeParse`, nếu lỗi trả `400 { error: "invalid body" }`; gọi `requeueFailedNotifications`, kích hoạt `triggerResendDelivery(requeuedIds)`, trả `c.json(response)`.
     - Thêm `routes.post("/:id/resend", ...)`: gọi `requeueSingleFailedNotification(deps.getDb(), ctx.orgId, c.req.param("id"))`; nếu `not_found` trả `404 { error: "not_found" }`; nếu `not_failed` trả `409 { error: "not_failed" }`; nếu `ok` thì kích hoạt `triggerResendDelivery(requeuedIds)` và trả `c.json(response)`.
- **Success criteria:** Toàn bộ unit test trong `notification-logs.test.ts` và `notifications.test.ts` đều xanh, `pnpm check-types` không lỗi.
- **Verify:** `pnpm --filter server test -- notification-logs notifications && pnpm check-types` exits `0`.

## Verification

- `pnpm --filter server test -- notification-logs notifications` exits `0`.
- `pnpm check-types` exits `0`.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
