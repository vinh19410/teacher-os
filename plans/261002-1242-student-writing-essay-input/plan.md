---
title: "Quiz take: ô nhập bài viết Writing + đếm từ cho học viên"
description: "Đề Writing ở trang làm bài học viên có textarea nhập bài, autosave, đếm từ theo mục tiêu Task 1/Task 2, và màn kết quả hiện lại bài đã nộp."
status: pending
priority: P1
effort: "8h"
issue: 304
branch: develop
tags: [feature, frontend, backend, database, quiz]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Quiz take: ô nhập bài viết Writing + đếm từ cho học viên

## Overview

Học viên mở một đề Writing (ví dụ "Situation of marriage and age from 1960 to 2000 in Australia") thì chỉ thấy đề bài và dòng "Đề này không có câu hỏi tự chấm — liên hệ giáo viên…". Footer ghi "Đã trả lời 0/0 câu". Không có chỗ nào để viết bài, nên bấm "Nộp bài" chỉ nộp một attempt rỗng.

Nguyên nhân gốc: `QuizPaper` (`packages/ui/src/components/quiz/quiz-paper.tsx`) chỉ render input cho từng câu trong `parts`. Đề Writing có `questions: []` (contract ghi rõ Writing là "prompt-only type with no questions"), nên rơi vào nhánh empty-state ở cuối component. Phía server cũng chưa có chỗ lưu bài viết: `PATCH /attempts/:id/answer` từ chối mọi `q >= questions.length` (tức là mọi `q` khi đề có 0 câu), giới hạn mỗi value 500 ký tự (`QUIZ_ANSWER_VALUE_MAX`), và body bị cap 4096 byte.

Plan này thêm luồng làm bài Writing đầy đủ phía học viên: một textarea, autosave như các dạng khác, đếm từ có mục tiêu tối thiểu, chặn nộp nhầm bài trống, và màn kết quả hiện lại bài đã nộp.

## Key Decisions

1. **Cột `essay` riêng trên `quiz_attempt`** (`text NOT NULL DEFAULT ''`, migration 0031), cùng endpoint `PATCH /api/student/attempts/:attemptId/essay` với body `{ text }`. Không nhét bài viết vào map `answers`: map đó gắn với index câu hỏi, cap 500 ký tự và đi vào `gradeQuiz`.
2. **Giới hạn độ dài:** `QUIZ_ESSAY_MAX = 10000` ký tự. Bài Task 2 thường 250–400 từ, khoảng 2.500 ký tự, nên 10.000 là dư 4 lần. Riêng route `/essay` có body cap `QUIZ_ESSAY_BODY_MAX = 48 * 1024` byte (đủ cho 10.000 ký tự tiếng Việt UTF-8 3 byte cộng escape JSON). Route này vẫn dưới giới hạn 64KB của `fetch keepalive`. Các route quiz khác giữ cap 4096.
3. **Chỉ đề Writing mới ghi được essay.** Server join `class_assignment → assignment_prompt` và trả 400 khi `skill !== "writing"`. Ownership dùng đúng predicate org + student như PATCH answer (IDOR guard). Attempt đã submitted thì trả 409. Ghi bằng UPDATE có điều kiện `status = 'in_progress'` (D1 không có transaction, cùng precedent với PATCH answer).
4. **Tái dùng nguyên `createQuizAttemptStore` phía client**, không viết store thứ hai. Với đề Writing, route khởi tạo store với key `q = 0`, `send = patchQuizEssay`, và option mới `valueMax = QUIZ_ESSAY_MAX`. Debounce, mirror localStorage, resume dialog, keepalive flush khi `pagehide`, guard `beforeunload`, drain-before-submit và halt 401/409 đều có sẵn. Mỗi attempt chỉ có một skill nên mirror key `quiz-attempt:{id}` không bị đụng.
5. **`QuizPaper` không đổi API.** Đề Writing render `QuizEssayInput` bind vào `answers[0]` / `onAnswer(0, …)`. Ở review mode thì `readOnly`. Textarea tắt `spellCheck`, giống thi IELTS thật (không có kiểm tra chính tả). Empty-state "không có câu hỏi tự chấm" bị ẩn với Writing.
6. **Đếm từ dùng hàm thuần chung** `countWords` (`packages/api/src/lib/word-count.ts`): trim rồi tách theo whitespace (`/\s+/u`). Từ có gạch nối và số đều tính là 1 từ, đúng quy ước IELTS. Mục tiêu tối thiểu lấy từ `WRITING_MIN_WORDS` theo `detail.part`: `task1 = 150`, `task2 = 250`; part lạ thì không hiện mục tiêu.
7. **Thiếu từ chỉ cảnh báo, không chặn nộp** (user chốt ngày 2026-10-02). Footer sticky thay cho `QuizNavigator`, hiện "N từ · tối thiểu 150". Dưới mức tối thiểu thì đổi màu cảnh báo. Bấm Nộp khi bài trống hoặc dưới mức tối thiểu sẽ mở guard dialog với copy riêng cho Writing. Học viên vẫn nộp được.
8. **Màn kết quả Writing** (user chốt): `quizAttemptSummarySchema` thêm `essay: string | null`, null cho đề không phải Writing. Khi `essay !== null`, summary ẩn `AttemptScoreCard`, `AttemptCompactList` và nút "Xem giải thích chi tiết". Thay vào đó hiện bài đã nộp (read-only, giữ xuống dòng), số từ, và dòng "Giáo viên sẽ chấm bài viết của bạn."

