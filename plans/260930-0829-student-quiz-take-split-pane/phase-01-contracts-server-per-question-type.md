---
title: "Phase 1: Contracts + server — per-question type & instruction metadata"
status: done
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Contracts + server — per-question type & instruction metadata

## Overview

Mở dữ liệu cho phân cụm: mỗi câu hỏi mang `type` riêng (optional, fallback
`prompt.type`), payload student luôn trả về type đã resolve, và thêm map dùng
chung `QUIZ_TYPE_DISPLAY` (nhãn dạng bài + instruction chuẩn IELTS) để mọi app
render header cụm từ một nguồn duy nhất.

## Context Links

- Plan index: [plan.md](./plan.md)
- Contract hiện tại: `packages/api/src/contracts.ts:470`–`495`
  (`assignmentPromptBaseSchema.questions` — `.strict()`, chưa có per-question
  type), `:1490`–`1533` (`studentQuizQuestionSchema`, `studentQuizDetailSchema`)
- Server: `apps/server/src/routes/student.ts:99` (`parseQuizQuestions` —
  whitelist field, đang DROP field lạ), `:815` (GET quiz detail),
  `:983` (snapshot lúc start)
- `answerKindByType` / `ASSIGNMENT_ANSWER_CHOICES`: `contracts.ts:349`–`377`
- Danh mục type theo part: `apps/web/src/components/assignments/assignment-presets.ts:130`–`311`

## Requirements

- [x] `assignmentPromptBaseSchema.questions[i]` thêm
      `type: z.string().trim().min(1).max(20).nullish()` — optional, đề cũ
      vẫn hợp lệ (strict schema chấp nhận field absent).
- [x] `AssignmentQuestion` (type exported) phản ánh field mới
      (`type: string | null | undefined`).
- [x] `superRefine` authoring: nếu câu có `type` thì phải nằm trong danh mục
      type của part đó (`config.types`), không thì 400 `invalid` tại
      `questions.N.type`.
- [x] Thêm `QUIZ_TYPE_DISPLAY: Record<string, { label: string; instruction: string }>`
      vào `contracts.ts` + helper `quizTypeDisplay(type)` trả entry fallback
      (`{ label: type, instruction: "" }`) cho type lạ.
- [x] `parseQuizQuestions` giữ field `type` (string → string, thiếu → null).
- [x] GET `/assignments/:assignmentId/quiz`: `questions[].type` =
      `question.type ?? prompt.type` — student payload LUÔN có type cụ thể.
- [x] `studentQuizQuestionSchema` thêm `type: z.string().optional()` —
      OPTIONAL ở phía client dù server luôn gửi: client student strict-parse
      payload (`apps/student/src/lib/repos/quiz.ts:61`), tab đang mở với bundle
      cũ sẽ throw nếu server mới gửi field lạ / strict-schema thêm field bắt
      buộc. Client đọc `question.type ?? detail.type` (fallback kép).
- [x] Grader (`grade-quiz`) KHÔNG đổi.

### Nội dung `QUIZ_TYPE_DISPLAY` (chuẩn IELTS, chỉnh chữ khi implement nếu cần)

| type | label | instruction (EN) |
|---|---|---|
| tfng | True / False / Not Given | Do the following statements agree with the information given in the passage? Write TRUE / FALSE / NOT GIVEN. |
| ynng | Yes / No / Not Given | Do the following statements agree with the views of the writer? Write YES / NO / NOT GIVEN. |
| mcq | Multiple choice | Choose the correct letter A, B, C or D. |
| mcq1, mcq3 | Multiple choice | Choose the correct letter A, B or C. |
| headings | Matching headings | Choose the correct heading for each paragraph from the list of headings. Write the correct roman numeral i–viii. |
| info | Matching information | Which section contains the following information? Write the correct letter A–H. |
| features | Matching features | Match each statement with the correct person/place. Choose from the option bank. |
| sentend | Matching sentence endings | Complete each sentence with the correct ending A–H. |
| sent | Sentence completion | Complete the sentences below. Choose NO MORE THAN THREE WORDS from the passage for each answer. |
| note, notes | Note completion | Complete the notes below. Choose NO MORE THAN THREE WORDS from the passage for each answer. |
| shortans | Short-answer questions | Answer the questions below. Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage. |
| diagram | Diagram label completion | Label the diagram below. Choose NO MORE THAN TWO WORDS from the passage for each answer. |
| summary | Summary completion | Complete the summary below. Choose ONE WORD ONLY from the passage for each answer. |
| tablecomp | Table completion | Complete the table below. Choose NO MORE THAN THREE WORDS from the passage for each answer. |
| flowchart, flow | Flow-chart completion | Complete the flow-chart below. Choose ONE WORD ONLY from the passage for each answer. |
| form | Form completion | Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer. |
| sent4 | Sentence completion | Complete the sentences below. Write ONE WORD ONLY for each answer. |
| map | Map labelling | Label the map below. Write the correct letter A–H for each location. |
| match2 | Matching | Choose your answers from the option bank A–H. |

## Related Code Files

- Modify: `packages/api/src/contracts.ts`
- Modify: `apps/server/src/routes/student.ts` (`parseQuizQuestions` + GET detail)
- Modify test: `apps/server/src/routes/student-quiz.test.ts` (thêm case mixed-type
  payload + case đề cũ fallback `prompt.type`)

## Implementation Steps

1. Thêm field `type` vào question schema + superRefine catalog check trong
   `contracts.ts`.
2. Thêm `QUIZ_TYPE_DISPLAY` + `quizTypeDisplay()` cùng file, export.
3. Server: thêm dòng parse `type` trong `parseQuizQuestions`; map
   `type: question.type ?? prompt.type` vào `detail.questions` của GET quiz.
4. Cập nhật test server: seed prompt 2 cụm type khác nhau (tfng + note) →
   payload per-question type đúng; prompt không có per-question type → mọi câu
   nhận `prompt.type`.

## Todo

- [x] Contract field + superRefine validation
- [x] `QUIZ_TYPE_DISPLAY` map + fallback helper
- [x] Server parse + resolve `type ?? prompt.type`
- [x] Server tests (mixed + legacy)

## Success Criteria

- `pnpm --filter server test` xanh (case mới + cũ không đổi).
- `pnpm check-types` xanh qua 3 app (`web`, `student`, `server`).
- Đề cũ không có per-question type: payload JSON mỗi câu vẫn có `type` (=
  prompt type) — diff wire chỉ thêm field, không đổi field cũ.

## Risk Assessment

- **Strict schema + clients cũ**: thêm optional field là tương thích 1 chiều;
  web authoring hiện tại không gửi `type` per-question → vẫn save được. Không
  cần version payload.
- **Deploy chéo (verification finding)**: client student strict-parse payload
  (`repos/quiz.ts:61`) — tab đang mở giữ bundle cũ sẽ từ chối field lạ khi
  server mới gửi `type` (`.strict()` zod). Vì vậy `type` là optional ở schema
  client (bundle mới tolerate thiếu, dễ migrate dần); cửa sổ rủi ro chỉ còn
  "bundle cũ + server mới" trong lúc deploy monorepo đồng bộ — chấp nhận như
  các lần evolve contract trước (fallback: học viên reload tab).
- **Snapshot đang làm dở**: snapshot cũ parse ra `type: null` → fallback
  `prompt.type` khi đọc — học viên resume không thấy khác biệt.

## Security Considerations

- `type` là metadata hiển thị, không lộ answer key; không mở surface mới.
- `quizTypeDisplay` fallback đảm bảo type lạ không crash renderer client.
