---
title: "Plan TOS-22 + TOS-23: tự động thử lại 3 lần và nút Gửi lại thông báo lỗi"
date: 2026-10-27
summary: "Lập 2 plan 261027-0127 (issue #463, #464) cho AC-002/AC-003 của US-004 trên hạ tầng notification_record của TOS-21"
---

# Plan TOS-22 + TOS-23: tự động thử lại 3 lần và nút Gửi lại thông báo lỗi

## What happened
Lập 2 plan qua `ak-plan --github` từ Jira TOS-22 (AC-002) và TOS-23 (AC-003), mở Issue #463
và #464 (`ai-handle`, `ready to review`), #464 blocked by #463.

Scout cho thấy TOS-21 (#454) đã merge vào develop: bảng `notification_record` có sẵn
`failed`, `retry_count`, `last_error`; `deliverNotifications` gửi 1 lần, lỗi chỉ tăng
`retry_count`. Hạ tầng không có Cloudflare Queue/cron, nên mọi lần thử phải nằm trong `waitUntil`.

## Decision
- TOS-22: thử lại theo lượt (lượt sau chỉ gửi bản ghi vừa lỗi, chờ 2s/5s) để fan-out lớn
  vẫn trong 30s của `waitUntil`; lần lỗi thứ 3 chuyển `failed` với `last_error` mang tiền tố
  `E-selfomy-alignment-010`. Không migration. Delay inject được cho test/E2E.
- E2E giả lập lỗi bằng địa chỉ `@bounce.test` trong `recordingMailer` của `apps/e2e/src/boot.ts`.
- TOS-23: reset trên cùng bản ghi (`failed → queued`, `retry_count = 0`) nên In-app không thể
  nhân bản; lấy lại `student.email` hiện tại; bulk giới hạn 50 bản ghi/lần.
- Không thêm ô sửa Email học viên vì `student.email` là định danh đăng nhập portal — để người duyệt chốt.
- Nút "Gửi lại" của AC-002 giao cùng hành động ở TOS-23 để không có nút chết.

## Next steps
- Review #463 rồi #464; thực thi theo thứ tự `/ak:cook plans/261027-0127-tos-22-notification-auto-retry-failed/plan.md`
  rồi `/ak:cook plans/261027-0127-tos-23-notification-manual-resend/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
