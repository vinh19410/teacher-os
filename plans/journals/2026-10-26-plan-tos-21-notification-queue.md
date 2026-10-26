---
title: Plan TOS-21 hàng đợi thông báo Email + In-app
date: 2026-10-26
summary: "Lập plan TOS-21 (US-004 AC-001), issue #454 blocking #452 (TOS-18 nhắc học phí)"
---

# Plan TOS-21 hàng đợi thông báo Email + In-app

## What happened
Lập plan cho TOS-21 tại `plans/261026-2054-tos-21-notification-queue-email-inapp/` (6 phase, khoảng 3 ngày), tạo issue #454 và gắn #452 blocked by #454. Body #452 và plan TOS-18 đã trỏ sang #454 thay cho ghi chú "chưa có issue".

## Decision
- Bảng mới `notification_record`, 1 dòng phục vụ cả Email lẫn In-app, unique `(org_id, idempotency_key)`; không tái dùng `notif` (feed giáo viên).
- Không có Queue/cron trên Workers: ghi bản ghi trong request, gửi thư qua `runInBackground` (`waitUntil`); lỗi thông báo fail-open, không làm hỏng thao tác gốc.
- `Mailer` thêm `replyTo` / `fromName`; Reply-To = email chủ org, tên người gửi = tên org; `AppDeps.mailer` dùng chung getter với auth.
- Cột `retry_count`, `last_error`, trạng thái `failed` có sẵn để TOS-22/23 không cần migration mới.

## Open
- Người duyệt xác nhận: Reply-To lấy email chủ org; `schedule_changed` gồm đổi giờ/ngày và hủy buổi; màn `[5]` không áp guard tài chính.
- Sự kiện `holiday_created` phụ thuộc #445 (TOS-11) merge; chưa gắn quan hệ phụ thuộc vì không bắt buộc.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
