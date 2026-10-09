---
title: "Plan: highlight đúng/sai ở màn soi bài quiz"
date: 2026-10-09
summary: "Lên plan cho #351: cặp token verdict xanh/đỏ riêng để câu đúng/sai ở màn review dễ phân biệt"
---

# Plan: highlight đúng/sai ở màn soi bài quiz

## What happened
Học viên phản ánh màn soi bài (`/learn/quizzes/attempt/$attemptId/detail`) khó phân biệt câu đúng và câu sai.
Nguyên nhân gốc đã xác nhận trong code:
- Redesign #350 đặt `--success` = `--fg-2` (xám trắng) và `--danger` = `--accent` (cam) trong `packages/ui/src/styles/globals.css`.
- `QuizQuestionItem` tô cam (`text-hot`) cho đáp án đã chọn bất kể verdict, nên câu đúng và câu sai cùng màu cam.
- Không đánh dấu lựa chọn đúng; không có viền/nền theo verdict ở cấp câu; chip verdict chỉ 12px nằm cuối khối.

## Decision
- User chọn cặp token riêng `--verdict-correct`/`--verdict-wrong` (dark `#4ade80`/`#f87171`, light `#166534`/`#b91c1c`, đều ≥4.5:1). Đây là ngoại lệ có chủ đích với quy tắc "đơn sắc + cam" của DESIGN.md, chỉ áp dụng cho màn soi bài/chấm điểm, luôn kèm icon ✓/✗.
- Phạm vi đầy đủ: viền/nền khối câu, đánh dấu lựa chọn đúng/sai (kể cả ô cloze/pin), chip to hơn có icon, navigator nền đặc có icon, compact list trang kết quả.
- Export `isAcceptedAnswer` từ `grade-quiz.ts` để UI so key/alts theo đúng rule normalize của grader.
- Giữ nguyên contract e2e (`data-verdict`, `data-testid`, chữ chip, dòng status).

## Next steps
- Plan: `plans/261009-1104-quiz-review-verdict-highlight/plan.md` (3 phase, ~6h), issue #351.
- Thực thi bằng `/ak:cook` trên branch `feat/quiz-review-verdict-highlight` từ `develop`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
