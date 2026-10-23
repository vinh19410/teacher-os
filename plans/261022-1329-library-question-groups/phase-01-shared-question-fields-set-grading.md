---
phase: 1
title: "Trường câu hỏi dùng chung + chấm theo tập (PR1)"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Trường câu hỏi dùng chung + chấm theo tập (PR1)

## Goal

`assignmentQuestionSchema` nhận thêm hai trường optional (`explanation`, `answerSet`) mà không đổi output shape của câu cũ, và `gradeQuiz` chấm các câu cùng `answerSet` như một tập không thứ tự. Phase này là một PR riêng vào `develop`.

## Files to Create / Modify

- Modify: `packages/api/src/contracts.ts` (const `assignmentQuestionSchema`, ~dòng 600)
- Modify: `packages/api/src/lib/grade-quiz.ts` (function `gradeQuiz`)
- Modify: `apps/server/src/lib/grade-quiz.test.ts` (thêm `describe` mới)
- Modify: `packages/api/src/library-contracts.test.ts` (thêm test schema câu)

## Bối cảnh executor cần biết

- `assignmentQuestionSchema` là MỘT nguồn sự thật cho cả `assignment_prompt` (web giáo viên) lẫn `library_test_part` (admin). Nó `.strict()`: field lạ → 400.
- **Không dùng `.default(...)`** cho trường mới. Nếu thêm default, mọi câu cũ sau parse sẽ có thêm key, làm dirty-check canonical của web composer lệch. Dùng `.optional()` / `.nullish()`.
- `gradeQuiz(questions, answers)` đọc `answers[String(index)]`. Không đổi chữ ký hàm.

## Tasks & Steps

### Task 1.1 — Thêm `explanation` và `answerSet` vào schema câu

- Goal: payload câu có `explanation` (rich text) và/hoặc `answerSet` parse thành công; payload thiếu hai field parse ra object KHÔNG có hai key đó.
- Target: `packages/api/src/contracts.ts`, object trong `assignmentQuestionSchema`.
- Steps:
  1. Mở `packages/api/src/contracts.ts`, tìm `export const assignmentQuestionSchema = z`.
  2. Kiểm tra `richTextField` đã được import trong file (grep `richTextField` ở đầu file). Nếu chưa, thêm vào import từ `"./rich-text"`.
  3. Ngay sau field `pin`, thêm:
     ```ts
     /**
      * Giải thích đáp án (rich text) hiển thị sau khi nộp — tương ứng
      * "Feedback" của từng đáp án bên Selfomy. Optional, KHÔNG default để
      * câu cũ giữ nguyên shape.
      */
     explanation: richTextField(2000).optional(),
     /**
      * Khóa tập đáp án không thứ tự (IELTS "Choose TWO"): các câu cùng
      * khóa trong một snapshot được chấm như một tập — đáp án đúng ở câu
      * này được chấp nhận ở câu kia. Null/absent = chấm theo vị trí.
      */
     answerSet: z.string().trim().min(1).max(20).nullish(),
     ```
  4. Không sửa chỗ nào khác của schema.
- Success criteria: TypeScript type `AssignmentQuestion` có `explanation?: string` và `answerSet?: string | null`.
- Verify: `pnpm --filter @teacher-os/api check-types` exits 0.

### Task 1.2 — Test schema câu

- Goal: có test chứng minh field mới optional và field lạ vẫn bị từ chối.
- Target: tạo file mới `packages/api/src/assignment-question-schema.test.ts` (schema thuộc `contracts.ts`, không thuộc thư viện) với `describe("assignmentQuestionSchema — explanation/answerSet", ...)`; `import { assignmentQuestionSchema } from "./contracts"` và `import { describe, expect, test } from "vitest"`.
- Steps: viết 4 test:
  1. `{stem:"a", answer:"b"}` parse ok và `Object.keys(result)` KHÔNG chứa `"explanation"` lẫn `"answerSet"`.
  2. `{stem:"a", answer:"b", explanation:"<p>vì…</p>", answerSet:"q21-22"}` parse ok, giữ nguyên hai giá trị.
  3. `answerSet: ""` bị từ chối (`success === false`).
  4. `{stem:"a", answer:"b", feedback:"x"}` bị từ chối (strict).
