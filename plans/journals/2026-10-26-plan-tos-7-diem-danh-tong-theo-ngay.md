---
title: Plan TOS-7 điểm danh tổng theo ngày inline
date: 2026-10-26
summary: "Lập plan TOS-7 (#440): lưu 4 trạng thái điểm danh trên dòng lesson, ánh xạ sang completed/absent, API ca theo ngày + lưu cả ca, phụ thuộc TOS-6"
---

# Plan TOS-7 điểm danh tổng theo ngày inline

## What happened
Đọc Jira TOS-7 (AC-002 của US-001) qua Atlassian MCP, sau đó scout mô hình `lesson`, các endpoint check-in theo buổi, cách suy ra số buổi đã học và wireframe `daily-attendance`. Plan nằm ở `plans/261026-1524-tos-7-daily-attendance-inline/`, GitHub issue #440.

Phát hiện chính:
- Mỗi dòng `lesson` đã là 1 học viên × 1 buổi, `(classId, date)` là định danh buổi. Trạng thái chỉ có `upcoming | completed | cancelled | absent`; `absent` có ở web nhưng chưa có đường ghi.
- Số buổi đã học của gói suy ra từ các dòng `completed`, nên trạng thái điểm danh nào map sang `completed` sẽ quyết định việc trừ buổi.
- Cột `unexcused_deduct` ("Vắng không phép: Có, trừ 1 buổi") nằm trong bảng `workspace_settings`, nhưng bảng này là tombstone (#321) và không được đọc lại.
- Chưa có Lịch nghỉ chung, chưa có vai trò TA. Route `/attendance` và API reminders đến từ TOS-6, chưa merge.

## Decision
- Thêm 2 cột nullable `attendance` và `attendance_note` vào `lesson`; không tạo bảng điểm danh riêng.
- Ánh xạ: `present`/`late`/`unexcused` → `completed`, `excused` → `absent`. Phần "Vắng không phép có trừ buổi" dùng hằng số `UNEXCUSED_CONSUMES_SESSION = true` thay cho cài đặt tombstone. User cần xác nhận lại điểm này.
- Nghỉ lễ chỉ chừa điểm cắm (`excludeNonTeachingSessions`). Lớp legacy chỉ xem, có link sang trang lớp.
- Lưu cả ca trong 1 request và 1 transaction, bắt buộc đủ sĩ số; cho phép lưu lại để sửa.

## Next steps
- Xác nhận cách xử lý `unexcusedDeduct` (hằng số hay bảng preference mới).
- Chờ TOS-6 Phase 1–2 vào `develop`, sau đó `/ak:cook plans/261026-1524-tos-7-daily-attendance-inline/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
