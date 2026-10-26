---
phase: 4
title: "E2E AC-003"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-03"]
---

# Phase 4: E2E AC-003

## Files

- Create: `apps/e2e/specs/holiday-cancel-and-undo.spec.ts` (tái dùng seed của `holiday-shift.spec.ts`).

## Kịch bản

1. **Hủy buổi:** mở `/schedule` → **+ Tạo lịch nghỉ** → chọn "Hủy buổi (không bù)" → bảng ghi "Hủy buổi (không bù)" → xác nhận → buổi trong tuần nghỉ hiện "Đã hủy", tuần sau buổi cuối của lớp không có buổi mới.
2. **Hoàn tác:** tạo kỳ nghỉ tương lai phương thức Dời lịch → thấy buổi bù ở cuối khóa → bấm "Xóa kỳ nghỉ (Hoàn tác)" → xác nhận → buổi gốc hiện lại như buổi thường, tuần chứa ngày bù không còn buổi bù, thẻ kỳ nghỉ biến mất.
3. Kỳ nghỉ đã bắt đầu (seed `fromDate` = hôm nay) không có nút hoàn tác.
4. Kịch bản 2 lặp ở 375×812.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e holiday-cancel-and-undo`
- Trước khi merge vào `develop`: full suite Playwright.