- Verify: `pnpm --filter @teacher-os/api test assignment-question-schema --reporter=verbose` exits 0 và output chứa `explanation/answerSet`.

### Task 1.3 — Grader chấm theo tập

- Goal: các câu cùng `answerSet` chấm không thứ tự; câu không có `answerSet` chấm y như cũ.
- Target: `packages/api/src/lib/grade-quiz.ts`, function `gradeQuiz`.
- Steps:
  1. Giữ nguyên `normalize`, `acceptedCandidates`, `isAcceptedAnswer`.
  2. Viết lại thân `gradeQuiz` như sau (logic, không đổi chữ ký):
     - Tạo `verdicts: QuizVerdict[]` cùng độ dài `questions`.
     - Duyệt index `i`: nếu `questions[i].answerSet` rỗng/null → verdict tính như code cũ.
     - Gom các index có cùng `answerSet` thành nhóm (Map key → mảng index, theo thứ tự index tăng dần).
     - Với mỗi nhóm: `used = new Set<number>()` (index câu-khóa đã khớp). Duyệt từng index `i` trong nhóm theo thứ tự tăng: `given = normalize(answers[String(i)] ?? "")`; rỗng → `skipped`; ngược lại tìm index `k` đầu tiên trong nhóm, `k ∉ used`, mà `acceptedCandidates(questions[k].answer, questions[k].alts).includes(given)` → `correct`, `used.add(k)`; không tìm thấy → `wrong`.
  3. Cập nhật doc comment của `gradeQuiz`: thêm một đoạn mô tả nhánh `answerSet` (khớp tham lam theo thứ tự index; một đáp án chỉ được tính một lần).
  4. `correctCount/wrongCount/skippedCount/totalCount` giữ cách tính cũ.
- Success criteria: test cũ không phải sửa.
- Verify: no verification needed (Task 1.4 kiểm).

### Task 1.4 — Test grader cho `answerSet`

- Goal: phủ các ca của nhánh tập.
- Target: `apps/server/src/lib/grade-quiz.test.ts`, thêm `describe("gradeQuiz — answerSet (Choose TWO)", ...)` dùng helper `q()` sẵn có.
- Steps: viết các test:
  1. Hai câu `answerSet:"s"`, key `B`,`D`; học viên trả `{"0":"D","1":"B"}` → `["correct","correct"]`.
  2. Cùng key; trả `{"0":"B","1":"B"}` → `["correct","wrong"]` (một đáp án không tính hai lần).
  3. Trả `{"0":"D"}` → `["correct","skipped"]`.
  4. Trộn: câu 0 không set (key `Paris`), câu 1–2 set `"s"` (key `B`,`D`); trả `{"0":"Paris","1":"D","2":"B"}` → cả ba `correct`, `correctCount === 3`.
  5. Hai tập khác khóa (`"s1"`, `"s2"`) không lẫn đáp án sang nhau.
- Verify: `pnpm --filter server test grade-quiz --reporter=verbose` exits 0; output có `answerSet (Choose TWO)` và không có `FAIL`.

### Task 1.5 — Gate toàn repo cho PR1

- Goal: PR1 sạch lint/type/test.
- Steps:
  1. `pnpm check` — nếu fail vì format, chạy `pnpm check:fix` rồi chạy lại `pnpm check`.
  2. `pnpm check-types`.
  3. `pnpm test`.
  4. PR1 sửa grader và schema câu dùng chung cho cả web giáo viên, nên trước khi squash-merge vào `develop` phải chạy **toàn bộ** Playwright suite ở local (không chỉ spec admin): `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e`. Nếu `develop` đã có commit mới trong lúc làm, merge `develop` vào nhánh rồi chạy lại.
- Verify: lệnh 1–3 exit 0; lệnh 4 exit 0 và output không có `failed`.

## Failure Protocol

If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
