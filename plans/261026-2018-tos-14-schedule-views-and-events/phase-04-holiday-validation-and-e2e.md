---
phase: 4
title: "Kiểm tra hợp lệ kỳ nghỉ theo AC-004 và E2E"
status: pending
priority: P1
effort: "3h"
dependencies: ["phase-03"]
---

# Phase 4: Validation kỳ nghỉ + E2E AC-004

## Files to Create / Modify

- Modify: `packages/api/src/holiday-contracts.test.ts` — case đúng AC: khoảng 35 ngày bị từ chối; 30 ngày nhận; tên 1 ký tự bị từ chối (đã có ở TOS-11 thì chỉ xác nhận, không trùng lặp).
- Modify: `apps/web/src/components/schedule/holiday-modal.test.tsx` — 35 ngày → cảnh báo "Khoảng ngày nghỉ tối đa 30 ngày", nút xác nhận `disabled`, không gọi preview; sửa về 30 ngày → mở khóa.
- Modify: `apps/server/src/routes/holidays.test.ts` — POST preview/apply với 35 ngày → 400 (server không tin client).
- Create: `apps/e2e/specs/schedule-views-and-events.spec.ts`.

## Kịch bản E2E

1. Seed 2 lớp có `date`. Mở `/schedule` → chuyển Tháng → Tuần → Ngày; mỗi lần đo click → phần tử đầu tiên của view hiển thị < 2000ms; hai lớp có màu block khác nhau (so `data-class-color`).
2. Tạo sự kiện "Họp chuyên môn giáo viên" → hiện trong view đang mở < 2000ms; chuyển sang view Tháng vẫn thấy.
3. Mở **+ Tạo lịch nghỉ**: tên "A" → cảnh báo + nút khóa; tên hợp lệ + khoảng 35 ngày → cảnh báo + nút khóa; sửa còn 30 ngày → nút mở (nếu có buổi trong khoảng).
4. Lặp bước 1–2 ở 375×812 (view Tháng dạng chấm, bấm ngày mở view Ngày).

## Verification

- `pnpm --filter @teacher-os/api test -- holiday-contracts`
- `pnpm --filter web test -- holiday-modal`
- `pnpm --filter server test -- holidays`
- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e schedule-views-and-events`
- Trước khi merge vào `develop`: full suite Playwright.
