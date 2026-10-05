---
phase: 1
title: "Contract + DB + hàm band dùng chung"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Contract + DB + hàm band dùng chung

## Goal
Có sẵn hàm `ieltsOverallBand`, các schema zod cho điểm/nhận xét/bài nộp phía giáo viên, field `grade` optional trên summary học viên, type snapshot mở rộng, và migration 0033 thêm 3 cột chấm điểm vào `quiz_attempt`.

## Files to Create / Modify
- Create: `packages/api/src/lib/ielts-band.ts`
- Create: `packages/api/src/lib/ielts-band.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Modify: `packages/db/src/schema/quiz-attempt.ts`
- Create (generated): `packages/db/src/migrations/0033_<tên drizzle tự sinh>.sql` + file meta snapshot/journal do drizzle-kit sinh

## Tasks

### Task 1.1 — Hàm band thuần `ieltsOverallBand` + bộ tiêu chí
- **Goal:** một nguồn duy nhất cho key tiêu chí theo skill, nhãn hiển thị, validate bước 0.5 và làm tròn band IELTS.
- **Target files and symbols:** `packages/api/src/lib/ielts-band.ts` (mới), export:
  - `WRITING_CRITERIA = ["task", "coherence", "lexical", "grammar"] as const`
  - `SPEAKING_CRITERIA = ["fluency", "lexical", "grammar", "pronunciation"] as const`
  - `GRADABLE_SKILLS = ["writing", "speaking"] as const`, `type GradableSkill`
  - `isGradableSkill(skill: string): skill is GradableSkill`
  - `criteriaForSkill(skill: GradableSkill): readonly string[]`
  - `criterionLabel(skill: GradableSkill, key: string, part: string): string`
  - `isBandStep(value: number): boolean`
  - `ieltsOverallBand(scores: readonly number[]): number`
  - `formatBand(band: number): string` — `band.toFixed(1)` (IELTS hiển thị `7.0`, `6.5`)
- **Steps:**
  1. Tạo file với các export trên. File không import gì ngoài TypeScript thuần, vì package này compile cho cả workerd lẫn browser.
  2. `criterionLabel` trả nhãn sau:
     - Writing: `task` là `"Task Achievement"` khi `part === "task1"`, còn lại là `"Task Response"`; `coherence` là `"Coherence & Cohesion"`; `lexical` là `"Lexical Resource"`; `grammar` là `"Grammatical Range & Accuracy"`.
     - Speaking: `fluency` là `"Fluency & Coherence"`; `lexical` là `"Lexical Resource"`; `grammar` là `"Grammatical Range & Accuracy"`; `pronunciation` là `"Pronunciation"`.
     - Key lạ: trả về chính key đó.
  3. `isBandStep(v)` trả `Number.isFinite(v) && v >= 0 && v <= 9 && Number.isInteger(v * 2)`.
  4. `ieltsOverallBand(scores)`:
     - mảng rỗng thì throw `Error("no scores")`;
     - còn lại `const avg = sum / scores.length; return Math.round(avg * 2) / 2;`.
  5. Viết JSDoc 1–2 dòng cho `ieltsOverallBand`, ghi quy ước làm tròn IELTS: `.25` lên `.5`, `.75` lên số nguyên kế.
- **Success criteria:** file tồn tại, export đủ 9 symbol trên.
- **Verify:** no verification needed (Task 1.2 test bao trùm).

### Task 1.2 — Unit test `ielts-band.test.ts`
- **Goal:** khoá quy ước làm tròn và validate bước 0.5.
- **Target files:** `packages/api/src/lib/ielts-band.test.ts` (mới). Theo mẫu `word-count.test.ts` cùng thư mục (vitest `describe/it/expect`).
- **Steps:** viết các case sau:
  1. `ieltsOverallBand([6, 6.5, 6, 6.5])` (avg 6.25) → `6.5`.
  2. `ieltsOverallBand([7, 7, 7, 8])` (avg 7.25) → `7.5`.
  3. `ieltsOverallBand([6.5, 7, 7, 7])` (avg 6.875) → `7`.
  4. `ieltsOverallBand([6, 6, 6, 6.5])` (avg 6.125) → `6`.
  5. `ieltsOverallBand([6.5, 6.5, 7, 7])` (avg 6.75) → `7`.
  6. `ieltsOverallBand([0, 0, 0, 0])` → `0`; `ieltsOverallBand([9, 9, 9, 9])` → `9`.
  7. `ieltsOverallBand([])` throw.
  8. `isBandStep`: `true` với `0`, `5.5`, `9`; `false` với `-0.5`, `9.5`, `6.25`, `NaN`, `Infinity`.
  9. `criterionLabel("writing", "task", "task1")` là `"Task Achievement"`; với `"task2"` là `"Task Response"`; `criterionLabel("speaking", "pronunciation", "part2")` là `"Pronunciation"`.
  10. `isGradableSkill("reading")` là `false`; `isGradableSkill("speaking")` là `true`.
  11. `formatBand(7)` là `"7.0"`; `formatBand(6.5)` là `"6.5"`.
- **Success criteria:** mọi case pass.
- **Verify:** `pnpm --filter @teacher-os/api test -- ielts-band` exits 0 và output chứa `ielts-band.test.ts` cùng `passed`, không có `failed`.

### Task 1.3 — Schema zod trong `contracts.ts`
- **Goal:** contract cho input chấm, output điểm, payload trang chấm, field `grade` của summary, và type snapshot mở rộng.
- **Target files and symbols:** `packages/api/src/contracts.ts`
  - đặt ngay sau `quizAttemptMediaSchema` (khoảng dòng 1732–1741): `QUIZ_FEEDBACK_MAX`, `bandScoreSchema`, `writingGradeScoresSchema`, `speakingGradeScoresSchema`, `quizGradeInputSchema`, `quizAttemptGradeSchema`, `teacherSubmissionSchema`;
  - `quizAttemptSummarySchema` (khoảng dòng 1851): thêm field `grade`;
  - `KernelClassAssignmentRow` (khoảng dòng 1342): mở rộng `targets`.
- **Steps:**
  1. Ở đầu file, ngay sau dòng 2 (`import { isEmptyRichText, richTextField } from "./rich-text";`), thêm `import { isBandStep } from "./lib/ielts-band";`.
  2. Thêm khối sau ngay sau `export type QuizAttemptMedia = …`:
     ```ts
     /** Nhận xét giáo viên cho bài Writing/Speaking — plain text. */
     export const QUIZ_FEEDBACK_MAX = 5000;
     /** Điểm một tiêu chí IELTS: 0–9, bước 0.5. */
     export const bandScoreSchema = z.number().refine(isBandStep, "band step 0.5 in 0..9");
     export const writingGradeScoresSchema = z.object({
       task: bandScoreSchema, coherence: bandScoreSchema,
       lexical: bandScoreSchema, grammar: bandScoreSchema,
     }).strict();
     export const speakingGradeScoresSchema = z.object({
       fluency: bandScoreSchema, lexical: bandScoreSchema,
       grammar: bandScoreSchema, pronunciation: bandScoreSchema,
     }).strict();
     /** POST /api/grading/:attemptId/grade — scores validate theo skill ở server. */
     export const quizGradeInputSchema = z.object({
       scores: z.record(z.string(), z.number()),
       feedback: z.string().max(QUIZ_FEEDBACK_MAX),
     }).strict();
     export type QuizGradeInput = z.infer<typeof quizGradeInputSchema>;
     /** Điểm đã chấm — band luôn derive từ scores (ieltsOverallBand). */
     export const quizAttemptGradeSchema = z.object({
       scores: z.record(z.string(), z.number()),
       band: z.number(),
       feedback: z.string(),
       /** ISO datetime lần lưu gần nhất. */
       gradedAt: z.string(),
     }).strict();
     export type QuizAttemptGrade = z.infer<typeof quizAttemptGradeSchema>;
     ```
  3. Ngay sau đó thêm `teacherSubmissionSchema` + type `TeacherSubmission`:
     ```ts
     /** GET /api/grading/:attemptId — bài nộp Writing/Speaking cho giáo viên chấm. */
     export const teacherSubmissionSchema = z.object({
       attemptId: z.string(),
       classAssignmentId: z.string(),
       classId: z.string(),
       className: z.string(),
       title: z.string(),
       due: z.string(),
       student: z.object({ id: z.string(), name: z.string() }).strict(),
       skill: z.enum(["writing", "speaking"]),
       part: z.string(),
       prompt: z.object({
         prompt: z.string(), imageUrl: z.string(), cueTopic: z.string(),
         cuePoints: z.string(), note: z.string(),
       }).strict(),
       startedAt: z.string(),
       submittedAt: z.string(),
       essay: z.string().nullable(),
       media: quizAttemptMediaSchema.nullable(),
       grade: quizAttemptGradeSchema.nullable(),
     }).strict();
     export type TeacherSubmission = z.infer<typeof teacherSubmissionSchema>;
     ```
     `teacherSubmissionSchema` phải đặt SAU `quizAttemptGradeSchema` và `quizAttemptMediaSchema`, vì nó tham chiếu cả hai.
  4. Trong `quizAttemptSummarySchema`, thêm field cuối, trước `})` và `.strict()`:
     ```ts
     /** Điểm giáo viên chấm (Writing/Speaking). Server CHỈ gửi key khi đã
      * chấm — bundle cũ (strict) chỉ lỗi parse ở attempt đã chấm. */
     grade: quizAttemptGradeSchema.nullable().optional(),
     /** Part của đề (task1/task2/part1…) — server CHỈ gửi kèm `grade`, để
      * nhãn tiêu chí Writing đúng TA/TR; cùng lý do strict ở trên. */
     part: z.string().optional(),
     ```
     `quizAttemptGradeSchema` phải được khai báo TRƯỚC `quizAttemptSummarySchema`. Bước 2 đặt nó ở dòng khoảng 1742, trước 1851, nên đúng thứ tự.
  5. Trong `KernelClassAssignmentRow`, đổi `targets` thành:
     ```ts
     targets: Array<{
       studentId: string;
       submittedAt: string | null;
       /** Attempt đã nộp (status submitted) — null khi chưa nộp/chưa có attempt. */
       attemptId: string | null;
       /** ISO datetime lần chấm gần nhất — null khi chưa chấm. */
       gradedAt: string | null;
       /** Band tổng (ieltsOverallBand) — null khi chưa chấm. */
       band: number | null;
     }>;
     ```
- **Success criteria:** `contracts.ts` export `QUIZ_FEEDBACK_MAX`, `bandScoreSchema`, `writingGradeScoresSchema`, `speakingGradeScoresSchema`, `quizGradeInputSchema`, `quizAttemptGradeSchema`, `teacherSubmissionSchema` và các type tương ứng.
- **Verify:** `pnpm --filter @teacher-os/api check-types` exits 0. Lưu ý: server/web sẽ còn lỗi type ở chỗ dựng `targets`; các lỗi đó được sửa ở Phase 2/3, đừng sửa trong phase này.

### Task 1.4 — Cột DB + migration 0033
- **Goal:** `quiz_attempt` có `grade_scores`, `grade_feedback`, `graded_at`.
- **Target files and symbols:** `packages/db/src/schema/quiz-attempt.ts` (`quizAttempt`).
- **Steps:**
  1. Thêm 3 cột sau cột `correctCount`. Dùng kiểu JSON tổng quát `Record<string, number>`, không dùng `AssignmentScores` của bảng legacy:
     ```ts
     /** Điểm giáo viên chấm Writing/Speaking: JSON `{criterion: band}`;
      * null = chưa chấm. Band tổng derive (ieltsOverallBand), không lưu. */
     gradeScores: text("grade_scores", { mode: "json" }).$type<Record<string, number> | null>(),
     gradeFeedback: text("grade_feedback").notNull().default(""),
     gradedAt: integer("graded_at", { mode: "timestamp_ms" }),
     ```
  2. Bổ sung câu cuối vào JSDoc đầu bảng: "`grade_*` là điểm + nhận xét giáo viên chấm bài Writing/Speaking; lưu là ghi đè (học viên thấy ngay)."
  3. Chạy `pnpm db:generate` ở root repo. Drizzle-kit sinh `packages/db/src/migrations/0033_<tên>.sql` và cập nhật `meta/_journal.json` + `meta/0033_snapshot.json`.
  4. Mở file `.sql` vừa sinh và xác nhận nó chỉ có đúng 3 câu `ALTER TABLE \`quiz_attempt\` ADD …`, không có `DROP` hay tạo lại bảng.
  5. Chèn header comment vào đầu file `0033_*.sql`, theo precedent `0028_salty_purifiers.sql:1-4`:
     ```sql
     -- Điểm giáo viên chấm bài Writing/Speaking (quiz_attempt.grade_*).
     -- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
     -- snapshot giáo viên và summary học viên select cột grade_*, thiếu cột thì
     -- mọi trang giáo viên và màn kết quả học viên trả 500 (/readyz không kiểm cột).
     ```
     Câu chữ header KHÔNG được chứa từ "drop", vì Verify bên dưới đếm từ đó. <!-- Updated: Red Team 2026-10-05 -->
