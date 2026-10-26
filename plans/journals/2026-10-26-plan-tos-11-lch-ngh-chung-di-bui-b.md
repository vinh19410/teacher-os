---
title: Plan TOS-11 lịch nghỉ chung dời buổi bù
date: 2026-10-26
summary: "Lập plan 6 phase cho TOS-11 (US-002 AC-001), issue #445"
---

# Plan TOS-11 lịch nghỉ chung dời buổi bù

## What happened
Lập plan `plans/261026-2007-tos-11-holiday-shift-makeup/` từ Jira TOS-11, tạo issue #445, commit 31e49d8c lên develop.

## Decision
- Thuật toán đủ ngay ở TOS-11: chỉ dời buổi còn `upcoming`, giữ buổi đã điểm danh, ngày bù nhảy qua kỳ nghỉ khác. TOS-12 chỉ làm nhãn + E2E.
- Buổi gốc dùng `lesson.status = "holiday"`; bảng `holiday_session_shift` lưu cặp gốc → bù (nguồn cho hoàn tác TOS-13).
- Thông báo: ghi feed `notif` phía GV, Email/In-app học viên chờ TOS-19.
- Học viên kích hoạt sau khi áp dụng kỳ nghỉ nhận đúng lịch đã dời.

## Next steps
Duyệt plan trên #445 rồi chạy `/ak:cook` theo plan.md.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
