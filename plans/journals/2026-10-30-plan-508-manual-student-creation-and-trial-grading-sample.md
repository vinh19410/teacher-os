---
title: "Plan 508: manual student creation and trial grading sample"
date: 2026-10-30
summary: "Planned manual student creation with instant enrollment activation and isolated demo grading sample (#508)"
---

# Plan 508: manual student creation and trial grading sample

## What happened
- Một giáo viên dùng thử phản hồi không thể thêm học viên thủ công (học viên bắt buộc phải tự đăng ký qua cổng hoặc chấp nhận lời mời), dẫn tới không thể ghi danh vào lớp, không tạo được hóa đơn, không giao được bài tập và không trải nghiệm được tính năng chấm điểm (`/grading`).
- Kiểm chứng codebase xác nhận PR #257 đã xóa `POST /api/students` và PR #263 chỉ tạo `student_invitation` (`status = 'pending'`), trong khi `POST /api/invoices` và `POST /api/classes/:id/assignments` đòi hỏi `enrollment` có `status = 'active'`, còn `/grading` chỉ đọc `quiz_attempt` `submitted` từ Student Portal.

## Decision
- Chốt phương án A + C (báo cáo `plans/reports/brainstorm-261030-manual-student-and-trial-grading.md` và kế hoạch `plans/261030-1111-manual-student-and-trial-grading/plan.md`, GitHub Issue #508):
  1. Khôi phục `POST /api/students` (chỉ bắt buộc `name`; `phone`, `email`, `parentName`, `parentPhone` tùy chọn) và mở rộng `POST /api/classes/:id/enroll` hỗ trợ `activateNow: true` để kích hoạt `enrollment` sang `active` ngay lập tức qua `activateEnrollment`.
  2. Tự động đóng `student_invitation` `pending` trùng email trong cùng org và giữ cơ chế tự động khớp nối Student Portal qua `lower(trim(student.email))` (kèm defense-in-depth `emailVerified === true` tại `createStudentGuard`).
  3. Thêm `POST / DELETE /api/grading/demo-sample` dùng ID tất định `demo-*:${orgId}` (lọc khỏi `loadSnapshot` và `computeReminders`) để giáo viên tạo/xóa nhanh 1 bài nộp Writing Task 2 mẫu kèm nháp AI tĩnh (`creditCost = 0`) ngay trên `/grading`.

## Next steps
- Thực thi kế hoạch theo 4 phase bằng `/ak-cook plans/261030-1111-manual-student-and-trial-grading/plan.md --advice`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
