---
phase: 1
title: "Phase 1: Schema, Contracts & Shared Helpers"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Schema, Contracts & Shared Helpers

<!-- Updated: Red-Team & Validation Session 1 - split write/read writing schemas, optional writing on prompt create, historyEntrySchema.hasWriting -->

## Goal
Bổ sung 3 cột phần Writing đính kèm vào bảng `assignment_prompt` (kèm Drizzle migration 0062), hàm thuần dùng chung `essayTaskOf` / `hasGradableTask` / `isAutoGradableSkill` trong `@teacher-os/api/lib/ielts-band`, và mở rộng các Zod contract / TypeScript interface trong `@teacher-os/api/contracts` (tách write schema với wire read schema, giữ `AssignmentPromptCreate` tương thích ngược 100% để `pnpm check-types` xanh ngay cuối Phase 1).

## Files to Create / Modify
- Modify: `packages/api/src/lib/ielts-band.ts`
- Modify: `packages/api/src/lib/ielts-band.test.ts`
- Modify: `packages/api/src/contracts.ts`
- Create: `packages/api/src/hybrid-writing.contracts.test.ts`
- Modify: `packages/db/src/schema/assignment-prompt.ts`
- Create (generated): `packages/db/src/migrations/0062_<tag>.sql` + cập nhật `packages/db/src/migrations/meta/_journal.json` & `0062_snapshot.json` qua `drizzle-kit generate`

## Tasks

### Task 1.1 — TDD Red: Viết unit test cho `isAutoGradableSkill`, `essayTaskOf` và `hasGradableTask`
- **Goal:** Khoá hành vi phân giải phần tự chấm và phần Writing chấm tay cho cả đề đơn kỹ năng lẫn đề gộp trước khi viết code.
- **Target files and symbols:** `packages/api/src/lib/ielts-band.test.ts` (thêm `describe("essayTaskOf & hasGradableTask", ...)`).
- **Steps:**
  1. Import `essayTaskOf`, `hasGradableTask`, `isAutoGradableSkill` từ `./ielts-band`.
  2. Thêm các test case:
     - `isAutoGradableSkill`: trả `true` cho `"reading"`, `"listening"`, `"grammar"`, `"vocabulary"`; `false` cho `"writing"`, `"speaking"`, `""`.
     - Đề Writing thuần (`{ skill: "writing", part: "task2", prompt: "<p>Discuss</p>", writingPart: null, writingPrompt: "" }`) → `essayTaskOf` trả `{ skill: "writing", part: "task2", prompt: "<p>Discuss</p>", hybrid: false }`, `hasGradableTask` trả `true`.
     - Đề Speaking thuần (`{ skill: "speaking", part: "part2", prompt: "" }`) → `essayTaskOf` trả `null`, `hasGradableTask` trả `true`.
     - Đề Reading thuần (`{ skill: "reading", part: "p1", prompt: "", writingPart: null }`) → `essayTaskOf` trả `null`, `hasGradableTask` trả `false`.
     - Đề gộp Grammar + Writing phẳng (`{ skill: "grammar", part: "g1", prompt: "", writingPart: "task1", writingPrompt: "<p>Chart</p>" }`) và nested (`{ skill: "reading", part: "p1", prompt: "", writing: { part: "task2", type: "discuss", prompt: "<p>Essay</p>" } }`) → `essayTaskOf` trả `{ skill: "writing", part: "task1" | "task2", prompt: ..., hybrid: true }`, `hasGradableTask` trả `true`.
     - Tóm tắt danh sách học viên (`{ skill: "vocabulary", hasWriting: true }`) → `hasGradableTask` trả `true`.
     - Dữ liệu phòng thủ: `{ skill: "speaking", writingPart: "task2", writingPrompt: "<p>x</p>" }` → `essayTaskOf` trả `null`.
- **Success criteria:** Test chạy và fail vì chưa export các hàm mới (Red phase).
- **Verify:** `pnpm --filter @teacher-os/api test -- ielts-band` exits non-zero vì thiếu export `essayTaskOf` / `hasGradableTask` / `isAutoGradableSkill`.

