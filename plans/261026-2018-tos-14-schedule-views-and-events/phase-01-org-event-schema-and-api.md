---
phase: 1
title: "Bảng org_event, contract và API sự kiện vận hành"
status: pending
priority: P1
effort: "4h"
dependencies: ["#445"]
---

# Phase 1: Sự kiện vận hành — dữ liệu và API

## Files to Create / Modify

- Create: `packages/db/src/schema/org-event.ts` (D3); export ở `packages/db/src/schema/index.ts`.
- Create: migration qua `pnpm --filter @teacher-os/db db:generate` (đọc SQL; backup DB dev trước khi migrate).
- Modify: `packages/api/src/contracts.ts` — `ORG_EVENT_TITLE_MIN/MAX`, `orgEventDraftSchema` (title trim 2..100, `date` strict, `startTime`/`endTime` HH:mm, `endTime > startTime`, `note` ≤ 500), kiểu `OrgEvent`; snapshot thêm `events`.
- Create: `packages/api/src/org-event-contracts.test.ts`.
- Create: `apps/server/src/routes/events.ts` + `events.test.ts` theo mẫu `holidays.ts` (Hono con, `kernelCtx`, 401 khi thiếu).
- Modify: `apps/server/src/routes/kernel.ts` — `kernel.route("/events", eventRoutes(deps))`.
- Modify: `apps/server/src/routes/snapshot.ts` — trả `events` của org.

## Tasks & Steps

1. Test contract đỏ: title 1 / 101 ký tự bị từ chối; `endTime <= startTime` bị từ chối; ngày `2026-02-30` bị từ chối.
2. Test route đỏ: POST tạo và trả `OrgEvent`; snapshot có sự kiện; DELETE xóa; org khác DELETE → 404; không có dòng `lesson` nào thay đổi; `/attendance/daily` và dashboard reminders không đổi khi có sự kiện cùng ngày.
3. Code cho xanh.

## Verification

- `pnpm --filter @teacher-os/api test -- org-event-contracts`
- `pnpm --filter server test -- events kernel-occurrence daily-attendance dashboard-reminders`
- `pnpm check-types`
