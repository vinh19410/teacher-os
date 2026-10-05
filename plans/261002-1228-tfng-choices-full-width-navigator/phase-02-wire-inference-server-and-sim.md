---
phase: 2
title: "Áp suy luận vào payload server + preview mô phỏng"
status: pending
priority: P1
effort: "1.5h"
dependencies: [1]
---

# Phase 2: Áp suy luận vào payload server + preview mô phỏng

## Goal
Take payload, review detail và preview mô phỏng của giáo viên đều gửi type đã suy luận, nên `questionChoiceRows` sinh 3 radio TRUE / FALSE / NOT GIVEN cho câu 1–4 mà không cần sửa UI render.

## Bối cảnh
- Take payload: `apps/server/src/routes/student.ts:891-899` map `type: question.type ?? prompt.type`. `questions` lấy từ snapshot của attempt hoặc `prompt.questions`; cả hai đều là `AssignmentQuestion` có `answer`.
- Review detail: `apps/server/src/routes/student.ts:1299-1311` map `type: question.type ?? promptType`.
- Preview mô phỏng: `apps/web/src/lib/assignment-quiz-sim.ts:72-78` dựng `takeQuestions` mà **không có `type`**, và `normalizeQuestion` (`:99`) cũng bỏ `item.type`. Vì vậy mọi đề trộn dạng trong preview đều render theo type đề, đây là bug có sẵn.
- Client (`QuizPaper`, `buildQuizParts`) đã đọc `question.type ?? detail.type`, nên không cần đổi.
- Grading (`packages/api/src/lib/grade-quiz.ts:22`) normalize lowercase, nên radio `"FALSE"` khớp key `"FALSE"`.

## Files
- Modify: `apps/server/src/routes/student.ts` (take payload + review detail)
- Modify: `apps/web/src/lib/assignment-quiz-sim.ts` (`buildQuizSim`, `normalizeQuestion`)
- Modify: `apps/server/src/routes/student-quiz.test.ts`
- Modify: `apps/web/src/lib/assignment-quiz-sim.test.ts`

## Steps
1. Test trước (red):
   - `student-quiz.test.ts`: prompt `type: "note"` với 2 câu markerless (đáp án `TRUE`, `NOT GIVEN`) và 1 câu có `____`. GET quiz thì `questions[].type` là `["tfng","tfng","note"]`. GET attempt detail sau khi nộp thì cũng ra như vậy; nộp `"TRUE"` cho câu 1 thì verdict `correct`.
   - `assignment-quiz-sim.test.ts`: draft có item `type: "mcq"` thì `takeQuestions[i].type === "mcq"` (bug mất type). Draft type `note` có item đáp án TFNG markerless thì `type === "tfng"`.
2. Server: trong cả hai handler, tính `const types = inferQuestionTypes(questions, prompt.type /* hoặc promptType */)` trước khi map, rồi set `type: types[index]`. Giữ comment hiện có về fallback, bổ sung một dòng nói rằng câu không khai type có thể được suy ra tfng/ynng từ đáp án.
3. Web sim: `normalizeQuestion` giữ `type: item.type ?? null`. `takeQuestions` thêm `type: types[index]` với `types = inferQuestionTypes(fullQuestions, typeId)`.
4. Không đổi contract (`studentQuizQuestionSchema.type` vẫn optional).
5. Ghi chú phạm vi: `student-preview-paper.tsx` (preview tĩnh lúc soạn đề, không tương tác) không nằm trong scope của issue; đề đã được cảnh báo ở answer-key grid (phase 3).

## Verify
- `pnpm --filter server test student-quiz` xanh.
- `pnpm --filter web test assignment-quiz-sim` xanh.
- Thủ công trên dev stack local (8000/8001/8003): mở đề "Wooden buildings" ở student app, thấy câu 1–4 có 3 radio. Mở preview "Làm thử" ở web, thấy tương tự.

## Risk / Rollback
Chỉ đổi giá trị `type` trên wire. Rollback bằng cách revert hai file route/sim; dữ liệu DB không bị đụng.
