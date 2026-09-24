---
title: "Plan student-org-invite-and-switch: Mời học viên, chuông thông báo & chuyển đổi đa tổ chức"
date: 2026-09-24
summary: "Lập plan 260924-0556 (issue #263): student_invitation + scoped email index + chuông thông báo portal + OrgSwitcher đa tổ chức"
---

# Plan student-org-invite-and-switch: Mời học viên, chuông thông báo & chuyển đổi đa tổ chức

## What happened
Hoàn tất planning cho tính năng "giáo viên thêm nút mời học viên vào org, giao diện học viên hiện notification ở chuông, học viên chuyển đổi qua lại giữa các org" qua `ak-plan --github`. Kế hoạch đã qua kiểm tra `ak plan validate` và đã mở GitHub Issue #263 (`ready to review`).

Phát hiện then chốt về kiến trúc hệ thống hiện tại:
1. Hiện tại bảng `student` có `uniqueIndex("student_email_uq")` toàn cục trên toàn database (PR #257), khiến một học viên không thể tham gia học cùng lúc nhiều giáo viên (vi phạm unique email).
2. Khi học viên đăng ký từ portal, server đang gán cứng vào Organization tạo sớm nhất toàn hệ thống (`ORDER BY created_at ASC LIMIT 1` - D2), dẫn tới việc học viên bị gán vào các org test/cũ thay vì org giáo viên thật.
3. Khi 1 email có nhiều record `student`, middleware portal đang ném lỗi HTTP 403 `STUDENT_AMBIGUOUS`.

## Decision
- **D1 (Org-Scoped Student Model):** Chuyển đổi index email thành `UNIQUE(org_id, lower(trim(email)))`. Một email học viên có thể có hồ sơ `student` riêng trong từng tổ chức giáo viên mà họ theo học. Giữ nguyên 100% các quan hệ cascade của `class`, `enrollment`, `lesson`, `invoice`.
- **D2 (Bảng lời mời `student_invitation`):** Lưu trữ lời mời do giáo viên gửi (`org_id`, `inviter_user_id`, `email`, `status: pending|accepted|rejected|canceled`). Ngăn gửi trùng lời mời pending cùng email trong 1 org.
- **D3 (Resolve Active Org linh hoạt):** Xoá bỏ lỗi 403 `STUDENT_AMBIGUOUS`. Middleware đọc header `x-student-org-id` (hoặc cookie/fallback record mới nhất) để scope dữ liệu chính xác theo tổ chức học viên đang chọn.
- **D4 (Chuông thông báo NotificationBell):** Đặt tại Header mobile và Sidebar desktop của Student Portal. Badge hiển thị số lượng lời mời pending. Popover hiển thị lời mời kèm 2 nút "Chấp nhận" và "Từ chối". Bấm "Chấp nhận" tự động tạo record `student` cho org đó và kích hoạt re-fetch.
- **D5 (Bộ chuyển đổi tổ chức OrgSwitcher):** Đặt tại Sidebar desktop và Header mobile của Student Portal. Dropdown hiển thị các tổ chức đã tham gia, cho phép học viên chuyển đổi mượt mà giữa các lớp của các giáo viên khác nhau.

## Next steps
- Review kế hoạch tại `plans/260924-0556-student-org-invite-and-switch/plan.md` hoặc GitHub Issue #263.
- Thực thi kế hoạch: `/ak:cook plans/260924-0556-student-org-invite-and-switch/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
