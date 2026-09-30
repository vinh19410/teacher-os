---
title: Teacher preview quiz take + review simulation
date: 2026-09-30
summary: "Issue #285: extract gradeQuiz/quiz-parts vào @teacher-os/api + 6 quiz renderer vào @teacher-os/ui (pure move, prop-hoá AttemptScoreCard action), thêm tab 'Làm thử & Soi bài' trên /assignments/preview chấm client-side bằng gradeQuiz với takeQuestions strip-key. 2 fresh-context reviewers -> 0 Critical / 3 Important (resolver type raw parity, normalize opts/pin mirror server, route-level leak pin) fixed với regression tests; 1145/110/427 unit + full e2e 108 xanh."
---

# Teacher preview quiz take + review simulation

Issue #285, plan `plans/260930-0801-teacher-quiz-preview-simulation/` (3 phase, 1 PR trọn plan theo precedent #284).

## What happened
- **Phase 1:** `gradeQuiz` + `quiz-parts` dời về `packages/api/src/lib/` — pure move, cutover 10 consumer import (server 2, student 8), không shim; test giữ ở app tiêu thụ theo precedent `format-schedule`.
- **Phase 2:** 6 quiz renderer dời về `packages/ui/src/components/quiz/` (import self-referencing theo convention package); `AttemptScoreCard` bỏ router Link + `attemptId`, nhận `action?: ReactNode` — route student compose `<Link className={cn(buttonVariants(), "mt-5")}>` giữ đúng variant default + spacing (RT#8); `QuizNavigator.verdicts` unify `Record<number, QuizVerdict>`; thư mục student còn đúng 3 file student-specific.
- **Phase 3:** tab "Đề bài" / "Làm thử & Soi bài" (component `Tabs` sẵn có) trên `/assignments/preview` cho đề auto-graded cả bank `?id=` lẫn draft sessionStorage: `assignment-quiz-sim.ts` (buildQuizSim strip-key takeQuestions + fullQuestions cho gradeQuiz, normalize malformed, resolver RAW), `use-quiz-simulation.ts` (state route-level, reset theo simKey bằng pattern set-state-trong-render), `preview-quiz-simulation.tsx` (take/review/Làm lại), render điều kiện đúng 1 tab trong DOM; ẩn textarea "Bài làm mô phỏng" cho đề auto-graded (Validation S1).
- **Gates:** `pnpm check`, `pnpm check-types`, web 1145 (24 test mới), student 110, server 427, full e2e 108 passed/1 skipped.

## Code review (2 fresh-context reviewer: correctness/regression + security/leak/contract)
- 0 Critical / 3 Important — cả 3 đã fix kèm regression test:
  1. **Resolver type resolve qua `typeOf().id` lệch công thức RAW của `StudentPreviewPaper`** — draft giữ type `mcq` sau khi đổi part trong composer (composer-transitions giữ type cũ, sessionStorage path không qua server validate) bị fallback `tfng` đổi pill + letter key "C" không chọn được → chấm sai mọi câu. Fix: dùng RAW `type ?? genre ?? "discuss"` nguyên văn như tab "Đề bài" và take student.
  2. **`normalizeQuestion` chưa mirror đủ `parseQuizQuestions`** — opts non-string crash render take ("Objects are not valid as a React child"), pin invalid-but-truthy tạo "câu chết" không widget (PinOverlay bỏ qua, choiceRows rỗng). Fix: filter opts string + `isValidPin` về null (câu fallback hàng cloze).
  3. **Leak contract chỉ pin bằng harness mirror, không phải route thật** — thêm test route-level (static `preview.test.tsx` mở rộng + jsdom `preview-sim-tab.test.tsx` mock router/data-store theo precedent settings.test) pin: đúng 1 tab trong DOM, take DOM sạch key, nộp → review, ẩn textarea auto-graded.
- Minor đã fix: bank simKey đổi từ `prompt.id` sang fingerprint nội dung `draftSimKey` (đề bank sửa ở nơi khác + kernel refresh cùng id không giữ grade stale); test attempt-summary pin className `cn(buttonVariants(), "mt-5")`; bỏ dead `useMemo([sim])`.
- Minor chấp nhận: `sim` (chứa fullQuestions + note) nằm trong props của take tree — plan pin contract ở mức DOM (KD5/RT#2), giáo viên là chủ key; width-oracle của tab "Đề bài" là known behavior từ #282 (RT#13 documented).

## Decision
- Resolver type: RAW parity với surface hiển thị > tự chế fallback "hợp lệ" — hai surface dùng cùng chuỗi type thì widget và grading luôn nhất quán.
- simKey: fingerprint nội dung cho cả bank lẫn draft — object identity không ổn định (draft map tạo object mới mỗi render), prompt.id không bắt được content change.
- Giữ test gradeQuiz ở `apps/server` theo precedent test-ở-consumer (packages/api không có vitest).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
