---
title: "Student quiz take redesign — split-pane + instruction từng cụm (#286)"
date: 2026-09-30
---

# Student quiz take redesign — split-pane + instruction từng cụm (#286)

## Bối cảnh
Issue #286: trang làm bài `/learn/quizzes/:assignmentId` là 1 cột cuộn chung, khối hướng dẫn dồn về đầu trang, và câu T/F/NG nhét vào prompt cloze không có chỗ nhập đáp án. Gốc rễ: model 1 prompt = 1 type + 1 intro blob, không có ranh giới cụm.

## Đã làm (4 phase, plan 260930-0829)
1. Contracts + server: `type` per-question (optional, fallback `prompt.type`), `QUIZ_TYPE_DISPLAY` map instruction EN chuẩn IELTS, payload student + attempt detail luôn mang type hiệu dụng.
2. Authoring web: select dạng bài từng hàng trong answer-key grid, widget/answer-key/keyboard/bank-chips key theo type câu; preview theo type từng câu.
3. Take/review student: `buildQuizParts(questions, promptType)` gom cụm liên tiếp cùng type, header `Questions X–Y` + instruction chuẩn ngay trên từng cụm.
4. Split-pane reading: passage trái / bài làm phải, cuộn độc lập ≥ lg (navigator trong pane phải), xếp chồng < lg; áp cả take lẫn review.

## Điểm khó
- Code review phát hiện Critical: kernel snapshot `parseQuestions` + bridge `composerFromPrompt` strip field `type` — edit/Apply đề trộn qua test-builder sẽ xoá âm thầm toàn bộ type (data loss). Fix + test round-trip.
- PATCH prompt chưa mirror validation create cho per-question type — thêm gate catalog part + answer-choice theo type hiệu dụng ở route (schema update không có skill/part context).
- Option bank theo type prompt để cụm bankable trong prompt không-bankable "đòi bank mà không có bank" — helper dùng chung `optionBankKindFor()` (prompt-first, rồi row bankable đầu).
- E2e split-pane: gán `scrollTop` programmatic bị reset (nghiêng nghiêng scroll restoration) — đổi sang wheel input thật của user, chặt semantic hơn.

## Bằng chứng
436 server + 1126 web + 125 student vitest, biome, tsc, e2e quiz spec 5/5, full e2e 110/111 (1 flaky timing capture listener — pass khi rerun riêng). Review subagent: 0 Critical còn lại sau fix.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
