---
title: "Plan fix tab Bài tập trống ở chi tiết học viên (issue #317)"
date: 2026-10-05
summary: "Root cause: tab đọc bảng legacy assignment (grading-only) thay vì class_assignment_target của flow #208; plan derive từ data.classAssignments merge legacy, thuần client"
---

# Plan fix tab Bài tập trống ở chi tiết học viên (issue #317)

## What happened

User `/ak:plan --github` báo bug: học viên vinh1021308@gmail.com đã được giao bài nhưng tab "Bài tập" ở chi tiết học viên hiện "Chưa có dữ liệu."

Scout (Explore agent) + verify trực tiếp xác nhận root cause — repo có HAI hệ bài tập tách biệt:
- Legacy `assignment` (grading per-student): KHÔNG có create endpoint, chỉ `POST /:id/grade` UPDATE + test helper.
- `class_assignment` + `class_assignment_target` (#208): flow "Giao bài tập" duy nhất trong UI, ghi qua `apps/server/src/routes/kernel.ts:708-796`.

Điểm chết: `apps/web/src/routes/_auth/students/$studentId.tsx:78` filter `data.assignments` (legacy, luôn rỗng trong production). `data.classAssignments` (kèm targets nhúng) đã có sẵn trong kernel snapshot nhưng tab không đọc. Student portal merge cả hai nguồn (`apps/server/src/routes/student.ts:791`) nên học viên thấy bài, giáo viên thì không.

## Decision

- Mode: fast (root cause xác nhận, scope rõ) nhưng vẫn chạy scout trước để grounding.
- Fix thuần client: selector pure `studentAssignmentRows(data, studentId)` trong `apps/web/src/lib/repos/student-assignments.ts` (pattern `classesByStudent`), merge class rows + legacy grading rows.
- Title class row = plain text (không link — `/assignments/$assignmentId` chỉ resolve legacy); tên lớp làm subtitle trong cell; `StatusTag` + `studentSubmissionStatus` cho trạng thái; sort due tăng dần.
- Không thêm endpoint, không đụng backend (snapshot đủ dữ liệu).

## Next steps

- Plan tại `plans/261005-0640-student-assignments-tab-empty/` (2 phase, ~4h), issue #317, label `ready to review`.
- Chạy `/ak:cook plans/261005-0640-student-assignments-tab-empty/plan.md` để implement.
- Lưu ý: plan files chưa commit; PR merge vào develop sẽ không tự đóng #317 (Closes #N chỉ hoạt động với main).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
