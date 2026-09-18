---
title: "Phase 1: Sửa topbar unread badge, NotifPanel empty state & responsive layout"
status: completed
priority: P1
effort: "1h"
---

# Phase 1: Sửa topbar unread badge, NotifPanel empty state & responsive layout

## Requirements

1. `apps/web/src/components/layout/topbar.tsx`:
   - Chỉ render chấm đỏ unread badge khi `data.notifs.length > 0`.
   - Thêm `max-app:ml-auto` vào `div` bọc chuông (`bellWrapRef`) để trên mobile khi thanh tìm kiếm bị ẩn, icon chuông luôn được căn về cạnh phải.
2. `apps/web/src/components/layout/notif-panel.tsx`:
   - Khi `notifs.length === 0`: render empty state với thông điệp `"Chưa có thông báo nào"`.
   - Về styling responsive: trên `max-app:` (mobile <= 920px), cố định vị trí `max-app:fixed max-app:top-14 max-app:right-4 max-app:left-4 max-app:w-auto` để đảm bảo popover không bao giờ bị cắt mép phải hay tràn màn hình.
3. Unit / Contract test:
   - Thêm test suite cho `Topbar` and `NotifPanel`:
     - Test badge chỉ render khi `notifs.length > 0` và không render khi `notifs.length === 0`.
     - Test `NotifPanel` render empty state khi `notifs` rỗng.
     - Test `NotifPanel` render danh sách thông báo khi `notifs` có phần tử.
   - Giữ nguyên contract test `kernel-runtime.contract.test.ts`.

## Verification Commands

- `pnpm test apps/web/src/components/layout/`
- `pnpm check`
- `pnpm check-types`