## Non-Goals

- Giáo viên đọc/chấm bài viết đã nộp: hiện phía teacher chưa có màn nào đọc `quiz_attempt`. Phần này làm ở issue follow-up (user chốt).
- Speaking (ghi âm), chấm điểm tự động bài viết, timer.
- Rich text trong bài viết: chỉ plain text, đúng format bài thi.
- Tab "Làm thử & Soi bài" của giáo viên: simulation chỉ dựng cho đề auto-graded (`apps/web/src/lib/assignment-quiz-sim.ts`), Writing không đi vào đó.
- Không đổi grading, `answers`, hay luồng của Reading/Listening.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Contract + DB + endpoint essay](./phase-01-contract-db-essay-endpoint.md) | Pending |
| 2 | [UI làm bài Writing: textarea, đếm từ, autosave, guard](./phase-02-take-essay-ui.md) | Pending |
| 3 | [Màn kết quả Writing + e2e + gate cuối](./phase-03-summary-e2e-gates.md) | Pending |

Chạy tuần tự 1 → 2 → 3.

## Success Criteria

- [ ] Đề Writing ở take screen có textarea "Bài viết của bạn". Gõ bài thì header chuyển "Đang lưu…" rồi "Đã lưu". Reload trang thì có resume dialog, bấm tiếp tục thì bài viết còn nguyên.
- [ ] Footer hiện số từ trực tiếp, kèm mục tiêu 150 (Task 1) hoặc 250 (Task 2). Dưới mức thì đổi màu cảnh báo.
- [ ] Nộp khi bài trống hoặc thiếu từ thì có guard dialog. Xác nhận thì vẫn nộp được.
- [ ] Sau nộp, summary hiện bài đã viết và số từ, không còn score card 0/0.
- [ ] PATCH essay: 200 khi đúng chủ, 404 khi khác học viên/org, 409 khi đã nộp, 400 khi đề không phải Writing hoặc vượt `QUIZ_ESSAY_MAX`, 413 khi body vượt cap. PATCH answer vẫn giữ cap 4096.
- [ ] Reading/Listening không hồi quy: các test e2e cũ trong `student-quiz-take-review.spec.ts` vẫn xanh.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm --filter server test`, `pnpm --filter student test`, `pnpm --filter web test`, e2e `student-quiz-take-review` (ports 8100/8101/8103) xanh.

## Risks

- **Cửa sổ deploy:** `quizAttemptSummarySchema` là `.strict()` ở top-level, nên bundle student cũ parse payload mới có `essay` sẽ throw. Vì vậy phải deploy server và student trong cùng một release. Nếu lỡ lệch, màn summary rơi vào error boundary có nút thử lại, không mất dữ liệu. Field `attempt.essay` trong GET quiz nằm ở object con không strict nên không bị ảnh hưởng.
- **Migration:** chỉ `ALTER TABLE ADD COLUMN` có default, không đụng dữ liệu cũ. Vẫn backup D1 trước khi apply ở môi trường thật (theo rule dự án).

## Dependencies

- Xây trên quiz take/review (#283), split-pane (#286) và intro theo cụm (#301), tất cả đã merge.
- Issue theo dõi: [vinh19410/teacher-os#304](https://github.com/vinh19410/teacher-os/issues/304).
- PR đích: `develop`. CI chỉ chạy cho `main`, nên gate là bộ lệnh local ở Phase 3.
