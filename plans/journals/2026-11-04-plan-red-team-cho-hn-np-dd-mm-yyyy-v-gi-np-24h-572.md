---
title: "Plan & Red-Team cho ô hạn nộp dd/mm/yyyy và giờ nộp 24h (#572)"
date: 2026-11-04
summary: "Chốt kế hoạch TDD 3 phase cho #572 dưới giám sát Kongming, không cần migration DB và bảo toàn 7 modal ngày khác"
---

# Plan & Red-Team cho ô hạn nộp dd/mm/yyyy và giờ nộp 24h (#572)

## What happened
Hoàn tất điều tra nguyên nhân gốc và lập kế hoạch bàn giao TDD (`plans/261104-0626-572-assignment-due-date-time/`) cho issue #572 (`fix(assignments): ô hạn nộp sai định dạng dd/mm, khó nhập và không chọn được giờ`).

- Xác minh bảng `class_assignment` đã có sẵn cột `due_at INTEGER` (`timestamp_ms`, từ `0059_self_study_plan.sql:56`), và `apps/student` đã tiêu thụ `dueAt` từ `student-class.ts:216`, nên không cần tạo migration DB mới.
- Hội đồng 3 reviewer Red-Team độc lập (`RedTeamSecurity`, `RedTeamAssumption`, `RedTeamFailure`) phát hiện 10 điểm (chấp nhận 9: RT-1..RT-9, từ chối 1 ngoài phạm vi RBAC), giúp khóa chặt state machine `lastEmittedRef` chống nhảy con trỏ, xử lý biên phút `23:59` VN cuối ngày, thêm `// @vitest-environment jsdom`, và đồng bộ `nowMs` trên cả hai app.

## Decision
- Xây dựng `DatePickerInput` (`dd/mm/yyyy` + lịch `@base-ui/react/popover`) và `TimeInput24h` (`HH:mm` 24h) trong `@teacher-os/ui`, áp dụng riêng cho `ClassAssignmentsTab` trong #572 để bảo toàn 12+ spec E2E/unit của 7 modal chọn ngày khác.
- Mở rộng `classAssignmentCreateSchema` với `dueTime?: HH:mm` (mặc định `"23:59"` giờ VN) và dùng chung `evaluateAssignmentDeadline` giữ nguyên lịch sử `dueAt: null`.

## Next steps
- Triển khai TDD qua 3 phase theo kế hoạch đã khóa, chạy local code-review, E2E dưới locale `en-US`, `design:compare`, mở PR vào `develop` và hội tụ CI.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
