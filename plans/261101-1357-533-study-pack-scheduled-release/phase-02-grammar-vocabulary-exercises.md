---
phase: 2
title: "Phase 2: Dạng bài Grammar & Vocabulary tự chấm"
status: completed
priority: P1
effort: "4h"
dependencies: [1]
---

# Phase 2: Dạng bài Grammar & Vocabulary tự chấm

## Goal

Thêm hai kỹ năng `grammar` (`g1`: `mcq`, `gap`, `transform`) và `vocabulary` (`v1`: `mcq`, `match`, `gap`) vào ngân hàng đề (`assignment_prompt`), editor giáo viên, màn làm quiz học viên và lịch sử học tập học viên, tái dùng bộ chấm tự động `gradeQuiz` mà không đụng tới luồng chấm AI/credit hay Full Test Builder.

## Files

- Modify:
  - `packages/api/src/contracts.ts`
  - `packages/api/src/lib/infer-question-types.ts`
  - `packages/api/src/lib/grade-quiz.test.ts`
  - `packages/ui/src/components/assignments/editor/assignment-presets.ts`
  - `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`
  - `packages/ui/src/components/quiz/quiz-paper.tsx`
  - `packages/ui/src/components/assignments/cloze-stem.tsx`
  - `apps/server/src/routes/assignments/index.ts`
  - `apps/server/src/routes/student-history.ts`
  - `apps/server/src/assignment-rich-text-contract.test.ts`
  - `apps/web/src/routes/_auth/assignments/new.tsx`
  - `apps/web/src/routes/_auth/assignments/index.tsx`
  - `apps/web/src/components/assignments/prompt-composer.tsx`
  - `apps/web/src/components/assignments/composer-transitions.ts`
  - `apps/web/src/components/assignments/student-preview-paper.tsx`
  - `apps/web/src/components/assignments/create-success-card.tsx`
  - `apps/student/src/components/history/history-skill-labels.ts`
  - `apps/student/src/routes/_auth/assignments/index.tsx`

## Tasks

### Task 2.1 — Mở rộng `ASSIGNMENT_SKILLS`, `HISTORY_SKILLS` và các map kỹ năng trong `packages/api`
- **Goal:** `packages/api` hỗ trợ tạo và chấm đề `grammar` & `vocabulary` trong khi giữ nguyên `PRACTICE_SKILLS` và `assignmentTestCreateSchema` cho 4 kỹ năng IELTS.
- **Target files:**
  - `packages/api/src/contracts.ts`
  - `packages/api/src/lib/infer-question-types.ts`
  - `packages/api/src/lib/grade-quiz.test.ts`
- **Steps:**
  1. Trong `packages/api/src/contracts.ts`:
     - Cập nhật `ASSIGNMENT_SKILLS = ["writing", "reading", "listening", "speaking", "grammar", "vocabulary"] as const`.
     - Trong `ASSIGNMENT_PART_TYPES`: thêm `grammar: { parts: ["g1"], types: { g1: ["mcq", "gap", "transform"] } }` và `vocabulary: { parts: ["v1"], types: { v1: ["mcq", "match", "gap"] } }`.
     - Trong `ASSIGNMENT_TEST_PRESETS`: thêm `grammar: { slots: [{ part: "g1", label: "Grammar" }] }` và `vocabulary: { slots: [{ part: "v1", label: "Vocabulary" }] }`, đồng thời đổi `assignmentTestCreateSchema` (`~990`) sang `skill: z.enum(PRACTICE_SKILLS)` để Full Test không nhận `grammar`/`vocabulary`.
     - Trong `answerKindByType`: thêm `match: "letter"`, `gap: "text"`, `transform: "text"`.
     - Trong `ASSIGNMENT_OPTION_BANK_TYPES`: thêm `grammar: [], vocabulary: ["match"]`.
     - Trong `ASSIGNMENT_IMAGE_BASED_TYPES`: thêm `grammar: [], vocabulary: []`.
     - Trong `QUIZ_TYPE_DISPLAY`: thêm hiển thị cho `match`, `gap`, `transform`.
     - Trong `assignmentPromptBaseSchema.superRefine`: đặt `const auto = value.skill === "reading" || value.skill === "listening" || value.skill === "grammar" || value.skill === "vocabulary"`; với `grammar` và `vocabulary`, không bắt buộc `passage` (cho phép rỗng), bắt buộc `value.questions.length >= 1 && value.questions.some((q) => q.stem.trim())`, và khi `status === "ready"` mọi câu hỏi phải có `stem.trim()` & `answer.trim()` (riêng `gap` yêu cầu `countBlanks(q.stem) === 1`).
     - Giữ `HISTORY_SKILLS = [...PRACTICE_SKILLS, "vocabulary"] as const` (5 kỹ năng) và `CLOZE_EDITOR_TYPES` (8 loại IELTS completion).
  2. Trong `packages/ui/src/components/assignments/editor/question-key-editor.tsx`: bật `showClozeEditor` cho `typeId === "gap"`.
  3. Thêm unit test trong `packages/api/src/lib/grade-quiz.test.ts` kiểm chứng chấm điểm cho các câu `mcq`, `gap`, `transform`, `match` (bao gồm chuẩn hoá khoảng trắng/hoa thường và `alts`) và contract validation cho `grammar`/`vocabulary`.
- **Success criteria:** Contract nhận đề `grammar`/`vocabulary` hợp lệ, từ chối `writing`/`speaking` có `questions`, từ chối `assignment_test` với `grammar`/`vocabulary`, và `gradeQuiz` chấm đúng cả 4 dạng câu hỏi.
- **Verify:** `pnpm --filter @teacher-os/api test` exits 0.

