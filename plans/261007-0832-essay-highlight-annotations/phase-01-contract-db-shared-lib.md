---
phase: 1
title: "Contract + DB + logic highlight dùng chung"
status: completed
priority: P2
effort: "2.5h"
dependencies: []
---

# Phase 1: Contract + DB + logic highlight dùng chung

## Goal

Có bảng `quiz_attempt_annotation`, schema zod cho wire, và bộ hàm thuần (validate biên, kiểm chồng, bắt dính theo từ, chia essay thành đoạn) có unit test, để Phase 2–4 chỉ việc dùng.

## Files to Create / Modify

- Create: `packages/db/src/schema/quiz-attempt-annotation.ts`
- Modify: `packages/db/src/schema/index.ts` (thêm `export * from "./quiz-attempt-annotation";` theo thứ tự alpha, sau `./quiz-attempt`)
- Create (generate): `packages/db/src/migrations/0035_<drizzle-name>.sql` + `meta/0035_snapshot.json` + `meta/_journal.json`
- Modify: `packages/api/src/contracts.ts` (khối "Nhận xét giáo viên", quanh dòng 1712–1780 và `quizAttemptSummarySchema` quanh dòng 1922)
- Create: `packages/api/src/lib/essay-annotations.ts`
- Create: `packages/api/src/lib/essay-annotations.test.ts`

## Tasks & Steps

### 1.1 Schema DB

1. Tạo `quiz-attempt-annotation.ts` theo pattern `quiz-attempt.ts`:
   - `id: text("id").primaryKey()`
   - `orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" })`
   - `attemptId: text("attempt_id").notNull().references(() => quizAttempt.id, { onDelete: "cascade" })`
   - `startOffset: integer("start_offset").notNull()`, `endOffset: integer("end_offset").notNull()` (không dùng tên cột `end` vì là từ khoá SQL)
   - `note: text("note").notNull().default("")`
   - `createdAt`, `updatedAt`: `integer(..., { mode: "timestamp_ms" })` default `sql\`(cast(unixepoch('subsecond') * 1000 as integer))\`` notNull (copy biểu thức từ `startedAt`)
   - index `quiz_attempt_annotation_attempt_idx` trên `attemptId`, index `quiz_attempt_annotation_org_idx` trên `orgId`
2. JSDoc đầu bảng: offset là UTF-16 code unit trên `quiz_attempt.essay`, essay đóng băng sau nộp nên offset ổn định; không lưu trích đoạn; không cho chồng nhau (kiểm ở server).
3. Export từ `schema/index.ts`.

### 1.2 Migration 0035

1. `pnpm --filter @teacher-os/db db:generate`. Kiểm file sinh ra chỉ có `CREATE TABLE quiz_attempt_annotation` + 2 `CREATE INDEX`, không đụng bảng khác.
2. Thêm header comment vào đầu file SQL (precedent 0033):
   ```sql
   -- Highlight + ghi chú giáo viên trên bài Writing (quiz_attempt_annotation).
   -- DEPLOY ORDER (bắt buộc): chạy `db:migrate:deploy` TRƯỚC khi deploy worker —
   -- trang chấm và summary học viên đã chấm query bảng này, thiếu bảng thì
   -- trả 500 (/readyz không kiểm bảng).
   ```

### 1.3 Contract (`contracts.ts`)

Thêm ngay sau `quizAttemptGradeSchema`:

```ts
/** Highlight + ghi chú giáo viên trên essay Writing. Offset là index UTF-16
 * (String.slice) trên essay đã nộp — essay đóng băng sau nộp. */
export const QUIZ_ANNOTATION_NOTE_MAX = 1000;
export const QUIZ_ANNOTATIONS_MAX = 200;
export const QUIZ_ANNOTATION_SPAN_MAX = 1000;
export const essayAnnotationSchema = z
	.object({
		id: z.string(),
		start: z.number().int().min(0),
		end: z.number().int().min(1),
		note: z.string(),
	})
	.strict();
export type EssayAnnotation = z.infer<typeof essayAnnotationSchema>;
/** POST /api/grading/:attemptId/annotations — biên kiểm thêm theo essay ở server. */
export const essayAnnotationCreateSchema = z
	.object({
		start: z.number().int().min(0),
		end: z.number().int().min(1),
		note: z.string().max(QUIZ_ANNOTATION_NOTE_MAX),
	})
	.strict()
	.refine((v) => v.end > v.start, "end must be greater than start");
export type EssayAnnotationCreate = z.infer<typeof essayAnnotationCreateSchema>;
/** PATCH /api/grading/:attemptId/annotations/:annotationId. */
export const essayAnnotationPatchSchema = z
	.object({ note: z.string().max(QUIZ_ANNOTATION_NOTE_MAX) })
	.strict();
export type EssayAnnotationPatch = z.infer<typeof essayAnnotationPatchSchema>;
```

