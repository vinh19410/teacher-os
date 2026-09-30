---
phase: 1
title: "Quiz logic into api package"
status: completed
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Quiz logic into api package

## Goal

Đưa 2 module logic thuần của quiz (`grade-quiz`, `quiz-parts`) về `packages/api`
để web có thể import client-side cho simulation, giữ nguyên behavior — pure move.

## Context Links

- `reports/scout-report.md` mục 3, 4 — signature, import type-only, precedent test-ở-consumer.
- Tiền lệ extraction #284 (commit `f0ceefc`): move + cutover sạch, không shim.

## Key Insights

- `gradeQuiz` (`apps/server/src/lib/grade-quiz.ts:50`) import **type-only** từ
  `@teacher-os/api/contracts` (L1-4) — 0 runtime dep server, chạy client được.
- `packages/api` chưa có vitest nhưng có precedent logic thuần được test từ app
  tiêu thụ (`format-schedule.ts` ↔ `apps/web/src/lib/format-schedule.test.ts`) —
  test `grade-quiz.test.ts` **giữ ở apps/server**, chỉ đổi import path.
- `quiz-parts.ts` đã được cover gián tiếp qua test paper/navigator của student —
  không cần test mới cho pure move.

## Requirements

- [ ] `gradeQuiz` + type `QuizGrade` import được từ `@teacher-os/api/lib/grade-quiz`.
- [ ] `buildQuizParts` + `QuizPart`/`QuizPartQuestion` import được từ
      `@teacher-os/api/lib/quiz-parts`.
- [ ] Server và student cutover import; không còn file gốc ở vị trí cũ; không shim.
- [ ] Behavior không đổi — 15 test gradeQuiz cũ xanh ở import path mới.

## Architecture

```
apps/server/src/lib/grade-quiz.ts        → packages/api/src/lib/grade-quiz.ts (move)
apps/server/src/lib/grade-quiz.test.ts   → giữ nguyên vị trí, đổi import sang @teacher-os/api/lib/grade-quiz
apps/student/src/lib/quiz-parts.ts       → packages/api/src/lib/quiz-parts.ts (move)
```

Lý do chọn `packages/api` chứ không `packages/ui`: đây là logic dữ liệu thuần
trên contract types (không phải renderer); api đã là dependency của server,
web, student, ui nên không thêm edge mới.

## Files to Create / Modify

- Create: `packages/api/src/lib/grade-quiz.ts` (nội dung move nguyên văn).
- Create: `packages/api/src/lib/quiz-parts.ts` (nội dung move nguyên văn).
- Delete: `apps/server/src/lib/grade-quiz.ts`, `apps/student/src/lib/quiz-parts.ts`.
- Modify: `apps/server/src/lib/grade-quiz.test.ts` (import path).
- Modify: mọi import `grade-quiz` trong `apps/server` (grep `from ".*grade-quiz"`,
  tối thiểu `apps/server/src/routes/student.ts`) và `quiz-parts` trong
  `apps/student` (grep `from ".*quiz-parts"` — routes + components + tests).

## Implementation Steps

1. `git mv apps/server/src/lib/grade-quiz.ts packages/api/src/lib/grade-quiz.ts`;
   import type `@teacher-os/api/contracts` chuyển sang relative `../contracts`
   theo pattern file hiện có trong package (đối chiếu `format-schedule.ts`).
2. `git mv apps/student/src/lib/quiz-parts.ts packages/api/src/lib/quiz-parts.ts`;
   import `StudentQuizQuestion` chuyển sang relative tương tự.
3. Cutover import consumer — danh sách đã grep-verify tại thời điểm plan (chạy
   lại `grep -rn 'quiz-parts\|grade-quiz' apps packages --include='*.ts*'`
   trước khi sửa để bắt phát sinh):
   - `grade-quiz` (2 file): `apps/server/src/lib/grade-quiz.test.ts:3`,
     `apps/server/src/routes/student.ts:45`.
   - `quiz-parts` (8 file): `apps/student/src/components/quiz/quiz-navigator.tsx:8`,
     `apps/student/src/components/quiz/quiz-paper.tsx:19`,
     `apps/student/src/components/quiz/quiz-question-item.tsx:12`,
     `apps/student/src/routes/_auth/learn/quizzes/$assignmentId.tsx:21`,
     `apps/student/src/routes/_auth/learn/quizzes/attempt/$attemptId.detail.tsx:12`,
     `apps/student/test/quiz-navigator.test.tsx:12`,
     `apps/student/test/quiz-review-item.test.tsx:11`,
     `apps/student/test/quiz-paper.test.tsx:9`.
4. Chạy gates (kể cả scoped e2e — extraction chạm luồng take/submit thật).

## Todo

- [ ] Move grade-quiz + quiz-parts vào packages/api/src/lib/
- [ ] Cutover import server + student (kể cả test files)
- [ ] Gates xanh

## Verification

```bash
pnpm check
pnpm check-types
pnpm --filter server test
pnpm --filter student test
E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 pnpm --filter e2e e2e -- specs/student-quiz-take-review.spec.ts
```

<!-- Updated: Red Team Session 1 — consumer list grep-verified đầy đủ (thêm quiz-question-item.tsx + 3 test file), thêm scoped e2e gate -->

## Risk Assessment

- **Thiếu chỗ nào quên cutover** → typecheck đỏ ngay (TS no unresolved path) —
  rủi ro thấp, phát hiện bằng `pnpm check-types`.
- **Comment/doc trong file nhắc đường dẫn cũ** — rà lại comment header sau move.

## Security Considerations

- Không thay đổi bề mặt dữ liệu — pure move; grading vẫn server-side khi submit
  thật (endpoint `/api/student/*` không đổi).

## Next Steps

→ Phase 2 move 6 render component về `@teacher-os/ui`.