### Task 2.2 — Cập nhật `packages/ui` (`assignment-presets.ts`, `quiz-paper.tsx`, `cloze-stem.tsx`)
- **Goal:** Editor và màn làm bài quiz render đúng câu hỏi `grammar`/`vocabulary` (kể cả câu `transform` không có `____` và đề không có `passage`).
- **Target files:**
  - `packages/ui/src/components/assignments/editor/assignment-presets.ts`
  - `packages/ui/src/components/assignments/editor/assignment-presets.test.ts`
  - `packages/ui/src/components/quiz/quiz-paper.tsx`
  - `packages/ui/src/components/assignments/cloze-stem.tsx`
- **Steps:**
  1. Trong `assignment-presets.ts`:
     - Thêm `match: "letter"`, `gap: "text"`, `transform: "text"` vào `KIND`.
     - Thêm preset `grammar` (`id: "grammar"`, `label: "Grammar"`, part `g1`, types `mcq`, `gap`, `transform`) và `vocabulary` (`id: "vocabulary"`, `label: "Vocabulary"`, part `v1`, types `mcq`, `match`, `gap`) vào `SKILLS`.
     - Cập nhật `isAutoSkill(skillId)` trả về `true` cho `"reading" | "listening" | "grammar" | "vocabulary"`.
     - Cập nhật `assignment-presets.test.ts` khớp 6 kỹ năng trong `SKILLS`.
  2. Trong `cloze-stem.tsx`: khi `interactive` là `true` và `countBlanks(stem) === 0` (ví dụ câu `transform` viết lại câu không chứa `____`), render `{stem}` kèm `blankInput` ngay phía sau để học viên luôn có ô `<input>` nhập đáp án.
  3. Trong `quiz-paper.tsx`:
     - Thêm `grammar: "Grammar"` và `vocabulary: "Vocabulary"` vào `SKILL_LABELS`.
     - Cập nhật `isAuto` bao gồm `"grammar"` và `"vocabulary"`.
     - Khi `skill === "grammar" || skill === "vocabulary"` và `detail.passage` rỗng (`isEmptyRichText(detail.passage)`), không hiển thị cột passage trống để phần câu hỏi hiển thị gọn gàng.
- **Success criteria:** `QuizPaper` và `assignment-presets` hỗ trợ đầy đủ `grammar` & `vocabulary`, câu `transform` không có `____` vẫn render `<input>` tương tác.
- **Verify:** `pnpm --filter @teacher-os/ui test` (hoặc `pnpm --filter web test -- cloze-stem`) exits 0.

### Task 2.3 — Cập nhật route server (`assignments/index.ts`, `student-history.ts`) và UI (`apps/web`, `apps/student`)
- **Goal:** Giáo viên tạo/sửa/lọc được đề `grammar` & `vocabulary` trên web; học viên làm bài, nộp bài được chấm điểm ngay và xem được trong lịch sử mà không lỗi.
- **Target files:**
  - `apps/server/src/routes/assignments/index.ts`
  - `apps/server/src/routes/student-history.ts`
  - `apps/server/src/assignment-rich-text-contract.test.ts`
  - `apps/web/src/routes/_auth/assignments/new.tsx`
  - `apps/web/src/routes/_auth/assignments/index.tsx`
  - `apps/web/src/components/assignments/prompt-composer.tsx`
  - `apps/web/src/components/assignments/composer-transitions.ts`
  - `apps/web/src/components/assignments/student-preview-paper.tsx`
  - `apps/web/src/components/assignments/create-success-card.tsx`
  - `apps/student/src/components/history/history-skill-labels.ts`
  - `apps/student/src/routes/_auth/assignments/index.tsx`
- **Steps:**
  1. Trong `apps/server/src/routes/assignments/index.ts:217-224` (`PATCH /prompts/:id`): cho phép cập nhật `questions` khi `row.skill` thuộc `["reading", "listening", "grammar", "vocabulary"]`.
  2. Trong `apps/server/src/routes/student-history.ts`: lọc `inArray(assignmentPrompt.skill, [...HISTORY_SKILLS])` trong `attemptRows` để giữ nguyên hợp đồng 5 dòng của `HISTORY_SKILLS`.
  3. Trong `packages/ui/src/components/quiz/quiz-paper.tsx`: thêm nhãn cho `grammar` và `vocabulary`.
  4. Trong `apps/web/src/routes/_auth/assignments/new.tsx`, `index.tsx`, `prompt-composer.tsx`, `composer-transitions.ts`, `student-preview-paper.tsx`, `create-success-card.tsx`:
     - Cập nhật `hasCoreContent` trong `new.tsx` để `grammar` và `vocabulary` kiểm tra `value.questions.some((q) => q.stem.trim().length > 0)`.
     - Trong `composer-transitions.ts`, bắt buộc `countBlanks(stem) === 1` cho `gap` khi xuất bản `ready`.
     - Thêm chip lọc `Grammar` và `Vocabulary` trong `assignments/index.tsx`.
  5. Bổ sung test server và web cho tạo/chấm đề `grammar` & `vocabulary` và lịch sử học viên.
- **Success criteria:** Tạo đề `grammar`/`vocabulary` `ready` thành công, học viên nộp bài được tự chấm điểm ngay (không vào hàng chờ chấm tay), trang `/history` của học viên hiển thị đúng.
- **Verify:** `pnpm --filter server test -- assignment-rich-text-contract student-history` exits 0, `pnpm --filter web test -- assignments` exits 0, `pnpm --filter student test` exits 0, and `pnpm check-types` exits 0.

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
