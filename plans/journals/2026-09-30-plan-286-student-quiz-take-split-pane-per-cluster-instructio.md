---
title: "Plan #286: student quiz take split-pane + per-cluster instructions"
date: 2026-09-30
summary: ak-plan cho redesign trang làm bài /learn/quizzes — split-pane reading + per-question type để đặt instruction chuẩn trên từng cụm câu hỏi
---

# Plan #286: student quiz take split-pane + per-cluster instructions

## What happened

- User yêu cầu redesign trang làm bài `/learn/quizzes/:assignmentId` (ảnh chụp kèm): reading chia 2 pane cuộn độc lập, và instruction của từng cụm câu hỏi phải đặt ngay phía trên cụm đó thay vì gom 1 khối ở đầu trang.
- Scout phát hiện gốc rễ dữ liệu: model hiện tại **1 prompt = 1 `type` + 1 `intro` blob** (`contracts.ts` question schema strict: stem/opts/answer/alts/pin; server `student.ts:815` build detail từ 1 promptId) — không tồn tại ranh giới cụm câu hỏi. Ảnh chụp là 1 prompt reading có intro chứa 3 khối instruction do giáo viên tự dán; câu T/F/NG nhét vào prompt cloze không có chỗ nhập đáp án (type prompt không có answerKind).
- Hỏi user 2 quyết định scope: chốt **per-question type** (thay vì UI-only hay đưa full test xuống take) và **redesign trước** plan #285 (sáng nay, pending — sẽ rebase sau).
- Soạn plan 4 phase qua `ak plan` scaffold: contracts+server (type per-question optional + `QUIZ_TYPE_DISPLAY` map EN chuẩn IELTS) → authoring (select type từng câu) → take screen (buildQuizParts gom cụm + header `Questions X–Y` + instruction) → split-pane layout (lg: 2 cột overflow riêng, mobile xếp chồng).
- Validation gate tier Standard (24 claims, 0 failed) bắt 1 finding thật: client student strict-parse payload tại `apps/student/src/lib/repos/quiz.ts:61` → `type` REQUIRED ở client schema sẽ làm tab đang mở vỡ khi deploy chéo. Fix: `z.string().optional()` + fallback kép (server `?? prompt.type`, client `?? detail.type`).
- Tạo issue #286 (label `ready to review`), commit plan `b873f01` trên develop.

## Decision

- Per-question `type` là optional với fallback kép — không migration (questions là cột JSON), grader không đổi (so khớp chuỗi thuần, không đọc type).
- Instruction chuẩn EN IELTS từ map dùng chung `QUIZ_TYPE_DISPLAY` (contracts.ts); `intro` prompt vẫn render 1 lần trên cụm đầu (không tự ẩn dữ liệu GV; đề cũ trùng lặp tạm thời — GV tự dọn).
- Split-pane chỉ áp dụng reading có passage; listening/writing/speaking giữ 1 cột; review screen dùng chung layout mới.

## Next steps

- `/ak:cook plans/260930-0829-student-quiz-take-split-pane/plan.md` (khuyến nghị `/clear` trước).
- Sau khi land: rebase plan #285 (extract renderer sang packages/ui) lên kết quả.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
