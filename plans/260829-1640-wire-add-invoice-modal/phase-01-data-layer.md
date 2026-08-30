---
phase: 1
title: "Data layer: hydrate enrollments + action add-invoice"
status: pending
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Data layer: hydrate enrollments + action add-invoice

## Overview

Mở kernel slice web thêm collection `enrollments` (mapper thuần) và khai báo action `add-invoice` với mapping transport sang `POST /api/invoices`. Modal ở Phase 2 chỉ tiêu thze layer này.

## Requirements

- Functional: `useData().data.enrollments` trả danh sách enrollment row; `dispatch({type:"add-invoice", payload})` POST đúng body.
- Non-functional: mapper thuần (no React), tab indent Biome, không đổi contract packages/api.

## Related Code Files

- Modify: `apps/web/src/lib/mock-data.ts` (KernelHydratedData thêm `enrollments: KernelEnrollmentRow[]`)
- Create: `apps/web/src/lib/repos/enrollments.ts` (mapper `mapEnrollments`)
- Modify: `apps/web/src/lib/repos/kernel.ts` (`mapKernelSnapshot` + case `"add-invoice"` trong `kernelCommand()`)
- Modify: `apps/web/src/lib/kernel-state.ts` (`emptyKernelData` type `KernelHydratedData` + key `enrollments: []`)
- Modify: `apps/web/src/lib/data-actions.ts` (union `KernelAction` thêm `add-invoice`)
- Modify: `apps/web/src/lib/data-provider.tsx` (type `data` từ `MockData` → `KernelSlice` nếu cần expose `.enrollments`)
- Test: `apps/web/src/lib/repos/kernel.test.ts` (fixture đã có `enrollments` `en-1`)

## Implementation Steps (TDD — test trước)

1. **Test trước:** trong `repos/kernel.test.ts` thêm case: `kernelCommand({type:"add-invoice", payload:{enrollmentId:"en-1", amount:400000, due:"2026-09-15", note:"Tháng 9"}})` → `{ path: "/api/invoices", body: { enrollmentId:"en-1", amount:400000, due:"2026-09-15", note:"Tháng 9" } }`; và case payload không có `note` → body gửi `note: ""` (chốt hiện trạng: body LUÔN mang `note`, không omit — khớp `note: payload.note ?? ""` ở step 6).
2. **Test trước:** case `mapKernelSnapshot(fixture)` → `enrollments` dài đúng, phần tử `{id, classId, studentId}` khớp fixture.
3. Implement `mapEnrollments` trong `repos/enrollments.ts` (map thẳng `KernelEnrollmentRow`, chỉ giữ `{id, classId, studentId, createdAt}`); nối vào `mapKernelSnapshot`.
4. Sửa `KernelHydratedData` = `Pick<MockData, ...> & { enrollments: KernelEnrollmentRow[] }` (import type từ `@teacher-os/api/contracts`); `emptyKernelData` đổi type sang `KernelHydratedData` và thêm `enrollments: []`.
5. Thêm variant vào `KernelAction`: `{ type: "add-invoice"; payload: { enrollmentId: string; amount: number; due: string; note?: string } }`.
6. Thêm case `"add-invoice"` trong `kernelCommand()` → `{ path: "/api/invoices", body: { enrollmentId, amount, due, note: payload.note ?? "" } }`.
7. Đổi kiểu `data` trong `data-provider.tsx` sang `KernelSlice` để consumer truy cập `.enrollments` (KernelSlice vẫn assignable sang `MockData` — Pick đủ 9 field — nên các hàm nhận `MockData` không vỡ).

## Success Criteria

- [x] `pnpm vitest run repos/kernel.test.ts` xanh (case mới pass).
- [x] `pnpm check-types` web xanh (trừ contract test Phase 2 sẽ cập nhật).
- [x] Không file nào ngoài scope bị đổi.

## Risk Assessment

- `data-provider` type change ripple — `KernelSlice` là superset của `MockData`, các consumer truyền `data` vào hàm nhận `MockData` vẫn type-check; nếu `check-types` đỏ ở file lạ thì trả `enrollments` qua field riêng của context thay vì đổi type `data`.
