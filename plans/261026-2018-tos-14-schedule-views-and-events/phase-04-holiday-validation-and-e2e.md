---
phase: 4
title: "E2E AC-004: đổi view và đo ≤2 giây tạo sự kiện (validation kỳ nghỉ → follow-up)"
status: completed
priority: P1
effort: "2h"
dependencies: ["phase-03"]
---

# Phase 4: E2E AC-004 (phần độc lập với #445)

> Scope split 2026-10-26: các kịch bản validation hộp thoại "Tạo lịch nghỉ chung" (tên 1 ký tự /
> khoảng 35 ngày → cảnh báo + khóa nút, test ở `holiday-contracts.test.ts` / `holiday-modal.test.tsx`
> / `holidays.test.ts`) chuyển sang follow-up issue blocked by #445 — các file đó là deliverable của
> TOS-11, chưa tồn tại trên develop. Phase này chỉ giữ E2E đổi view + sự kiện ≤2 giây.

## Files to Create / Modify

- Create: `apps/e2e/specs/schedule-views-and-events.spec.ts`.

## Kịch bản E2E

1. Seed 2 lớp có `date`. Mở `/schedule` → chuyển Tháng → Tuần → Ngày; mỗi lần đo click → phần tử đầu tiên của view hiển thị < 2000ms; hai lớp có màu block khác nhau (so `data-class-color`).
2. Tạo sự kiện "Họp chuyên môn giáo viên" → hiện trong view đang mở < 2000ms; chuyển sang view Tháng vẫn thấy.
3. Lặp bước 1–2 ở 375×812 (view Tháng dạng chấm, bấm ngày mở view Ngày).

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e schedule-views-and-events`
- Trước khi merge vào `develop`: full suite Playwright.
