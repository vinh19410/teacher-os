---
title: Plan TOS-6 thẻ Việc cần làm hôm nay
date: 2026-10-26
summary: "Lập plan TOS-6 (#439): API đếm phía server có ReminderScope, route khung /attendance, phase TA bị chặn chờ FR-029"
---

# Plan TOS-6 thẻ Việc cần làm hôm nay

## What happened
Đọc Jira TOS-6 (AC-001 của US-001) qua Atlassian MCP, sau đó scout code dashboard, điểm danh, phân quyền và hàng chờ chấm bài. Plan nằm ở `plans/261026-1501-tos-6-dashboard-reminder-cards/`, GitHub issue #439.

Phát hiện chính:
- Vai trò hiện chỉ có `teacher | student | admin` (`packages/auth/src/role.ts`), và `membership.role` mặc định là `teacher`. Chưa có TA/Staff/Owner, chưa có bảng phân công lớp.
- Dashboard tính KPI ở client từ kernel snapshot, nghĩa là toàn bộ hoá đơn của org đã nằm trong trình duyệt. Yêu cầu "không trả dữ liệu công nợ về trình duyệt" cho TA vì vậy không thể đạt chỉ bằng cách ẩn thẻ trên UI.
- Màn Điểm danh tổng theo ngày `[2]` chưa tồn tại; nó thuộc TOS-7/TOS-8.

## Decision
- Bộ đếm lấy từ API server riêng `GET /api/dashboard/reminders`, có tham số `ReminderScope`. Khi scope không có quyền tài chính, server bỏ hẳn key `tuition` khỏi response.
- Tạo route khung `/attendance?date&status`, chốt hợp đồng URL để TOS-7 dựng nội dung lên.
- Thẻ bài quá hạn đếm `quiz_attempt.status = "submitted"` có `submittedAt` cách đây hơn 24h; không thêm trạng thái mới.
- Phase 5 (Scenario 2 — TA) bị chặn, chờ plan FR-029. Plan FR-029 cũng phải xử lý việc lọc kernel snapshot.

## Next steps
- `/ak:cook plans/261026-1501-tos-6-dashboard-reminder-cards/plan.md`, chạy Phase 1 đến Phase 4.
- Lập plan FR-029 (vai trò trung tâm + phân công lớp + cô lập snapshot) để mở khoá Phase 5.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
