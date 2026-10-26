---
phase: 3
title: "E2E AC-003: Gửi lại không nhân bản In-app"
status: pending
priority: P0
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E AC-003

## Files

- Create: `apps/e2e/specs/notifications-ac-003.spec.ts` — tái dùng cơ chế `@bounce.test` của TOS-22 (`apps/e2e/src/boot.ts`).

## Steps

1. Tạo bản ghi `failed` như AC-002 (học viên `<random>@bounce.test`, ghi danh vào lớp, chờ `failed`).
2. Mở `/notifications?status=failed`: nút "Gửi lại" hiện trên dòng (phần "hiển thị nút" của AC-002).
3. Bấm "Gửi lại" → toast; poll tới khi bản ghi lại `failed` (địa chỉ vẫn lỗi) và mail log có thêm đúng 3 lần thử; API logs của học viên đó vẫn đúng 1 bản ghi; inbox học viên (API `GET /api/student/inbox` qua session portal nếu helper sẵn có) vẫn 1 mục.
4. Kịch bản bulk: 2 học viên `@bounce.test` → "Gửi lại tất cả mục lỗi (2)" → xác nhận → cả 2 về hàng đợi; chip "Lỗi gửi" cập nhật sau khi chạy xong.
5. Dòng `sent` không có nút "Gửi lại".

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-00`
