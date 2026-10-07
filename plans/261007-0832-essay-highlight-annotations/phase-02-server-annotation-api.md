---
phase: 2
title: "Server: API highlight + payload giáo viên/học viên"
status: pending
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 2: Server — API highlight + payload giáo viên/học viên

## Goal

Giáo viên thêm/sửa/xoá highlight qua 3 route mới trong `grading.ts`; GET trang chấm trả `annotations`; summary học viên trả `annotations` chỉ khi bài đã chấm.

## Files to Create / Modify

- Modify: `apps/server/src/routes/grading.ts`
- Create: `apps/server/src/lib/quiz-annotation.ts` (map row → wire, load theo attempt)
- Modify: `apps/server/src/routes/student.ts` (handler `GET /attempts/:attemptId`, khối thêm `summary.grade` quanh dòng 1760)
- Modify: `apps/server/src/routes/grading.test.ts`
- Modify: `apps/server/src/routes/student-quiz.test.ts`

## Tasks & Steps

### 2.1 Helper `apps/server/src/lib/quiz-annotation.ts`

```ts
export function toEssayAnnotation(row: {
	id: string; startOffset: number; endOffset: number; note: string;
}): EssayAnnotation { return { id: row.id, start: row.startOffset, end: row.endOffset, note: row.note }; }

/** Highlight của 1 attempt, sắp theo start. Luôn kèm predicate orgId. */
export async function loadEssayAnnotations(db: Db, attemptId: string, orgId: string): Promise<EssayAnnotation[]>
```
Query `select` 4 cột từ `quizAttemptAnnotation` `where attemptId = ? and orgId = ?` `orderBy(asc(startOffset))`. Import type `Db` từ `../app` như `grading.ts`.

### 2.2 GET `/api/grading/:attemptId`

Trong handler GET, sau `loadGradableAttempt`: nếu `skill === "writing"` thì `annotations = await loadEssayAnnotations(...)`, ngược lại `[]`. `toSubmission` nhận thêm tham số `annotations` và gán vào payload.

### 2.3 Route POST `/:attemptId/annotations`

Thứ tự kiểm (cùng pattern route `/grade`):
1. `kernelCtx` → 401.
2. Parse JSON try/catch → 400 `invalid json`; `essayAnnotationCreateSchema.safeParse` → 400 `invalid body`.
3. `loadGradableAttempt` → 404/409/400 qua `errorResponse`.
4. `loaded.skill !== "writing"` → 400 `{ error: "skill not annotatable", code: "SKILL_NOT_ANNOTATABLE" }`.
5. `!isValidAnnotationSpan(loaded.row.essay, start, end)` → 400 `{ code: "INVALID_SPAN" }`.
6. `existing = await loadEssayAnnotations(...)`; `existing.length >= QUIZ_ANNOTATIONS_MAX` → 400 `{ code: "TOO_MANY_ANNOTATIONS" }`; `overlapsAny(existing, start, end)` → 409 `{ code: "OVERLAP" }`.
7. Insert `{ id: crypto.randomUUID(), orgId: ctx.orgId, attemptId: loaded.row.id, startOffset, endOffset, note }` với `.returning()`; trả `c.json(toEssayAnnotation(row), 201)`.

Không bắt buộc `snapSpanToWords` ở server: client gửi đoạn đã bắt dính; server chỉ đảm bảo đoạn hợp lệ.

### 2.4 Route PATCH `/:attemptId/annotations/:annotationId`

1. `kernelCtx` → 401. Parse JSON try/catch, `essayAnnotationPatchSchema` → 400. (Kernel guard chỉ ép content-type cho POST; PATCH vẫn qua Origin guard — precedent `assignments/index.ts:135`.)
2. `loadGradableAttempt` → 404/409/400 (giữ tenancy + chỉ bài đã nộp).
3. `update(quizAttemptAnnotation).set({ note, updatedAt: new Date() }).where(and(eq(id, annotationId), eq(attemptId, loaded.row.id), eq(orgId, ctx.orgId))).returning()`. Rỗng → 404 `{ error: "annotation not found" }`. Có → 200 annotation.

