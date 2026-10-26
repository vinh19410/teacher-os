---
phase: 1
title: "markAllPresent() trong reducer nháp điểm danh"
status: pending
priority: P2
effort: "1.5h"
dependencies: ["TOS-7 phase 3"]
---

# Phase 1: Thao tác hàng loạt trong reducer nháp

## Goal

Thêm một action thuần vào reducer nháp của một ca để điền `present` cho mọi học viên chưa có trạng thái, dùng chung cho nút điền nhanh và hộp xác nhận khi lưu.

## Files to Create / Modify

- Modify: `apps/web/src/lib/attendance-draft.ts` (TOS-7 tạo). Thêm action `markAllPresent()`:
  - Với mỗi dòng có `attendance === undefined/null` thì đặt `present`.
  - Không đổi dòng đã có trạng thái, không đổi `note`.
  - Trả về cùng tham chiếu state nếu không có dòng nào đổi, để component không re-render vô ích.
- Modify: `apps/web/src/lib/attendance-draft.test.ts`.

## Tasks & Steps

1. Test đỏ:
   - Nháp 4 học viên, 1 người đã chọn `excused`: sau `markAllPresent()` có 3 `present`, người kia vẫn `excused`.
   - Ghi chú đã nhập không bị xoá.
   - `missing()` trả mảng rỗng sau action.
   - Gọi trên nháp đã đủ trạng thái trả về đúng tham chiếu cũ.
2. Viết action cho test xanh.

## Verification

- `pnpm --filter web test -- attendance-draft`
- `pnpm check-types`
