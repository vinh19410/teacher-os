---
phase: 1
title: "Bảng org_event, contract và API sự kiện vận hành"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Sự kiện vận hành — dữ liệu và API

> Scope split 2026-10-26: phase này không còn phụ thuộc #445. Giảm diện tích đụng file chung với
> agent #445 đang chạy song song: schema để file riêng `org-event.ts`; contract sự kiện để file
> riêng `event-contracts.ts` (KHÔNG nối vào cuối `contracts.ts` — #445 đã chiếm vùng đó); trong
> `contracts.ts` chỉ thêm `events: KernelEventRow[]` vào `KernelSnapshot` + import; KHÔNG đụng
> `skeleton.ts`; trong `snapshot.ts` đặt khối truy vấn events riêng và field `events` ngay sau
> `lessons`. Migration commit riêng `feat(db): add org_event table (#447)`; trước merge kiểm
> develop đã có `0046` của #445 chưa — có thì regenerate (không rename tay `_journal.json`).

## Files to Create / Modify

- Create: `packages/db/src/schema/org-event.ts` (D3); export ở `packages/db/src/schema/index.ts` (vị trí alphabet `org-bank-link` < `org-event` < `organization`).
- Create: migration qua `pnpm --filter @teacher-os/db db:generate` (đọc SQL; backup DB dev trước khi migrate).
- Create: `packages/api/src/event-contracts.ts` — `ORG_EVENT_TITLE_MIN/MAX`, `orgEventDraftSchema` (title trim 2..100, `date` strict, `startTime`/`endTime` HH:mm, `endTime > startTime`, `note` ≤ 500), kiểu `KernelEventRow`/`OrgEvent`; re-export qua `contracts.ts` nếu cần cho server/web import thuận.
- Create: `packages/api/src/event-contracts.test.ts`.
- Create: `apps/server/src/routes/events.ts` + `events.test.ts` theo mẫu `daily-attendance.ts` (Hono con, `kernelCtx`, 401 khi thiếu).
- Modify: `apps/server/src/routes/kernel.ts` — `kernel.route("/events", eventRoutes(deps))`.
- Modify: `apps/server/src/routes/snapshot.ts` — trả `events` của org.

## Tasks & Steps

1. Test contract đỏ: title 1 / 101 ký tự bị từ chối; `endTime <= startTime` bị từ chối; ngày `2026-02-30` bị từ chối.
2. Test route đỏ: POST tạo và trả `OrgEvent`; snapshot có sự kiện; DELETE xóa; org khác DELETE → 404; không có dòng `lesson` nào thay đổi; `/attendance/daily` và dashboard reminders không đổi khi có sự kiện cùng ngày.
3. Code cho xanh.

## Verification

- `pnpm --filter @teacher-os/api test -- event-contracts`
- `pnpm --filter server test -- events kernel-occurrence daily-attendance dashboard-reminders`
- `pnpm check-types`
