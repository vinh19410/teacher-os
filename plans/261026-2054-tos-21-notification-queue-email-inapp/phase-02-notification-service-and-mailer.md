---
phase: 2
title: "Service enqueue/deliver, Reply-To + tên người gửi, AppDeps.mailer"
status: pending
priority: P0
effort: "5h"
dependencies: ["phase-01"]
---

# Phase 2: Service thông báo + mailer

## Files

- Modify: `packages/auth/src/mail/mailer.ts` — `MailInput` thêm `replyTo?: string`, `fromName?: string`; Resend: `from = fromName ? \`"${fromName}" <${address(from)}>\` : from`, `reply_to` khi có. Log mailer in thêm 2 trường. Test hiện có của mailer phải còn xanh.
- Modify: `apps/server/src/app.ts` — `AppDeps.mailer?: Mailer` (JSDoc theo giọng các dep khác).
- Modify: `apps/server/src/index.ts` — tách `getMailer()` lười (giữ nguyên check `RESEND_API_KEY` + cảnh báo log-only), dùng chung cho `createAuth` và `buildApp`.
- Modify: `apps/e2e/src/boot.ts` — truyền `recordingMailer` vào app; recording lưu thêm `replyTo`, `fromName`, `subject` để E2E đọc.
- Create: `apps/server/src/lib/notifications/enqueue.ts`
  - `type NotificationEvent = { type; studentId; idempotencyKey; title; body; linkPath; refType; refId }`.
  - `enqueueNotifications(db, orgId, events)`: lọc `studentId` thuộc org; đọc `organization.name` + email chủ org (membership `teacher`/`owner` sớm nhất → `user.email`); `channels = email hợp lệ ? "email,in_app" : "in_app"`; bản ghi chỉ `in_app` → `status = "sent"`, `sent_at = now`; insert theo lô `onConflictDoNothing` trên `(org_id, idempotency_key)`; trả id các dòng mới (`returning`).
- Create: `apps/server/src/lib/notifications/deliver.ts`
  - `deliverNotifications(db, mailer | undefined, ids)`: chỉ xử lý dòng `queued` có kênh email; render thư (subject = `title`, text/html từ `body` + link tuyệt đối tới cổng học viên theo `STUDENT_ORIGINS[0]`); OK → `status = read_at ? "read" : "sent"`, `sent_at`; lỗi → giữ `queued`, `retry_count + 1`, `last_error` (cắt 500 ký tự, không chứa API key). Update có điều kiện `status = 'queued'` để chạy song song không ghi đè.
- Create: `apps/server/src/lib/notifications/emit.ts` — `emitNotifications(deps, orgId, events)`: `enqueue` trong try/catch (log, không ném), rồi `deps.runInBackground?.(deliverNotifications(...))` (không có `runInBackground` → `await`, để test node chạy tuần tự).
- Create: `apps/server/src/lib/notifications/templates.ts` — builder thuần cho từng `event_type` (tiêu đề / nội dung tiếng Việt, `linkPath` trên cổng học viên, khóa chống trùng theo D3). TOS-18 sẽ dùng `tuitionReminderEvent(invoice, vnDate)`.
- Test: `apps/server/src/lib/notifications/notifications.test.ts`.

## Steps

1. Test đỏ:
   - enqueue 2 sự kiện → 2 dòng `queued`, `sender_name` = tên org, `reply_to_email` = email chủ org; enqueue lại cùng khóa → 0 dòng mới.
   - học viên không email → `channels = "in_app"`, `status = "sent"`.
   - học viên org khác → bị bỏ qua.
   - deliver với mailer giả OK → `sent`; mailer ném lỗi → `queued`, `retry_count = 1`, `last_error`; đã có `read_at` → `read`.
   - mailer nhận `replyTo`, `fromName` đúng; Resend body có `reply_to` và `from` có tên.
   - `emitNotifications` khi enqueue ném lỗi → không ném ra ngoài.
2. Viết code cho xanh.

## Verification

- `pnpm --filter server test -- notifications`
- `pnpm --filter @teacher-os/auth test -- mailer`
- `pnpm check`, `pnpm check-types`
