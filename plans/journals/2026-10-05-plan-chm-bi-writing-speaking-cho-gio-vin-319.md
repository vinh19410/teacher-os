---
title: "Plan chấm bài Writing/Speaking cho giáo viên (#319)"
date: 2026-10-05
summary: Lập plan --advice cho luồng giáo viên xem và chấm bài Writing/Speaking; red-team 12 finding đã áp dụng
---

# Plan chấm bài Writing/Speaking cho giáo viên (#319)

## What happened

Lập plan `plans/261005-1234-teacher-grade-writing-speaking-submissions/` (issue #319) cho luồng giáo viên xem và chấm bài Writing (`quiz_attempt.essay`) và Speaking (`quiz_attempt.media_*` trên R2) mà học viên đã nộp.

Khi scout, phát hiện màn `/assignments/$assignmentId` + `GradeModal` là luồng legacy chạy trên bảng `assignment` cũ, không nối với `quiz_attempt`. Ô nhận xét ở màn đó cũng không được lưu. Vì vậy plan không dùng lại luồng này.

## Decision

User chốt 3 quyết định sản phẩm:
- Học viên thấy kết quả ngay khi giáo viên lưu (không có nháp hay nút trả bài).
- Chấm 4 tiêu chí IELTS, band tổng tự tính bằng `ieltsOverallBand` (`Math.round(avg*2)/2`).
- Lối vào là tab Bài tập trong lớp.

Thiết kế: điểm lưu trên `quiz_attempt` (migration 0033), API `/api/grading/:attemptId` mount trong kernel, snapshot target thêm `attemptId`/`gradedAt`/`band`. Summary học viên chỉ gửi `grade`/`part` khi đã chấm, để thu hẹp cửa sổ lệch version của schema strict.

Red-team qua `kongming` tìm 5 lỗi High, mỗi lỗi chắc chắn làm một bước Verify đỏ:
- trùng tên biến `grade` ở `student.ts:1705`;
- `kernel.test.ts:5785` so sánh `targets` bằng equality đầy đủ;
- Task 3.8 dùng `search={{ tab }}` trước khi route lớp có `validateSearch`;
- e2e dùng lại context học viên sau signup;
- race giữa truy vấn org và bootstrap org trong e2e.

Kèm 7 lỗi Medium (thiếu 401, thứ tự deploy migration, DRY band, URL ảnh, a11y, type e2e, hồi quy spec). User chọn áp dụng cả 12.

Agent `kongming` được spawn với tier `fable`, nhưng runtime báo nó chạy trên Opus 5.5.

Commit #318 (tab Bài tập trang học viên) xuất hiện giữa phiên. Nó chỉ đọc `studentId`/`submittedAt`; field mới khai optional phía web nên không xung đột. Lối chấm ở tab này để follow-up theo lựa chọn của user.

## Next steps

- Commit bản sửa sau red-team của plan (đang là thay đổi local).
- Chạy `/ak:cook plans/261005-1234-teacher-grade-writing-speaking-submissions/plan.md --advice`.
- Backup D1 và chạy migration 0033 trước khi deploy worker.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
