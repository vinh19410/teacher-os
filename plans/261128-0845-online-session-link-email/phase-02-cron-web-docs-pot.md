---
title: "Phase 2: Cron Job, Scheduler, Web UI, Docs & Visual POT"
status: completed
---

# Phase 2: Cron Job, Scheduler, Web UI, Docs & Visual POT

## Overview

Xây dựng `sessionLinkReminderEvent` và `runSessionLinkReminderCron`, ghép vào `dispatchScheduledCron` (`*/10 * * * *`), cập nhật nhãn trên màn Nhật ký thông báo web và `docs/production-release-runbook.md`, sau đó kiểm chứng toàn bộ local gates, code review độc lập và chụp ảnh POT 3 viewport Light/Dark.

## Requirements

- [ ] `apps/server/src/lib/notifications/templates.ts`: thêm `sessionLinkReminderEvent` (`channels: "email"`, `eventType: "session_link_reminder"`, `idempotencyKey: session_link_reminder:${classId}:${dateISO}:${time}:${studentId}`, `refType: "lesson"`, `refId: ${classId}:${dateISO}`).
- [ ] `apps/server/src/lib/notifications/session-link-reminder.ts`:
  - Truy vấn `lesson` thuộc `todayISO` hoặc `tomorrowISO` (giờ VN) có `status = 'upcoming'`, `class.status = 'active'`, `lower(trim(class.mode)) = 'online'`, `enrollment.status = 'active'`, loại `demo-student:%`, chưa có bản ghi `notification_record` cùng `(orgId, idempotencyKey)`.
  - Lọc theo `evaluateSessionLinkReminderWindow === "due"`, ưu tiên `lesson.zoom` hợp lệ hoặc fallback `class_session_meeting.join_url` hợp lệ; bỏ qua không tạo bản ghi nếu chưa có link (`skippedNoLink`) hoặc thiếu email (`skippedNoEmail`).
  - Pha 1 enqueue theo từng org; pha 2 chỉ resolve `getMailer` lazy khi có `queuedEmailIds.length > 0`, gửi tuần tự giãn nhịp `550ms/email`.
- [ ] `apps/server/src/lib/scheduled.ts`: chạy `executeSessionLinkReminder` trước `runZoomSync` trên mọi tick `*/10 * * * *` (và sau `executeDailyReminder` trong khung 23:00–23:09 UTC), cô lập lỗi giữa 3 tác vụ.
- [ ] `packages/infra/alchemy.run.ts` (comment) & `scripts/topology-drift.test.mjs`: cập nhật khớp `scheduled.ts`.
- [ ] `apps/web/src/routes/_auth/notifications/index.tsx`: thêm `session_link_reminder: "Nhắc link buổi học"`.
- [ ] `docs/production-release-runbook.md`: cập nhật quota Resend và mô tả cron `*/10 * * * *`.

## Files to Modify / Create

- `apps/server/src/lib/notifications/templates.ts`
- `apps/server/src/lib/notifications/templates.test.ts`
- `apps/server/src/lib/notifications/session-link-reminder.ts` (new)
- `apps/server/src/lib/notifications/session-link-reminder.test.ts` (new)
- `apps/server/src/lib/scheduled.ts`
- `apps/server/src/lib/scheduled.test.ts`
- `apps/server/src/routes/student-inbox.test.ts`
- `apps/server/src/routes/notification-logs.test.ts`
- `apps/web/src/routes/_auth/notifications/index.tsx`
- `apps/web/src/routes/_auth/notifications/index.test.tsx`
- `apps/web/src/components/modals/confirm-opening-modal.test.tsx`
- `packages/infra/alchemy.run.ts`
- `scripts/topology-drift.test.mjs`
- `docs/production-release-runbook.md`

## Implementation Steps (TDD)

1. Viết test trước cho `templates.test.ts`, `session-link-reminder.test.ts`, `scheduled.test.ts`, `student-inbox.test.ts`, `notification-logs.test.ts`, `confirm-opening-modal.test.tsx`, `notifications/index.test.tsx`, `topology-drift.test.mjs`.
2. Implement code ở `apps/server`, `apps/web`, `packages/infra`, và `docs/production-release-runbook.md`.
3. Chạy đầy đủ local gates (`biome check`, `check-types`, `topology-drift.test.mjs`, tests `@teacher-os/api`, `web`, `server`, `build`).
4. Chạy `code-reviewer` subagent độc lập, xử lý sạch Critical/Important.
5. Chụp ảnh POT 3 viewport Light/Dark vào `plans/reports/` và kiểm tra trực quan từng ảnh; dọn sạch tiến trình phụ trợ.

## Verification

- `pnpm exec biome check . && pnpm check-types && node --test scripts/topology-drift.test.mjs && pnpm --filter @teacher-os/api test && CI=1 pnpm --filter web test && pnpm --filter server test && pnpm build`
