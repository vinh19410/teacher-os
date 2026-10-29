---
title: Plan TOS-12/13/14 lịch nghỉ chung và lịch dạy đa chế độ
date: 2026-10-26
summary: "Lập 3 plan cho TOS-12/13/14 (US-002 AC-002..004), issue #446 #448 #447 kèm blocked-by"
---

# Plan TOS-12/13/14 lịch nghỉ chung và lịch dạy đa chế độ

## What happened
Lập 3 plan từ Jira, mỗi ticket một issue: TOS-12 → #446, TOS-13 → #448, TOS-14 → #447. Commit 6f5e32c1 lên develop.

## Dependencies
- #446, #447, #448 blocked by #445 (TOS-11 dựng bảng kỳ nghỉ, planner, route, hộp thoại).
- #448 blocked by #446: dùng chung Bảng xem trước và nhãn "Giữ nguyên — Đã diễn ra".
- #447 độc lập với #446/#448; thẻ kỳ nghỉ tách thành component dùng chung để tránh xung đột `schedule.tsx`.

## Decision
- TOS-12 không viết lại thuật toán (đã có ở TOS-11 D1), preview trả thêm tên kỳ nghỉ bị nhảy qua.
- TOS-13 thêm bảng `holiday_session_cancel`; hoàn tác chỉ cho kỳ nghỉ chưa bắt đầu và khi buổi bù còn nguyên, không dồn lịch kỳ nghỉ khác.
- TOS-14 màu theo lớp bằng hash `class.id` vào 8 token mới; sự kiện vận hành là bảng `org_event` không ảnh hưởng ca học.

## Open
- Người duyệt xác nhận: không dồn lịch sau hoàn tác (TOS-13), đổi màu block từ loại buổi sang lớp (TOS-14).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
