---
title: "Plan: màn kết quả Writing chia 2 khung, ghi chú inline"
date: 2026-10-07
summary: "Lên plan #336: bài Writing đã chấm hiện 2 khung trái/phải, ghi chú giáo viên hiện ngay sau highlight"
---

# Plan: màn kết quả Writing chia 2 khung, ghi chú inline

## What happened
Tạo plan `plans/261007-1032-student-writing-result-split-inline-notes/` (issue #336) cho màn kết quả học viên `/learn/quizzes/attempt/$attemptId`. Hiện bài Writing đã chấm xếp một cột 720px: essay có highlight → danh sách `EssayAnnotationList` → `AttemptGradeCard`. Học viên phải dò số giữa essay và danh sách, cuộn hết bài mới thấy band.

## Decision
- User chốt: ghi chú hiện ngay sau highlight; bỏ danh sách "Ghi chú của giáo viên" ở màn học viên.
- Ghi chú inline là prop opt-in `inlineNotes` trên `EssayWithHighlights` (packages/ui). Trang chấm giáo viên không bật, vì span ghi chú không có `data-start` sẽ làm sai phép ánh xạ vùng chọn → offset.
- Chỉ chia 2 khung khi bài đã chấm; breakpoint `app` 921px như trang chấm giáo viên; khung phải sticky `top-20` kèm `max-h` + `overflow-y-auto` + `tabIndex={0}` để nhận xét dài vẫn đọc được bằng bàn phím.
- Trang đích cần đăng nhập nên plan dựa vào đọc code, không xem trực tiếp.

## Next steps
Chưa implement. Chạy `/ak:cook plans/261007-1032-student-writing-result-split-inline-notes/plan.md`; e2e `teacher-essay-annotations` phải đổi assertion `essay-annotation-list` sang `essay-inline-note`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
