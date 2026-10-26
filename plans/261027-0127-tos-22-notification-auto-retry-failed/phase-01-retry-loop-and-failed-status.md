---
phase: 1
title: "Vòng thử 3 lượt, trạng thái failed và mã E-selfomy-alignment-010"
status: pending
priority: P0
effort: "4h"
dependencies: []
---

# Phase 1: Retry loop + failed

## Files

- Modify: `packages/api/src/contracts.ts` — thêm `NOTIFICATION_ERROR_CODES = { DELIVERY_FAILED: "E-selfomy-alignment-010" } as const` và `MAX_EMAIL_ATTEMPTS = 3` cạnh `NOTIFICATION_STATUSES`.
- Modify: `apps/server/src/lib/notifications/deliver.ts`:
  - Tham số thứ 5 `options?: { retryDelaysMs?: number[] }` (mặc định `[2000, 5000]`).
  - Select thêm `retryCount`; bỏ qua bản ghi `retryCount >= MAX_EMAIL_ATTEMPTS`.
  - Vòng `for (pass = 0; pass < MAX_EMAIL_ATTEMPTS && pending.length; pass++)`: pass > 0 thì `await sleep(delays[pass - 1])`; gửi từng bản ghi trong `pending`; OK → UPDATE `sent`/`read` như hiện tại; lỗi → UPDATE `retry_count + 1`, `status = CASE WHEN retry_count + 1 >= 3 THEN 'failed' ELSE status END`, `last_error` = message (có tiền tố mã khi chạm 3) — điều kiện `status = 'queued'`; bản ghi chưa chạm 3 vào `pending` của lượt sau.
  - Bản ghi bắt đầu với `retryCount = k` (vd sau reset của TOS-23 là 0) chỉ còn `3 - k` lượt.
- Modify: `apps/server/src/lib/notifications/emit.ts` — `NotificationDeps.retryDelaysMs?`, truyền xuống deliver; `notificationDepsFrom` đọc `deps.notificationRetryDelaysMs`.
- Modify: `apps/server/src/app.ts` — `AppDeps.notificationRetryDelaysMs?: number[]` (comment: chỉ test/E2E đặt `[0, 0]`).
- Modify: `apps/e2e/src/boot.ts` — truyền `notificationRetryDelaysMs: [0, 0]` cho cả 2 lần build app.

## Steps

1. Test đỏ trong `apps/server/src/lib/notifications/notifications.test.ts` (delay `[0, 0]`):
   - mailer luôn ném → gọi 3 lần, `failed`, `retry_count = 3`, `last_error` bắt đầu `E-selfomy-alignment-010:`.
   - mailer ném 2 lần rồi OK → `sent`, `retry_count = 2`.
   - 2 bản ghi, chỉ 1 lỗi → bản ghi OK chỉ gửi 1 lần (lượt sau không gửi lại).
   - bản ghi đã `failed` / `retry_count = 3` → không gọi mailer.
   - sửa test hiện có "mailer ném lỗi → giữ queued, retry_count = 1" thành kịch bản lỗi 1 lần rồi OK (hành vi mới).
2. Test đỏ trong `apps/server/src/routes/student-inbox.test.ts`: bản ghi `failed` vẫn có trong inbox; `POST /inbox/:id/read` đặt `read_at`, `status` giữ `failed`.
3. Cài đặt theo Files.

## Verification

- `pnpm --filter server test -- notifications student-inbox`
- `pnpm check-types`