- **Success criteria:** file `0033_*.sql` tồn tại với đúng 3 câu `ALTER TABLE` ADD và có header DEPLOY ORDER.
- **Verify:**
  - `ls packages/db/src/migrations/0033_*.sql` in ra đúng 1 file.
  - `grep -c "ALTER TABLE \`quiz_attempt\` ADD" packages/db/src/migrations/0033_*.sql` in ra `3`.
  - `grep -ci "drop\|__new_" packages/db/src/migrations/0033_*.sql` in ra `0`.
  - `grep -c "DEPLOY ORDER" packages/db/src/migrations/0033_*.sql` in ra `1`.

### Task 1.5 — Gate phase
- **Goal:** package api xanh. Server vẫn chạy migration được.
- **Steps:**
  1. Chạy `pnpm --filter @teacher-os/api test`.
  2. Chạy `pnpm --filter server test -- student-quiz-media`. Test này migrate DB in-memory từ thư mục migrations, nên 0033 phải apply sạch.
- **Success criteria:** cả hai lệnh pass.
- **Verify:**
  - `pnpm --filter @teacher-os/api test` exits 0.
  - `pnpm --filter server test -- student-quiz-media` exits 0. Nếu lỗi chỉ là **type** ở `snapshot.ts` thì vitest không typecheck nên vẫn pass. Lỗi runtime migration thì là fail thật.

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
