---
title: "Plan #304 — ô nhập bài viết Writing cho học viên"
date: 2026-10-02
summary: Lên plan thêm textarea + autosave + đếm từ cho đề Writing ở take screen; essay lưu cột riêng
---

# Plan #304 — ô nhập bài viết Writing cho học viên

## What happened
Đề Writing ở take screen của học viên không có chỗ viết bài. Nguyên nhân là `QuizPaper` chỉ render input theo `parts`, mà Writing có `questions: []`, nên rơi vào empty-state "không có câu hỏi tự chấm". Phía server, `PATCH /attempts/:id/answer` từ chối mọi `q` khi đề có 0 câu, cap 500 ký tự/value và body 4096 byte, nên không thể lưu bài viết qua map `answers`.

## Decision
- Cột `essay` riêng trên `quiz_attempt` (migration 0031) + `PATCH /api/student/attempts/:id/essay`. Chỉ skill writing mới ghi được. `QUIZ_ESSAY_MAX` = 10.000 ký tự. Riêng route `/essay` có body cap 48KB qua `quizWriteGuard`; các route khác giữ 4096.
- Client tái dùng `createQuizAttemptStore` (key q=0, sender `patchQuizEssay`, option mới `valueMax`), giữ nguyên debounce, mirror, resume, keepalive, drain.
- Đếm từ bằng `countWords` dùng chung. Mục tiêu 150 (task1) / 250 (task2) chỉ cảnh báo, không chặn nộp. Guard dialog có copy riêng cho bài trống/thiếu từ.
- Summary thêm `essay: string | null`. Với Writing thì hiện bài đã nộp thay cho score card 0/0.
- Màn giáo viên đọc/chấm bài viết để ngoài scope, làm ở follow-up.

## Risks
`quizAttemptSummarySchema` là `.strict()` ở top-level: bundle student cũ gặp field `essay` sẽ throw. Phải deploy server và student cùng release.

## Next steps
Chạy `/ak:cook plans/261002-1242-student-writing-essay-input/plan.md`. Mở issue follow-up cho phía giáo viên sau khi merge.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
