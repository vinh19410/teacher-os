---
phase: 3
title: "E2E AC-002"
status: pending
priority: P1
effort: "2h"
dependencies: ["phase-02"]
---

# Phase 3: E2E AC-002

## Files

- Create: `apps/e2e/specs/holiday-skip-and-kept-completed.spec.ts`
- Tái dùng seed lớp có `date` ở `apps/e2e/specs/helpers-dated-class.ts` và helper seed của `holiday-shift.spec.ts` (TOS-11).

## Kịch bản

1. **Nhảy qua kỳ nghỉ khác:** seed lớp T3 & T7 với buổi cuối sao cho ngày bù kế tiếp là 26/12/2026; tạo kỳ nghỉ «Nghỉ Tết Dương lịch» 26/12 qua UI; tạo kỳ nghỉ thứ hai trúng 1 buổi → bảng xem trước hiện "29/12/2026*" và ghi chú; xác nhận → tuần chứa 29/12 có buổi bù, 26/12 không có.
2. **Bảo vệ ca đã điểm danh:** seed lớp "Giao tiếp 1" có buổi 20/11/2026; điểm danh buổi đó qua `/attendance`; tạo kỳ nghỉ toàn tổ chức bao 20/11 → dòng "Giữ nguyên — Đã diễn ra"; xác nhận (nếu còn buổi khác để dời) hoặc thấy nút khóa (nếu không) → buổi 20/11 vẫn hiện điểm danh cũ.
3. Chạy lại kịch bản 2 ở 375×812 để kiểm nhãn trong dạng thẻ.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e holiday-skip-and-kept-completed`
- Trước khi merge vào `develop`: full suite Playwright.
