---
title: "#358: Hiện giải thích đáp án từng câu cho học viên ở màn xem lại bài"
description: "Giáo viên soạn giải thích từng câu từ #423 nhưng học viên chưa thấy. Forward explanation vào snapshot, trả trong review detail SAU khi nộp, render rich text đã sanitize trong disclosure 'Giải thích'."
status: completed
priority: P1
effort: 0.5d
issue: 358
branch: feat/358-student-answer-explanation
tags: [feature, backend, frontend, student]
blockedBy: []
blocks: []
created: 2026-10-28
---

# Plan: #358 — Giải thích đáp án cho học viên (slice review)

## Overview

Đây là một slice của #358 (P1 Student Exam Parity): **hiện giải thích đáp án riêng từng câu** trên màn
`/learn/quizzes/attempt/:attemptId/detail` (bài giao và tự luyện). Từ #423 giáo viên đã soạn được
`explanation` (rich text, ≤ 2000) trong `assignment_prompt.questions`, nhưng `parseQuizQuestions`
ở server strip field này khi chụp snapshot nên học viên chưa bao giờ thấy.

Kế thừa thiết kế ở `plans/261017-1704-student-p1-exam-parity/phase-04-listening-explanation.md`
(explanation đi theo snapshot, fallback prompt cho attempt cũ, review item ưu tiên explanation rồi tới note).

Ngoài phạm vi: `answerSet` (đổi grading, để PR sau), hiện giải thích trong preview mô phỏng của giáo viên (web).

## Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| D1 | `parseQuizQuestions` forward `explanation` khi là string có nội dung (trim > 0); không có thì KHÔNG sinh key. | Snapshot lúc start giữ giải thích (đóng băng như answer/alts). Shape câu không có giải thích giữ nguyên. |
| D2 | **Gate:** `explanation` chỉ xuống wire ở `GET /api/student/attempts/:id/detail`. Route này đã 409 khi `in_progress`, 404 khi không phải chủ attempt / khác org. Take payload (`GET /assignments/:id/quiz`, `GET /practice/:testId/quiz`) vẫn whitelist `{stem, opts, type, pin}`. | Giải thích ≈ đáp án — không được lộ trước khi nộp. |
| D3 | Contract `quizAttemptDetailSchema.questions[]` thêm `explanation: z.string().optional()`; server chỉ gửi key khi có giá trị. `studentQuizQuestionSchema` (take) KHÔNG đổi. | Schema `.strict()`: bundle student cũ chỉ vỡ khi key xuất hiện — server + student phải ship cùng release train (#304). |
| D4 | Attempt cũ (snapshot đã strip): khi KHÔNG câu nào trong snapshot có giải thích, review detail nạp đề hiện hành (assignment: prompt của lượt giao; practice: các part theo `position`) và `fillExplanationsFromCurrent` chỉ gắn khi **cùng số câu và từng câu trùng stem + answer**. Lệch bất kỳ câu nào → bỏ fallback cả đề. | Không gắn giải thích lệch câu khi giáo viên đã sửa đề sau khi học viên làm. |
| D5 | UI: `QuizReviewItem` ưu tiên `explanation` câu, fallback `note` chung của đề (hành vi cũ), cả hai rỗng → ẩn. Render qua `RichTextBody` (DOMPurify) trong `<details>/<summary>` native (bàn phím + screen reader sẵn), token `text-primary` / `text-muted-foreground` / `focus-visible:outline-hot`. | Đúng DESIGN.md; đồng thời sửa lỗi note HTML trước đây hiện thẻ thô. |

## Files

- `packages/api/src/contracts.ts` — `explanation?` trong `quizAttemptDetailSchema`.
- `apps/server/src/routes/student.ts` — forward trong parser, `fillExplanationsFromCurrent`, `loadCurrentQuestionsForAttempt`, review detail.
- `packages/ui/src/components/quiz/quiz-review-item.tsx` — `quizReviewExplanation`, disclosure rich text.
- `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx` — map `explanation` vào `QuizReviewInfo`.
- Test: `apps/server/src/routes/student-quiz-explanation.test.ts` (mới), `apps/student/test/quiz-review-item.test.tsx`, `apps/student/test/quiz-review-explanation-dom.test.tsx` (mới).

## Kiểm chứng

- Server: take payload (assignment + practice) không chứa giải thích; detail 409 khi đang làm; sau nộp có giải thích đúng câu, câu không có thì không có key; snapshot DB giữ giải thích; fallback attempt cũ (assignment + practice) và chặn fallback khi đề đổi.
- Student: ưu tiên explanation > note > ẩn; DOM jsdom render HTML đã sanitize (bỏ `<script>`/`onerror`), disclosure đóng mặc định và mở bằng summary.

## Câu hỏi mở

- Khi câu có giải thích riêng, có cần hiện thêm `note` chung của đề không (hiện tại giải thích câu thay thế note)?
- Có muốn hiện giải thích trong preview mô phỏng của giáo viên (`apps/web/.../preview-quiz-simulation`) không?