### Task 1.2 — TDD Green: Hiện thực `isAutoGradableSkill`, `essayTaskOf`, `hasGradableTask` trong `ielts-band.ts`
- **Goal:** Cung cấp một nguồn chân lý duy nhất không phụ thuộc runtime cho server, web và student khi kiểm tra đề có phần Writing hay cần chấm tay.
- **Target files and symbols:** `packages/api/src/lib/ielts-band.ts` (`AUTO_GRADABLE_SKILLS`, `AutoGradableSkill`, `isAutoGradableSkill`, `EssayTaskDescriptor`, `PromptGradableSource`, `essayTaskOf`, `hasGradableTask`).
- **Steps:**
  1. Khai báo `export const AUTO_GRADABLE_SKILLS = ["reading", "listening", "grammar", "vocabulary"] as const;` và `export type AutoGradableSkill = (typeof AUTO_GRADABLE_SKILLS)[number];`.
  2. Export `isAutoGradableSkill(skill: string): skill is AutoGradableSkill`.
  3. Khai báo `PromptGradableSource`:
     ```ts
     export interface PromptGradableSource {
     	skill?: string | null;
     	part?: string | null;
     	prompt?: string | null;
     	writingPart?: string | null;
     	writingPrompt?: string | null;
     	writing?: { part: string; prompt: string } | null;
     	hasWriting?: boolean;
     }
     ```
  4. Hiện thực `essayTaskOf(source: PromptGradableSource): { skill: "writing"; part: string; prompt: string; hybrid: boolean } | null`:
     - Nếu `source.skill === "writing"` → trả `{ skill: "writing", part: source.part ?? "", prompt: source.prompt ?? "", hybrid: false }`.
     - Nếu `isAutoGradableSkill(source.skill ?? "")`: lấy `wPart = (source.writing?.part ?? source.writingPart ?? "").trim()` và `wPrompt = source.writing?.prompt ?? source.writingPrompt ?? ""`; nếu `wPart.length > 0` → trả `{ skill: "writing", part: wPart, prompt: wPrompt, hybrid: true }`.
     - Ngược lại trả `null`.
  5. Hiện thực `hasGradableTask(source: PromptGradableSource): boolean`: trả `true` nếu `isGradableSkill(source.skill ?? "")`, hoặc `essayTaskOf(source) !== null`, hoặc `(isAutoGradableSkill(source.skill ?? "") && source.hasWriting === true)`.
- **Success criteria:** Mọi unit test trong `ielts-band.test.ts` pass.
- **Verify:** `pnpm --filter @teacher-os/api test -- ielts-band` exits 0 và in `passed`.

### Task 1.3 — TDD Red: Tạo `hybrid-writing.contracts.test.ts` khoá các schema ghi & đọc
- **Goal:** Khoá toàn bộ ràng buộc schema `.strict()`, tách bạch write schema và wire read schema, và giữ tương thích ngược với mọi payload cũ.
- **Target files and symbols:** `packages/api/src/hybrid-writing.contracts.test.ts` (mới).
- **Steps:**
  1. Tạo file `packages/api/src/hybrid-writing.contracts.test.ts` kiểm tra:
     - `assignmentPromptCreateSchema`:
       - Payload cũ không truyền `writing` cho `grammar` / `reading` / `writing` parse thành công (`writing` là `undefined`), và biến gõ kiểu `const p: AssignmentPromptCreate = { ...không có writing... }` compile sạch.
       - Payload `grammar` / `reading` / `listening` / `vocabulary` kèm `writing: { part: "task2", type: "discuss", prompt: "<p>Discuss both views.</p>" }` parse thành công ở cả `draft` và `ready`.
       - Từ chối khi `skill === "writing"` hoặc `skill === "speaking"` mà `writing != null`.
       - Từ chối khi `writing.part` không thuộc `ASSIGNMENT_PART_TYPES.writing.parts` hoặc `writing.type` không thuộc `ASSIGNMENT_PART_TYPES.writing.types[writing.part]`.
       - Từ chối khi `writing.prompt` rỗng HTML (`""` hoặc `"<p>   </p>"`) ở cả `draft` lẫn `ready`.
       - Từ chối unknown key bên trong `writing` (`.strict()`).
     - `assignmentPromptUpdateSchema`:
       - `{ title: "New" }` (không có `writing`) → `parsed.writing === undefined` (không bị biến thành `null`).
       - `{ writing: null }` → hợp lệ (`parsed.writing === null`).
       - `{ writing: { part: "task1", type: "chart", prompt: "<p>Describe.</p>" } }` → hợp lệ; `prompt` rỗng hoặc sai catalog → fail.
     - `studentQuizDetailSchema` & `quizAttemptDetailSchema`:
       - Parse thành công cả khi không có `writing` và khi có `writing: { part: "task2", type: "", prompt: "<p>...</p>" }` (dùng `studentWritingSectionSchema` thuần `z.string()` để không bao giờ vỡ trên trình duyệt học viên khi `type` rỗng hay lệch `DOMParser`).
     - `teacherSubmissionSchema`: parse thành công cả khi không có `objective` và khi có `objective: { correctCount: 8, totalCount: 10 }`.
     - `studentAssignmentSchema` & `historyEntrySchema`: parse thành công cả khi không có `hasWriting` và khi có `hasWriting: true`.
- **Success criteria:** Test chạy và fail trên các schema mới (Red phase).
- **Verify:** `pnpm --filter @teacher-os/api test -- hybrid-writing` exits non-zero.

### Task 1.4 — TDD Green: Cập nhật `packages/api/src/contracts.ts`
- **Goal:** Mở rộng Zod schemas và TypeScript interfaces cho bài gộp mà không phá vỡ bất kỳ caller hiện hữu nào trên toàn monorepo.
- **Target files and symbols:** `packages/api/src/contracts.ts`:
  - `assignmentWritingSectionSchema`, `studentWritingSectionSchema`, `AssignmentWritingSection`, `StudentWritingSection`
  - `assignmentPromptBaseSchema`, `assignmentPromptCreateSchema`, `assignmentPromptUpdateSchema` (dòng 745–1055)
  - `KernelAssignmentPromptRow` (dòng 1642–1667)
  - `studentAssignmentSchema` (dòng 1961–1980)
  - `historyEntrySchema` (dòng 2148–2166)
  - `teacherSubmissionSchema` (dòng 2385–2422)
  - `studentQuizDetailSchema` & `quizAttemptDetailSchema` (dòng 2546–2683)
