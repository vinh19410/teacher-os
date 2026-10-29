---
title: "Plan: highlight và ghi chú trên essay Writing khi chấm"
date: 2026-10-07
summary: "Lên plan 5 phase (issue #332) cho giáo viên bôi đen từ/cụm từ trong essay để highlight + ghi chú; học viên thấy khi bài đã chấm."
---

# Plan: highlight và ghi chú trên essay Writing khi chấm

## What happened
- Lên plan `plans/261007-0832-essay-highlight-annotations/` (5 phase, ~14h) cho việc giáo viên bôi đen từ/cụm từ trong essay ở `/grading/$attemptId` để highlight và ghi chú. Issue #332, nhãn `enhancement` + `ready to review`.
- Scout: essay ở trang chấm đang là một text node trong `submission-view.tsx`; essay đóng băng sau nộp (`student.ts:1289` trả 409); summary học viên chỉ gắn `grade` khi đã chấm; migration mới nhất là 0034.

## Decision
- User chốt: học viên chỉ thấy highlight khi bài đã có điểm; mỗi highlight lưu ngay qua API riêng (không gắn nút "Lưu điểm"); một kiểu highlight + ghi chú tự do.
- Bảng mới `quiz_attempt_annotation` (migration 0035), mỗi highlight một dòng, offset UTF-16 trên essay. Không cho chồng nhau (409 OVERLAP).
- Số thứ tự highlight vẽ bằng `::after { content: attr(data-n) }` để không lọt vào text DOM, giữ đúng phép ánh xạ vùng chọn sang offset.
- E2E là spec riêng và chấm điểm qua API, để không đụng plan band-slider (#331) đang sửa widget chọn điểm.

## Next steps
- Commit/push plan để link trong issue #332 hoạt động.
- Thực thi bằng `/ak:cook plans/261007-0832-essay-highlight-annotations/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
