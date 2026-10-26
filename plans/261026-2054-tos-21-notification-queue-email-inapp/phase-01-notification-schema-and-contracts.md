---
phase: 1
title: "Bảng notification_record, migration và zod contract"
status: pending
priority: P0
effort: "3h"
dependencies: []
---

# Phase 1: Schema + contract

## Files

- Create: `packages/db/src/schema/notification-record.ts` — bảng `notification_record` theo D1 của plan (unique `(org_id, idempotency_key)`, index `(org_id, created_at, id)`, `(org_id, student_id, created_at)`; FK `org_id` → `organization` cascade, `student_id` → `student` cascade).
- Modify: `packages/db/src/schema/index.ts` — export.
- Generate: `packages/db/src/migrations/0046_*.sql` qua `pnpm --filter @teacher-os/db db:generate` (không viết tay SQL; kiểm file sinh ra chỉ CREATE TABLE + INDEX).
- Modify: `packages/api/src/contracts.ts`:
  - `NOTIFICATION_EVENT_TYPES` (`class_enrolled`, `assignment_published`, `grade_returned`, `invoice_issued`, `tuition_reminder`, `schedule_changed`, `holiday_created`), `NOTIFICATION_EVENT_GROUPS` (`class_invite`, `assignment`, `tuition`, `schedule`) + map type → group.
  - `NOTIFICATION_STATUSES` (`queued`, `sent`, `read`, `failed`).
  - `notificationLogQuerySchema` (`q?`, `event?` group, `status?`, `page` ≥ 1), `NotificationLogRow`, `NotificationLogResponse { rows, total, counts: Record<status|"all", number> }`.
  - `StudentInboxItem`, `StudentInboxResponse { items, unread }`.

## Steps

1. Test đỏ: migration test theo mẫu `*-migration.test.ts` hiện có — bảng tồn tại, insert trùng `(org_id, idempotency_key)` bị bỏ qua với `onConflictDoNothing`, xóa org cascade.
2. Viết schema, generate migration, contract.

## Verification

- `pnpm --filter server test -- notification-record`
- `pnpm check-types`