- **Steps:**
  1. Định nghĩa 2 schema tách bạch write vs read:
     ```ts
     export const assignmentWritingSectionSchema = z
     	.object({
     		part: z.string().trim().min(1).max(20),
     		type: z.string().trim().min(1).max(20),
     		prompt: richTextField(5000),
     	})
     	.strict()
     	.superRefine((writing, ctx) => {
     		const wConfig = ASSIGNMENT_PART_TYPES.writing;
     		if (!wConfig.parts.includes(writing.part)) {
     			ctx.addIssue({ code: "custom", path: ["part"], message: "invalid writing part" });
     			return;
     		}
     		if (!(wConfig.types[writing.part] ?? []).includes(writing.type)) {
     			ctx.addIssue({ code: "custom", path: ["type"], message: "invalid writing type" });
     		}
     		if (isEmptyRichText(writing.prompt)) {
     			ctx.addIssue({ code: "custom", path: ["prompt"], message: "writing prompt required" });
     		}
     	});
     export type AssignmentWritingSection = z.infer<typeof assignmentWritingSectionSchema>;

     export const studentWritingSectionSchema = z
     	.object({
     		part: z.string(),
     		type: z.string(),
     		prompt: z.string(),
     	})
     	.strict();
     export type StudentWritingSection = z.infer<typeof studentWritingSectionSchema>;
     ```
  2. Trong `assignmentPromptBaseSchema`, thêm `writing: assignmentWritingSectionSchema.nullable().optional(),` (KHÔNG dùng `.default(null)` để `AssignmentPromptCreate` giữ `writing?: AssignmentWritingSection | null` và `assignmentPromptUpdateSchema` giữ nguyên phân biệt `undefined` vs `null`).
  3. Trong `assignmentPromptCreateSchema.superRefine`, kiểm tra: nếu `!auto && value.writing != null`, gắn lỗi `path: ["writing"], message: "writing section only applies to auto-graded skills"`.
  4. Mở rộng `KernelAssignmentPromptRow`: thêm `writing?: AssignmentWritingSection | null;`.
  5. Trong `studentAssignmentSchema`: thêm `hasWriting: z.boolean().optional(),`.
  6. Trong `historyEntrySchema`: thêm `hasWriting: z.boolean().optional(),`.
  7. Trong `teacherSubmissionSchema`: thêm `objective: z.object({ correctCount: z.number().int().min(0), totalCount: z.number().int().min(0) }).strict().optional(),`.
  8. Trong `studentQuizDetailSchema` và `quizAttemptDetailSchema`: thêm `writing: studentWritingSectionSchema.optional(),`.
- **Success criteria:** Toàn bộ test trong `@teacher-os/api` xanh và `pnpm check-types` toàn repo xanh.
- **Verify:** `pnpm --filter @teacher-os/api test && pnpm check-types` exits 0.

### Task 1.5 — Thêm 3 cột `writing_*` vào `packages/db/src/schema/assignment-prompt.ts` và sinh migration 0062
- **Goal:** Lưu trữ phần Writing đính kèm ở tầng DB với migration additive an toàn cho SQLite/D1.
- **Target files and symbols:** `packages/db/src/schema/assignment-prompt.ts` (`assignmentPrompt`), `packages/db/src/migrations/0062_*.sql`.
- **Steps:**
  1. Mở `packages/db/src/schema/assignment-prompt.ts`, thêm 3 cột vào `assignmentPrompt`:
     - `writingPart: text("writing_part"),`
     - `writingType: text("writing_type"),`
     - `writingPrompt: text("writing_prompt").notNull().default(""),`
  2. Chạy `pnpm --filter @teacher-os/db db:generate` để Drizzle sinh file migration `0062_*.sql`, snapshot `0062_snapshot.json` và cập nhật `meta/_journal.json`.
  3. Đọc file `0062_*.sql` vừa sinh: xác nhận CHỈ chứa 3 câu `ALTER TABLE \`assignment_prompt\` ADD ...` — tuyệt đối không có `DROP TABLE` hay table rebuild.
  4. Chạy test của `@teacher-os/db` và `pnpm check-types` toàn repo.
- **Success criteria:** File migration `0062_*.sql` chỉ có 3 lệnh `ALTER TABLE ... ADD`, test DB và `check-types` toàn monorepo pass.
- **Verify:** `pnpm --filter @teacher-os/db test && pnpm check-types` exits 0.

## Verification
- `pnpm --filter @teacher-os/api test` exits 0.
- `pnpm --filter @teacher-os/db test` exits 0.
- `pnpm check-types` exits 0.

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