Sửa schema có sẵn:
- `teacherSubmissionSchema`: thêm `annotations: z.array(essayAnnotationSchema).optional()` kèm comment "server luôn gửi; optional để bundle mới + server cũ không throw".
- `quizAttemptSummarySchema`: thêm `annotations: z.array(essayAnnotationSchema).optional()` kèm comment "server CHỈ gửi khi đã chấm + Writing + có ít nhất 1 highlight — cùng lý do strict của `grade`".

Lưu ý: `quizAttemptDetailSchema` là `.omit({ items: true }).extend(...)` từ summary nên tự có `annotations` optional. Route detail không gửi key này; không cần sửa gì.

### 1.4 Logic dùng chung `packages/api/src/lib/essay-annotations.ts`

Hàm thuần, không import DOM:

1. `isValidAnnotationSpan(essay: string, start: number, end: number): boolean`
   - `Number.isInteger` cả hai, `0 <= start < end <= essay.length`, `end - start <= QUIZ_ANNOTATION_SPAN_MAX`, `essay.slice(start, end).trim() !== ""`.
2. `overlapsAny(spans: ReadonlyArray<{ id?: string; start: number; end: number }>, start: number, end: number, ignoreId?: string): boolean`
   - Chồng khi `a.start < end && start < a.end`. Hai đoạn chạm biên (`a.end === start`) không tính là chồng.
3. `snapSpanToWords(essay: string, start: number, end: number): { start: number; end: number } | null`
   - Cắt khoảng trắng hai đầu.
   - Nới `start` lùi và `end` tiến tới hết ký tự từ. Ký tự từ: `/[\p{L}\p{N}'’-]/u`.
   - Trả `null` nếu sau khi cắt rỗng.
   - Ví dụ: essay `"the environment is"`, chọn `(6, 10)` (`nvir`) → `(4, 15)` (`environment`). Chọn `(3, 5)` (`" e"`) → `(4, 15)`.
4. `segmentEssay(essay: string, annotations: ReadonlyArray<EssayAnnotation>): Array<{ start: number; end: number; text: string; annotation: EssayAnnotation | null; n: number | null }>`
   - Sắp annotation theo `start`, bỏ qua cái sai biên (`!isValidAnnotationSpan` trừ điều kiện trim — chỉ kiểm biên số) hoặc chồng với cái đã nhận.
   - Đánh số `n` từ 1 theo thứ tự xuất hiện của những cái được nhận.
   - Ghép các đoạn thường xen giữa; không sinh đoạn rỗng.
   - Kết quả nối lại `text` phải bằng đúng `essay`.
5. `orderedAnnotations(essay, annotations)`: trả mảng annotation đã nhận kèm `n` theo đúng thứ tự `segmentEssay` (dùng cho danh sách ghi chú, để số trong list và số trên highlight luôn khớp). Implement bằng cách lọc kết quả `segmentEssay`.

### 1.5 Unit test `essay-annotations.test.ts`

Pattern theo `ielts-band.test.ts` (vitest). Tối thiểu:
- `isValidAnnotationSpan`: biên hợp lệ; `start === end`; `end > length`; số âm; số lẻ `1.5`; đoạn toàn `"  \n"`; đoạn dài 1001.
- `overlapsAny`: chồng một phần trái/phải, nằm trong, bao ngoài, chạm biên (không chồng), `ignoreId`.
- `snapSpanToWords`: giữa từ; có khoảng trắng đầu/cuối; nhiều từ; từ có dấu tiếng Việt và apostrophe (`don’t`); chỉ khoảng trắng → `null`; ở đầu/cuối essay.
- `segmentEssay`: không annotation → 1 đoạn; 2 annotation không theo thứ tự → sắp lại, `n` = 1, 2; annotation chồng → bỏ cái sau; annotation sai biên → bỏ; `join("") === essay` cho mọi case; essay có `\n`.

## Verification

- `pnpm --filter @teacher-os/api test` xanh (gồm test mới).
- `pnpm --filter @teacher-os/db check-types` (hoặc `pnpm check-types` toàn repo) xanh.
- `git diff --stat packages/db/src/migrations` chỉ có file 0035 + meta.
- `pnpm check` xanh.

## Failure Protocol

- Drizzle sinh migration đụng bảng khác ngoài `quiz_attempt_annotation`: dừng, kiểm schema có thay đổi lạc, không sửa tay SQL ngoài header comment.
- `check-types` đỏ ở web/student vì `TeacherSubmission`/`QuizAttemptSummary` đổi: không xảy ra vì field optional; nếu đỏ, kiểm lại `.optional()`.
