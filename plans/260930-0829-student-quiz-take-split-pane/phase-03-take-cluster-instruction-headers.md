---
title: "Phase 3: Take screen — chia cụm + header instruction trên từng cụm"
status: todo
priority: P1
effort: 4h
dependencies: [1]
---

# Phase 3: Take screen — chia cụm + header instruction trên từng cụm

## Overview

Take screen (`/learn/quizzes/:assignmentId`) và review screen chia câu hỏi
thành cụm theo chuỗi câu liên tiếp cùng `type`; mỗi cụm render header
`Questions X–Y` + nhãn dạng bài + instruction chuẩn (từ `QUIZ_TYPE_DISPLAY`)
ngay phía trên cụm — thay cho hiện trạng gom hết instruction (intro blob) ở
đầu trang. Đây là đúng yêu cầu chính của user trong ảnh chụp.

## Context Links

- Plan index: [plan.md](./plan.md)
- Phase trước: [phase-01-contracts-server-per-question-type.md](./phase-01-contracts-server-per-question-type.md)
- `apps/student/src/lib/quiz-parts.ts` — `buildQuizParts` hiện hard-code 1 part
  "Phần 1" (`:24`–`39`, comment ghi sẵn shape cho multi-part)
- `apps/student/src/components/quiz/quiz-paper.tsx` — render intro blob tại
  `:146`–`148`, sections per part tại `:173`–`196` (heading chỉ hiện khi
  `parts.length > 1`)
- `apps/student/src/components/quiz/quiz-question-item.tsx` —
  `questionChoiceRows(question, typeId, bank)` (`:27`) key theo prompt-level
  type; `scrollToQuestion` (`:150`)
- `apps/student/src/components/quiz/quiz-navigator.tsx` — part tabs đã sẵn
  (`:71`–`99`, hiện khi `parts.length > 1`)
- Take route: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:131`–`134`
  (caller hiện tại: `buildQuizParts(detail.questions)` — phase này thêm tham số
  `promptType` = `detail.type`)
- Review route: `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx:71`
- E2E: `apps/e2e/specs/student-quiz-take-review.spec.ts`

## Requirements

- [ ] `buildQuizParts(questions, promptType)` gom câu liên tiếp cùng type
      (`question.type ?? promptType` — fallback kép theo Phase 1) thành từng
      part; part giữ shape hiện tại + thêm `typeId: string`. Đề 1 type → vẫn
      1 part (không đổi hiển thị cũ).
- [ ] `part.label` = `Questions {first}–{last}` (1 câu thì `Questions {n}`).
- [ ] `QuizPaper`: mỗi part (auto skills) render header cụm phía trên câu hỏi:
      dòng đậm `Questions X–Y`, dòng nhãn dạng bài (label từ
      `QUIZ_TYPE_DISPLAY`), dòng instruction (muted, text-sm). Header hiện ở
      CẢ take lẫn review mode.
- [ ] `questionChoiceRows` nhận type TỪNG CÂU (`question.type`) thay vì
      `detail.type`; `ClozeStemText typeId` theo câu.
- [ ] `intro` prompt vẫn render 1 lần phía trên cụm đầu (giữ vị trí tương đối
      sau passage/ảnh, trước cụm đầu tiên) — nơi cho ghi chú riêng của giáo
      viên; không tự xoá nội dung intro cũ.
- [ ] Option bank + PinOverlay/ảnh đề giữ logic prompt-level (như hiện tại).
- [ ] Navigator: part tabs bật theo `parts.length > 1` (đã có sẵn) — tab label
      = `Questions X–Y`, click scroll tới câu đầu cụm (đã có `onSelect`).
- [ ] Pin overlay: nếu cụm chứa pin question, pin overlay render trên cùng cụm
      đó (hoặc giữ toàn-bài như hiện tại nếu phức tạp — ưu tiên giữ hiện trạng,
      ghi chú trong PR).

## Related Code Files

- Modify: `apps/student/src/lib/quiz-parts.ts`
- Modify: `apps/student/src/components/quiz/quiz-paper.tsx`
- Modify: `apps/student/src/components/quiz/quiz-question-item.tsx`
  (`questionChoiceRows` signature — caller duy nhất là `quiz-paper.tsx`)
- Modify: `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx`
  (nếu cần truyền thêm — chủ yếu không đụng)
- Modify test: `apps/student/test/quiz-navigator.test.tsx` + thêm test mới cho
  clustering (đặt tại app student theo precedent vitest)
- Modify: `apps/e2e/specs/student-quiz-take-review.spec.ts`

## Implementation Steps

1. Viết test trước cho `buildQuizParts(questions, promptType)`: mảng 13 câu type
   [tfng×4, flowchart×4, note×5] → 3 parts, labels `Questions 1–4/5–8/9–13`,
   `q`/`number` liên tục 0-based; mảng câu thiếu `type` → fallback `promptType`
   gom 1 part; mảng 1 type → 1 part.
2. Implement gom cụm trong `buildQuizParts` (thuần, không phụ thuộc React).
3. `QuizPaper`: thêm khối header cụm (dùng `quizTypeDisplay(part.typeId)`);
   điều kiện heading cũ `parts.length > 1` thay bằng header cụm luôn hiện với
   auto skills; giữ `aria-label` mô tả (`Questions X–Y · label`).
4. Chuyển `choiceRowsByQ` sang key theo `question.type`; cập nhật
   `ClozeStemText typeId`.
5. Cập nhật e2e: đề mixed-type (seed qua API/DB hiện có của spec) assert 3
   header cụm đúng vị trí TRƯỚC cụm câu tương ứng; đề 1 type không hồi quy.
6. Chạy bộ local: `pnpm --filter student test` → `pnpm check` →
   `pnpm check-types` → e2e ports 8100/8101/8103.

## Todo

- [ ] Test + implement `buildQuizParts` clustering
- [ ] Header cụm trong `QuizPaper` (take + review dùng chung)
- [ ] Per-question type cho choice rows + cloze width
- [ ] E2E mixed-type + regression

## Success Criteria

- Đề như ảnh chụp: 3 cụm header `Questions 1–4 · True / False / Not Given`,
  `Questions 5–8 · Flow-chart completion`, `Questions 9–13 · Note completion`
  đặt ngay trên cụm tương ứng; câu tfng có pill TRUE/FALSE/NOT GIVEN để trả
  lời (hết trạng thái "không có chỗ nhập").
- Review screen hiển thị header cụm + verdict y cấu trúc take.
- Đề cũ 1 type: hiển thị như hiện tại cộng thêm 1 header cụm duy nhất — không
  vỡ layout, không đổi logic autosave/submit.
- `pnpm --filter student test`, `pnpm check`, `pnpm check-types`,
  `pnpm --filter e2e e2e` xanh.

## Risk Assessment

- **Regression đề 1 type**: clustering phải vô hại với N=1 (test pin). Giữ
  nguyên key answers theo `q` index — không đụng store autosave.
- **scrollToQuestion giữa các cụm**: anchor vẫn theo `q` — không đổi; chỉ cần
  `scroll-mt` đủ lớn khi có header dính (kiểm tra thủ công).
- **Type lạ (đề cũ snapshot fallback)**: `quizTypeDisplay` fallback label =
  chính type id, instruction rỗng — không crash.

## Security Considerations

- Instruction text là constant phía client — không inject rich text từ user;
  `intro` vẫn qua `RichTextBody` sanitize sẵn như hiện tại.
