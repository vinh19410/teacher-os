---
title: "Plan #574: Gộp trắc nghiệm + Writing trong một bài tập"
date: 2026-11-04
summary: "Chốt kiến trúc phần Writing đính kèm trên assignment_prompt tự chấm (Approach A), hoàn tất Red-Team 3 persona và Kongming Checkpoint #2"
---

# Plan #574: Gộp trắc nghiệm + Writing trong một bài tập

## Bối cảnh & Bài toán (#574)
Giáo viên (Cô Mỹ) cần giao một bài tập gồm cả câu hỏi trắc nghiệm tự chấm (Grammar/Vocabulary/Reading/Listening) lẫn phần viết bài Writing trong cùng một lần tạo và giao bài.

## Quyết định kiến trúc
- Khảo sát xác nhận `test-builder-shell.tsx` (`assignment_test`) khóa cứng 1 kỹ năng và không gắn được vào `class_assignment`.
- Chọn **Approach A** (qua tư vấn `kongming`): bổ sung 3 cột additive `writing_part`, `writing_type`, `writing_prompt` trên `assignment_prompt`, giữ bất biến 1 `assignment_prompt` -> 1 `class_assignment` -> 1 `quiz_attempt` (tận dụng các cột `questions_snapshot`/`answers`/`correct_count` và `essay`/`grade_scores` sẵn có trên `quiz_attempt`).
- Tách `studentWritingSectionSchema` khỏi `assignmentWritingSectionSchema`, dùng dual `useQuizAttemptStore` trên cổng học viên, khóa 409 `WRITING_SECTION_LOCKED` khi đề đã gắn lớp/test/study-pack, và guard 0 Credit khi bài gộp để trống phần Writing.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
