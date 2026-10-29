---
phase: 1
title: "Vòng thử 3 lượt, trạng thái failed và mã E-selfomy-alignment-010"
status: completed
priority: P0
effort: "4h"
dependencies: []
---

# Phase 1: Retry loop + trạng thái `failed` (`E-selfomy-alignment-010`)

<!-- Updated: Validation & Red Team Session 1 - Handover decomposition + SQL CASE last_error + 4 route factories + boot.ts single buildApp -->

## Goal

Cài đặt vòng thử lại tự động tối đa `MAX_EMAIL_ATTEMPTS = 3` lượt trong `deliverNotifications` với khoảng chờ inject được (`retryDelaysMs`, mặc định `[2000, 5000]`), chuyển bản ghi sang `status = 'failed'` kèm tiền tố `E-selfomy-alignment-010: ` (đã làm sạch secret, cắt ≤ 500 ký tự) khi chạm lượt lỗi thứ 3, xóa `last_error = null` nếu thành công ở lượt thử lại, và giữ nguyên trạng thái `failed` khi học viên mở đọc thông báo In-app.

## Files to Create or Modify

- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/lib/notifications/deliver.ts`
- Modify: `apps/server/src/lib/notifications/emit.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/kernel.ts`
- Modify: `apps/server/src/routes/grading.ts`
- Modify: `apps/server/src/routes/holidays.ts`
- Modify: `apps/server/src/routes/assignments/index.ts`
- Modify: `apps/e2e/src/boot.ts`
- Modify: `apps/server/src/lib/notifications/notifications.test.ts`
- Modify: `apps/server/src/routes/student-inbox.test.ts`

## Tasks & Steps

### Task 1.1 — Thêm hằng số `NOTIFICATION_ERROR_CODES` và `MAX_EMAIL_ATTEMPTS` vào contract
- **Goal:** Xuất mã lỗi chuẩn `E-selfomy-alignment-010` và giới hạn `MAX_EMAIL_ATTEMPTS = 3` từ `@teacher-os/api/contracts` để server và web dùng chung.
- **Target files and symbols:** `packages/api/src/contracts.ts` (ngay dưới `NOTIFICATION_STATUSES` tại dòng ~3418).
- **Steps:**
  1. Thêm `export const MAX_EMAIL_ATTEMPTS = 3;` và `export const NOTIFICATION_ERROR_CODES = { DELIVERY_FAILED: "E-selfomy-alignment-010" } as const;` ngay sau `export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];`.
- **Success criteria:** `@teacher-os/api/contracts` export cả `MAX_EMAIL_ATTEMPTS` (= `3`) và `NOTIFICATION_ERROR_CODES.DELIVERY_FAILED` (= `"E-selfomy-alignment-010"`).
- **Verify:** no verification needed (sẽ được kiểm tra biên dịch và chạy test ở Task 1.2–1.4).

### Task 1.2 — Viết test đỏ (TDD Red) cho vòng retry 3 lượt và inbox học viên
- **Goal:** Tạo bộ unit test phủ đầy đủ các kịch bản retry 3 lượt, chuyển `failed` kèm `E-selfomy-alignment-010:`, thành công ở lượt 2/3 xóa `last_error`, bỏ qua bản ghi đã `retry_count >= 3`, và học viên đọc thông báo `failed` không làm mất trạng thái `failed`.
- **Target files and symbols:**
  - `apps/server/src/lib/notifications/notifications.test.ts` (`describe("notifications service (#454 phase 2)")`)
  - `apps/server/src/routes/student-inbox.test.ts` (`describe("student inbox (/api/student/inbox)")`)
- **Steps:**
  1. Trong `apps/server/src/lib/notifications/notifications.test.ts`:
     - Cập nhật test `"mailer ném lỗi..."` hiện có và bổ sung các test mới (truyền `{ retryDelaysMs: [0, 0] }` vào tham số thứ 5 của `deliverNotifications`):
       - Mailer luôn ném lỗi (kèm `Bearer re_secret_12345`) → gọi đúng 3 lần, `status === "failed"`, `retryCount === 3`, `lastError` bắt đầu bằng `"E-selfomy-alignment-010: "`, không chứa `"re_secret_12345"`, độ dài `<= 500`.
       - Mailer ném lỗi 2 lần đầu rồi lần 3 thành công → gọi đúng 3 lần, `status === "sent"`, `retryCount === 2`, `lastError === null`, `sentAt !== null`.
       - Batch 2 bản ghi, 1 bản ghi thành công ngay ở lượt 1, 1 bản ghi lỗi cả 3 lượt → mailer được gọi tổng cộng 4 lần (bản ghi OK chỉ gửi 1 lần, không bị gửi lại ở lượt 2 và 3).
       - Bản ghi đã có `status === "failed"` hoặc `retryCount === 3` trước khi gọi `deliverNotifications` → mailer không được gọi (`calls === 0`).
  2. Trong `apps/server/src/routes/student-inbox.test.ts`:
     - Thêm test ở cuối `describe` (seed bản ghi `n-failed` cho `student-quan` hoặc dọn dẹp sau test để không làm lệch số đếm `unread` của `student-hoa` ở các test đứng trước): xác minh `GET /api/student/inbox` trả về cả bản ghi `status: "failed"`, và `POST /api/student/inbox/:id/read` đặt `readAt !== null` nhưng giữ nguyên `status === "failed"`.
- **Success criteria:** Các test mới phản ánh đúng AC-002; test trong `notifications.test.ts` fail (Red) trước khi sửa `deliver.ts`.
- **Verify:** `pnpm --filter server test -- notifications` thoát với mã khác 0 (Red phase: các assertion về 3 lần gọi và `status === "failed"` thất bại vì `deliver.ts` mới chỉ chạy 1 lượt).

### Task 1.3 — Cài đặt vòng retry 3 lượt trong `deliverNotifications` và nối DI `notificationRetryDelaysMs`
- **Goal:** Thực thi vòng thử lại tối đa 3 lượt trong `deliverNotifications`, cập nhật nguyên tử `status` / `retry_count` / `last_error` bằng SQL, và truyền `notificationRetryDelaysMs` qua `emit.ts`, `app.ts`, 4 route factory và `apps/e2e/src/boot.ts`.
- **Target files and symbols:**
  - `apps/server/src/lib/notifications/deliver.ts` (`deliverNotifications`, `sanitizeDeliveryError`)
  - `apps/server/src/lib/notifications/emit.ts` (`NotificationDeps`, `notificationDepsFrom`, `emitNotifications`)
  - `apps/server/src/app.ts` (`AppDeps`)
  - `apps/server/src/routes/kernel.ts` (`kernelRoutes`)
  - `apps/server/src/routes/grading.ts` (`gradingRoutes`)
  - `apps/server/src/routes/holidays.ts` (`holidayRoutes`)
  - `apps/server/src/routes/assignments/index.ts` (`assignmentRoutes`)
  - `apps/e2e/src/boot.ts` (`buildApp`)
- **Steps:**
  1. Trong `apps/server/src/lib/notifications/deliver.ts`:
     - Import `MAX_EMAIL_ATTEMPTS, NOTIFICATION_ERROR_CODES` từ `@teacher-os/api/contracts` và `lt` từ `drizzle-orm`.
     - Viết hàm `sanitizeDeliveryError(raw: string): { rawError: string; failedError: string }`:
       - Thay thế `/Bearer\s+\S+/gi` bằng `"Bearer [REDACTED]"` và `/\bre_[A-Za-z0-9_]+\b/g` bằng `"[REDACTED]"`.
       - Bỏ tiền tố `${NOTIFICATION_ERROR_CODES.DELIVERY_FAILED}: ` nếu đã có ở đầu chuỗi, `.trim()`, nếu rỗng thì dùng `"Unknown delivery error"`.
       - `rawError = cleaned.slice(0, LAST_ERROR_MAX)`.
       - `failedError = `${NOTIFICATION_ERROR_CODES.DELIVERY_FAILED}: ${cleaned}`.slice(0, LAST_ERROR_MAX)`.
     - Thêm tham số thứ 5 `options?: { retryDelaysMs?: number[] }` cho `deliverNotifications` (mặc định `DEFAULT_RETRY_DELAYS_MS = [2000, 5000]`).
     - Duyệt `for (let pass = 0; pass < MAX_EMAIL_ATTEMPTS && pendingIds.length > 0; pass++)`:
       - Nếu `pass > 0`: `const delayMs = delays[pass - 1] ?? 0; if (delayMs > 0) await sleep(delayMs);`.
       - Query từ `notificationRecord` các dòng có `inArray(notificationRecord.id, pendingIds)`, `eq(notificationRecord.status, "queued")`, `lt(notificationRecord.retryCount, MAX_EMAIL_ATTEMPTS)`.
       - Khởi tạo `const nextPendingIds: string[] = []`.
       - Với mỗi `row`: nếu `!row.channels.includes("email") || !row.recipientEmail` thì bỏ qua.
       - Trong `try`: gọi `await mailer.send(...)`, sau đó `UPDATE notification_record SET status = CASE WHEN read_at IS NULL THEN 'sent' ELSE 'read' END, sent_at = new Date(), last_error = null WHERE id = row.id AND status = 'queued'`.
       - Trong `catch (error)`: tính `{ rawError, failedError } = sanitizeDeliveryError(message)`, chạy `UPDATE notification_record SET retry_count = retry_count + 1, status = CASE WHEN retry_count + 1 >= 3 THEN 'failed' ELSE status END, last_error = CASE WHEN retry_count + 1 >= 3 THEN failedError ELSE rawError END WHERE id = row.id AND status = 'queued'`. Nếu `row.retryCount + 1 < MAX_EMAIL_ATTEMPTS` thì `nextPendingIds.push(row.id)`.
       - Cuối lượt: `pendingIds = nextPendingIds`.
  2. Trong `apps/server/src/lib/notifications/emit.ts`:
     - Thêm `retryDelaysMs?: number[]` vào `NotificationDeps`.
     - Trong `notificationDepsFrom(deps)`, nhận thêm `notificationRetryDelaysMs?: number[]` và ánh xạ thành `retryDelaysMs: deps.notificationRetryDelaysMs`.
     - Trong `emitNotifications`, truyền `{ retryDelaysMs: deps.retryDelaysMs }` làm đối số thứ 5 của `deliverNotifications`.
  3. Trong `apps/server/src/app.ts` (`AppDeps`) và 4 route factory (`apps/server/src/routes/kernel.ts`, `apps/server/src/routes/grading.ts`, `apps/server/src/routes/holidays.ts`, `apps/server/src/routes/assignments/index.ts`):
     - Thêm `notificationRetryDelaysMs?: number[]` vào kiểu `deps`.
  4. Trong `apps/e2e/src/boot.ts`:
     - Truyền `notificationRetryDelaysMs: [0, 0]` vào lời gọi `buildApp({...})` tại dòng ~142.
- **Success criteria:** Toàn bộ unit test trong `notifications.test.ts` và `student-inbox.test.ts` đều xanh; kiểm tra kiểu toàn repo không báo lỗi.
- **Verify:** `pnpm --filter server test -- notifications student-inbox && pnpm check-types` thoát với mã `0`.

## Verification

- `pnpm --filter server test -- notifications student-inbox` exits `0`.
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
