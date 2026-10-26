---
phase: 2
title: "Nút Gửi lại trên dòng failed và nút Gửi lại tất cả mục lỗi (N)"
status: pending
priority: P0
effort: "3h"
dependencies: [1]
---

# Phase 2: UI Gửi lại

## Files

- Modify: `apps/web/src/lib/repos/notifications.ts` — `resendNotification(id)`, `resendFailedNotifications({ q, event })` (POST JSON, cùng client fetch có sẵn); test trong `notifications.test.ts`.
- Modify: `apps/web/src/routes/_auth/notifications/index.tsx`:
  - Cột Thao tác: dòng `failed` thêm `Button size="sm" variant="outline"` "Gửi lại" (icon rotate) trước nút eye; `aria-label` có tên người nhận.
  - Header: "Gửi lại tất cả mục lỗi ({counts.failed})" khi `counts.failed > 0` → `AlertDialog` xác nhận (component shadcn trong `apps/web/src/components/ui/`).
  - `useMutation` → toast (`Đã đưa N thông báo về hàng đợi`; kèm số bỏ qua do thiếu Email; nếu `remaining > 0` nhắc bấm lại) → `invalidateQueries(notificationLogsQueryKey)`; disable nút khi pending.

## Steps

1. Test đỏ cho repo functions (URL, method, body).
2. Sửa UI theo `DESIGN.md`; nút dòng không làm vỡ cột ở 375px (ẩn chữ, giữ icon + `aria-label` nếu cần).
3. Verify 3 viewport + Tab tới nút Gửi lại / mở và đóng AlertDialog bằng bàn phím.

## Verification

- `pnpm --filter web test -- notifications`
- `pnpm check`
