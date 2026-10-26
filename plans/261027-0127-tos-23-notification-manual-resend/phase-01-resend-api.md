---
phase: 1
title: "Service requeueFailedNotifications và 2 endpoint Gửi lại"
status: pending
priority: P0
effort: "4h"
dependencies: ["TOS-22 phase 1"]
---

# Phase 1: Resend API

## Files

- Create: `apps/server/src/lib/notifications/requeue.ts` — `requeueFailedNotifications(db, orgId, { ids } | { q?, event?, limit })`:
  - Chọn bản ghi `failed` của org (theo `ids` hoặc bộ lọc `q + event`, mới nhất trước, `limit + 1` để tính `remaining`), join `student` lấy `email` hiện tại. Tái dùng hàm dựng `qFilter` — tách từ `notification-logs.ts` sang helper dùng chung (`buildNotificationLogFilter`) thay vì copy.
  - Bản ghi có email trống → `skipped: [{ id, reason: "no_email" }]`.
  - UPDATE theo D1 của plan với `RETURNING id` (SQLite/D1 hỗ trợ qua drizzle `.returning`) → `requeuedIds`.
- Modify: `apps/server/src/routes/notification-logs.ts`:
  - deps đổi thành kiểu nhận `getDb`, `mailer?`, `runInBackground?`, `studentOrigin?`, `notificationRetryDelaysMs?` (kernel truyền `deps` sẵn có).
  - `POST /:id/resend`, `POST /resend-failed` theo D3; sau reset gọi deliver qua `runInBackground` (D4).
- Modify: `packages/api/src/contracts.ts` — `resendFailedBodySchema` (`q?`, `event?`), `NotificationResendResponse { requeued: number; skipped: { id: string; reason: "no_email" }[]; remaining: number }`, `RESEND_BATCH_LIMIT = 50`.

## Steps

1. Test đỏ `apps/server/src/routes/notification-logs.test.ts`:
   - resend 1 bản ghi `failed` → `queued`, `retry_count = 0`, `last_error = null`, mailer được gọi 1 lần, tổng số bản ghi không đổi, inbox học viên vẫn 1 mục.
   - email học viên đổi trước khi resend → mailer nhận địa chỉ mới, `recipient_email` mới.
   - bản ghi `sent` → 409; id org khác → 404; resend 2 lần liên tiếp → lần 2 409, mailer chỉ 1 lần.
   - resend-failed với `event` → chỉ reset nhóm đó; > 50 bản ghi → `requeued = 50`, `remaining > 0`.
   - học viên email trống → `skipped`.
   - request thiếu Origin hợp lệ → 403 (guard kernel).
2. Cài đặt.

## Verification

- `pnpm --filter server test -- notification-logs notifications`
- `pnpm check-types`
