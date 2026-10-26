---
phase: 6
title: "E2E AC-001: thông báo Email + In-app cho sự kiện chính"
status: pending
priority: P0
effort: "3h"
dependencies: ["phase-03", "phase-04", "phase-05"]
---

# Phase 6: E2E AC-001

## Files

- Create: `apps/e2e/specs/notifications-ac-001.spec.ts` (theo quy ước tên file trong `apps/e2e/specs/`).
- Modify: helper đọc `recordingMailer` của `apps/e2e/src/boot.ts` nếu chưa có cách đọc thư theo người nhận.

## Scenario

1. Giáo viên tạo hóa đơn cho học viên có email → màn `/notifications` có dòng "Học phí" của học viên đó; recording mailer có thư tới email học viên với `fromName` chứa tên tổ chức và `replyTo` = email giáo viên; dòng chuyển "Đã gửi".
2. Giáo viên giao bài cho lớp → mỗi học viên trong lớp 1 dòng "Giao bài tập".
3. Học viên đăng nhập cổng → chuông có badge, mở thông báo hóa đơn → điều hướng tới trang học phí; quay lại `/notifications` phía giáo viên → dòng "Đã xem".
4. Lọc `?status=read` và `?event=tuition` hiển thị đúng; reload giữ filter.
5. Tạo lại cùng sự kiện qua API (cùng khóa) → không thêm dòng / thư.

## Verification

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- notifications-ac-001`
- Toàn bộ suite Playwright trước khi merge vào `develop`.
