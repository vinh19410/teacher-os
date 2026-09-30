---
title: Plan student quiz take + review UI (Selfomy reference)
date: 2026-09-30
summary: "ak-plan --github hard mode: greenfield student quiz-taking + review vertical slice referencing live Selfomy capture"
---

# Plan student quiz take + review UI (Selfomy reference)

## What happened

Chạy `/ak:plan --github` (Hard mode + HOLD scope) tạo plan
`plans/260930-0344-student-quiz-take-review-ui/` (#283): luồng học viên **làm bài** +
**xem lại bài làm** trên student portal — vertical slice từ DB tới UI.

Nghiên cứu: URL tham khảo `test123456.hoc.sh/learn/quizzes/...` hóa ra là app Laravel
Livewire (Selfomy), KHÔNG phải deployment của repo — scout xác nhận take/review trong
teacher-os 100% greenfield (3 route student app, không bảng attempt, không endpoint).
Login bằng test account, capture live trọn UX: start/resume swal, take screen (header +
timer + paper 1 cột + radio pills + inline blanks + footer navigator 2 trạng thái),
autosave per-interaction, submit guard đếm câu trống, result summary (đúng/sai/bỏ qua),
review detail (verdict chip đỏ, Đáp án reveal, Explain). Ghi vào
`research/selfomy-reference-capture.md` + `research/scout-evidence.md`.

## Decision

- Quiz = `class_assignment` (prompt) — unit giao bài hiện có; UI thiết kế parts-array-first
  cho plan "giao full test" kế tiếp cắm vào.
- Snapshot `questionsSnapshot` vào attempt lúc start (mở rộng title-snapshot precedent
  #208) — chống prompt-edit làm hỏng bài đang làm.
- Autosave = MỘT statement atomic `UPDATE ... json_set(...)` + predicate ownership
  (org+student) thay vì read-modify-write (D1 không transaction).
- Submit flip-first idempotent; đồng thời là write-path `submittedAt` cho
  class_assignment_target (đóng non-goal #208).
- Leak rule: take payload strip answer/alts/note; summary + detail gate `submitted`.
- Validation user: defer reading tools, defer retake/download, score = raw correct count.

## Notes

- Red team 3 reviewers (Security/Failure/Assumption) với verification roles: 29 raw →
  15 findings accept (3 Critical: router-mount riêng mất auth, thiếu CSRF Origin guard,
  prompt-edit corrupts attempts) — tất cả applied + consistency sweep sạch.
- ClozeStemText hiện sizing blank TỪ answer key → respec interactive (width theo value)
  là điều kiện tiên quyết của take screen; Phase 2 dời renderer về `@teacher-os/ui`.
- E2e seed thẳng DB (precedent seedStudent D6) thay vì lái UI authoring — giữ spec trong
  budget 120s.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
