---
phase: 2
title: "Nhãn Lỗi gửi + thông điệp E-010 trên màn Nhật ký thông báo [5]"
status: pending
priority: P0
effort: "2h"
dependencies: [1]
---

# Phase 2: UI dòng failed

## Files

- Modify: `apps/web/src/routes/_auth/notifications/index.tsx`:
  - Ô người nhận: dòng `failed` thêm `<p class="text-destructive text-xs">` `E-010: {cause} sau {retryCount} lần thử` — `cause` = `lastError` bỏ tiền tố `E-selfomy-alignment-010: `, cắt ~80 ký tự, `title` = bản đầy đủ.
  - Hộp thoại chi tiết: thêm dòng "Số lần thử Email: N/3" và khối "Lỗi gần nhất" khi `lastError` có giá trị.
- Create (nếu helper đủ lớn để test riêng): `apps/web/src/lib/notification-error.ts` — `formatDeliveryError(lastError)` dùng `NOTIFICATION_ERROR_CODES` từ contract; test `notification-error.test.ts`.

## Steps

1. Test đỏ cho `formatDeliveryError` (có tiền tố / không tiền tố / null / chuỗi dài).
2. Sửa màn theo `DESIGN.md` (token `destructive`, không hard-code màu).
3. Verify 3 viewport (1440×900, 768×1024, 375×812): hàng phụ xuống dòng không vỡ bảng ở 375; focus bàn phím vào nút eye còn đúng.

## Verification

- `pnpm --filter web test -- notification`
- `pnpm check`
