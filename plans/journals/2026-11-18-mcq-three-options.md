---
title: mcq-three-options
date: 2026-11-18
summary: "Support 3 or 4 options per MCQ question across API, server, UI editor, admin, web, and QuizPaper (#792)."
---

# mcq-three-options

## What happened
Implemented support for choosing 3 options (`A–C`) or 4 options (`A–D`, default 4) per `mcq` question across `@teacher-os/api`, `apps/server`, `@teacher-os/ui`, `apps/admin`, `apps/web`, and `apps/e2e` (#792), discovered during smoke testing Reading practice test #1 (`Step-IELTS-solving-traffic-problems-in-big-cities.json`).

## Decision
- Kept the single `mcq` type instead of duplicating a separate Reading type, adding a per-question `3 lựa chọn` / `4 lựa chọn` toggle in `AnswerKeyGrid` with automatic inheritance when adding a new row (`QuestionKeyEditor`).
- Enforced `effectiveAnswerChoices(kind, opts)` and `mcqOptionsIssue(kind, opts)` (2–4 options for `mcq4`, 2–3 for `mcq3`) consistently in `contracts.ts`, `library-contracts.ts` (both draft and ready), `apps/server/src/routes/assignments/index.ts`, `BulkKeyPaste`, `test-answer-key.ts`, and `composer-transitions.ts`.
- Adjusted `QuizPaper`'s `resolvePartInstruction` to surface `"Choose the correct letter A, B or C."` for homogeneous 3-option `mcq` parts and `"Choose the correct letter."` when 3- and 4-option questions are mixed.

## Verification
- `pnpm check` (0 errors), `pnpm check-types` (12/12 packages), `@teacher-os/api` (35 files), `@teacher-os/ui` (18 files), `apps/admin` (21 files), `apps/student` `quiz-paper.test.tsx` (45 tests), `apps/server` `admin-library.test.ts` + `assignments/` (61+ tests), `apps/web` composer/answer-key tests (125 tests), and `apps/e2e/specs/admin-library-reading.spec.ts` (3/3 passed).

## Next steps
- Ship beta PR to `develop`, run `/ak-review-pr --fix --reply`, merge and converge CI.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
