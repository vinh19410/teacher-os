---
title: Plan TOS-8 đánh dấu tất cả Có mặt
date: 2026-10-26
summary: "Lập plan TOS-8 (#441): nút điền nhanh Có mặt chỉ cho ô trống, xác nhận gán Có mặt khi lưu thiếu, tự mở ca kế tiếp để đạt 5 lớp trong 2 phút; chỉ frontend, phụ thuộc TOS-7"
---

# Plan TOS-8 đánh dấu tất cả Có mặt

## What happened
Đọc Jira TOS-8 (AC-003 của US-001) qua Atlassian MCP, đối chiếu với plan TOS-7, wireframe `daily-attendance` (mục 7, 8 và ràng buộc đầy đủ sĩ số) và NFR-008. Plan nằm ở `plans/261026-1533-tos-8-mark-all-present/`, GitHub issue #441.

Phát hiện chính:
- Endpoint lưu cả ca của TOS-7 đã là "lưu hàng loạt" theo nghĩa AC-003, nên TOS-8 không cần đổi server hay contract.
- TOS-7 chưa được code: reducer nháp, component hàng ca và route `/attendance` đều chưa tồn tại. Tên hàm trong plan dựa theo TOS-7 Phase 3.
- Wireframe cho phép hai cách xử lý khi lưu thiếu (gợi ý gán Có mặt hoặc tô viền vàng).

## Decision
- Nút "Đánh dấu tất cả Có mặt" chỉ điền học viên chưa chọn, không ghi đè lựa chọn có sẵn.
- Lưu khi còn trống thì hỏi xác nhận "Gán Có mặt và lưu"; huỷ thì giữ hành vi viền vàng của TOS-7.
- Lưu xong tự mở ca chưa điểm danh kế tiếp và focus nút điền nhanh; E2E đo 5 ca liên tiếp dưới 2 phút.

## Next steps
- Chờ TOS-7 Phase 3 vào `develop`, sau đó `/ak:cook plans/261026-1533-tos-8-mark-all-present/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