### 2.5 Route DELETE `/:attemptId/annotations/:annotationId`

Giống PATCH bỏ phần body: `delete(...).where(...cùng 3 predicate).returning({ id })`. Rỗng → 404; có → `c.body(null, 204)`.

Không kiểm `skill` ở PATCH/DELETE: annotation chỉ tồn tại trên attempt Writing (POST đã chặn), và predicate `attemptId` đủ chặn chéo.

### 2.6 Summary học viên (`student.ts`)

Trong handler `GET /attempts/:attemptId`, ngay trong khối `if (teacherGrade)`:

```ts
if (skill === "writing") {
	const annotations = await loadEssayAnnotations(
		deps.getDb(),
		attempt.id,
		orgId,
	);
	if (annotations.length > 0) summary.annotations = annotations;
}
```
`orgId` lấy từ `c.get("studentCtx")` ở đầu handler; handler này chưa có biến `db` riêng nên gọi `deps.getDb()` (pattern các handler khác trong file). Comment: "CHỈ thêm khi đã chấm + có highlight — học viên không thấy highlight dở dang; bundle cũ (strict) chỉ lỗi ở đúng attempt này."

Route `/attempts/:attemptId/detail` không đổi.

### 2.7 Test `grading.test.ts`

Dùng lại setup có sẵn (`buildApp`, `TEACHER`, `TEACHER_ORIGIN`, seed attempt writing/speaking). Thêm `describe("essay annotations")`:

1. POST hợp lệ → 201, body đúng `{id,start,end,note}`; GET trả `annotations` chứa nó.
2. POST 2 cái theo thứ tự ngược → GET trả sắp theo `start`.
3. POST chồng một phần → 409 `OVERLAP`; chạm biên → 201.
4. POST `end > essay.length`, đoạn toàn khoảng trắng, dài > 1000 → 400 `INVALID_SPAN`.
5. POST `end <= start`, key thừa, note > 1000 → 400 `invalid body`.
6. POST trên attempt Speaking → 400 `SKILL_NOT_ANNOTATABLE`; GET Speaking trả `annotations: []`.
7. POST trên attempt `in_progress` → 409 `NOT_SUBMITTED`.
8. POST thứ 201 → 400 `TOO_MANY_ANNOTATIONS` (seed 200 dòng thẳng bằng drizzle insert để test nhanh).
9. `teacher-2` (org khác) POST/PATCH/DELETE → 404.
10. PATCH/DELETE với annotationId của attempt khác cùng org → 404.
11. PATCH đổi note → 200, GET thấy note mới; DELETE → 204, GET không còn.
12. Không session → 401 cho cả 3 route; Origin lạ → 403; session học viên → 403.
13. POST thiếu `Content-Type: application/json` → 415 (guard kernel).

### 2.8 Test `student-quiz.test.ts`

1. Attempt Writing đã nộp, có annotation, **chưa chấm** → summary không có key `annotations` (`expect("annotations" in body).toBe(false)`).
2. Sau khi set `grade_*` (seed trực tiếp hoặc gọi route chấm) → summary có `annotations` đúng thứ tự.
3. Đã chấm nhưng 0 annotation → không có key.
4. Annotation của học viên khác/attempt khác không lọt vào.

## Verification

- `pnpm --filter server test` xanh.
- `pnpm check-types` xanh.
- `pnpm check` xanh.

## Failure Protocol

- Test kernel snapshot hoặc test cũ của grading đỏ vì shape GET thay đổi (equality đầy đủ): cập nhật expectation thêm `annotations: []`, không đổi shape server.
- `Origin` guard không áp lên PATCH/DELETE (403 không xảy ra): dừng, kiểm router đã mount trong `kernel` chứ không standalone.
