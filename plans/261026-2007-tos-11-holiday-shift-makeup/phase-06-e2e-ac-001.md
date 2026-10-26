---
phase: 6
title: "E2E AC-001: tạo lịch nghỉ chung, xem trước và dời buổi"
status: pending
priority: P1
effort: "3h"
dependencies: ["phase-05"]
---

# Phase 6: E2E AC-001

## Goal

Chứng minh end-to-end kịch bản Gherkin của AC-001 trên app thật, ở 3 viewport.

## Files to Create / Modify

- Create: `apps/e2e/specs/holiday-shift.spec.ts`
- Modify (nếu cần seed): helper seed trong `apps/e2e/src/` — 1 lớp T6 có 2 học viên active, 1 lớp T3 & T7, ngày bắt đầu cố định để ngày bù xác định được.

## Kịch bản

1. Đăng nhập GV, mở `/schedule`, bấm **+ Tạo lịch nghỉ**.
2. Nhập tên 1 ký tự → thấy lỗi, nút xác nhận khóa. Sửa thành "Nghỉ lễ 20/11".
3. Chọn khoảng ngày trúng 1 buổi của mỗi lớp, phạm vi toàn tổ chức, phương thức Dời lịch.
4. Bảng xem trước có 2 dòng, mỗi dòng có ngày gốc và ngày bù đúng thứ + giờ chuẩn (so với giá trị tính sẵn trong test).
5. Bấm **Xác nhận áp dụng & Dời buổi** → Toast thành công.
6. Lịch tuần chứa ngày nghỉ hiện nhãn "Nghỉ lễ — Đã dời lịch"; tuần chứa ngày bù có buổi mới.
7. `/attendance?date=<ngày nghỉ>` không còn ca của 2 lớp đó.
8. Qua API kernel: số buổi `completed` và số buổi không-`holiday` của từng học viên bằng trước khi áp dụng (BR-003); có 1 `notif` mới.
9. Lặp bước 1–5 ở viewport 768×1024 và 375×812 (dữ liệu mới), kiểm tra bảng dạng thẻ ở 375px.

## Verification

- Dev stack bận port 8000/8001/8003/8004 → chạy với `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e holiday-shift`
- Trước khi merge vào `develop`: chạy full suite Playwright (theo quy ước dự án).
