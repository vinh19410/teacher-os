---
phase: 1
title: "Bảng holiday_session_cancel, contract mode, planner chế độ cancel"
status: completed
priority: P1
effort: "3h"
dependencies: ["#445", "#446"]
---

# Phase 1: Schema + contract + planner

## Files to Create / Modify

- Modify: `packages/db/src/schema/organization-holiday.ts` — thêm `holiday_session_cancel` (D1), docstring: chỉ ghi buổi bị hủy bởi kỳ nghỉ `mode = "cancel"`, nguồn duy nhất cho hoàn tác.
- Create: migration qua `pnpm --filter @teacher-os/db db:generate` (đọc SQL: 1 `CREATE TABLE`, unique, không đụng bảng cũ). Backup DB dev trước khi migrate.
- Modify: `packages/api/src/contracts.ts` — `holidayDraftSchema.mode` từ `z.literal("shift")` thành `z.enum(["shift","cancel"])`; kiểu `HolidayPreview` thêm `cancellations`; `HolidayApplyResult` thêm `cancelledCount`; kiểu `HolidayDeleteResult` (`restoredCount`, `removedMakeupCount`).
- Modify: `packages/api/src/holiday-plan.ts` + test — tham số `mode` (D2).
- Modify: `packages/api/src/holiday-contracts.test.ts`.

## Tasks & Steps

1. Test đỏ planner: `mode="cancel"` → `cancellations` đủ buổi `upcoming` trong khoảng, `shifts` rỗng, không quét ngày bù; buổi đã điểm danh vào `keptCompleted`; buổi toàn `cancelled` bỏ qua; lớp legacy có `date` vẫn hủy được, lớp `undated` → `unsupported`.
2. Test contract: `mode` lạ bị từ chối; `"cancel"` được nhận.
3. Viết code cho xanh.

## Verification

- `pnpm --filter @teacher-os/api test -- holiday-plan holiday-contracts`
- `pnpm --filter @teacher-os/db db:migrate:deploy` (DB dev đã backup)
- `pnpm check-types`
