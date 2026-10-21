---
phase: 2
title: "Server: toEssayView + wiring các đường đọc/ghi essay & annotations"
status: pending
priority: P1
effort: "1.5h"
---

# Phase 2: Server `toEssayView` + wiring các đường đọc/ghi essay & annotations

## Goal

Mọi endpoint server trả `essay` hoặc `EssayAnnotation` cho client (giáo viên lẫn
học viên) đều đi qua `toEssayView` / `essayToPlain`, và `POST`/`PATCH`
annotations quy đổi offset plain ↔ raw để DB giữ nguyên offset raw trong khi
client chỉ nhìn thấy plain text + plain offsets.

## Files to Create or Modify

- Modify: `apps/server/src/lib/quiz-annotation.ts`
- Modify: `apps/server/src/routes/grading.ts`
- Modify: `apps/server/src/routes/student.ts`
- Modify: `apps/server/src/routes/grading.test.ts`
- Modify: `apps/server/src/routes/student-quiz.test.ts`

## Tasks & Steps

### Task 2.1 — Viết test tích hợp route cho essay HTML trước (TDD Red)

- **Goal:** Có test route ở cả `grading.test.ts` và `student-quiz.test.ts` khẳng
  định hành vi với essay HTML `<p>…</p>`, và test fail trước khi nối server.
- **Target files and symbols:**
  - `apps/server/src/routes/grading.test.ts`
  - `apps/server/src/routes/student-quiz.test.ts`
- **Steps:**
  1. Trong `apps/server/src/routes/grading.test.ts`, thêm test cho attempt Writing
     có `essay = "<p>Remote learning has widened the gap.</p><p>Cost &amp; time matter.</p>"`
     (plain là `"Remote learning has widened the gap.\nCost & time matter."` — câu 1
     dài 36 ký tự, `\n` ở 36, `"Cost & time"` ở plain offset **`37..48`**, ứng với
     raw offset **`46..61`** tức `"Cost &amp; time"`):
     - `GET /api/grading/:attemptId` trả `essay === "Remote learning has widened the gap.\nCost & time matter."` (không chứa `<p>` hay `&amp;`).
     - `POST /api/grading/:attemptId/annotations` với `{ start: 37, end: 48, note: "rõ ý" }`
       trả 201 với `{ start: 37, end: 48, note: "rõ ý" }`, trong khi dòng DB
       `quiz_attempt_annotation` lưu `start_offset = 46, end_offset = 61`
       (`raw.slice(46, 61) === "Cost &amp; time"`).
     - `PATCH /api/grading/:attemptId/annotations/:annotationId` đổi `note` trả
       200 với `start: 37, end: 48` (plain offset, không lộ raw offset `46..61`).
     - `GET /api/grading/:attemptId` sau đó trả `annotations: [{ id, start: 37, end: 48, note }]`.
     - Một dòng annotation cũ chèn trực tiếp vào DB có `startOffset = 0, endOffset = 3`
       (nằm trọn trong `<p>`) bị lọc bỏ khỏi `GET /api/grading/:attemptId`.
  2. Trong `apps/server/src/routes/student-quiz.test.ts`, thêm test cho attempt
     Writing có `essay = "<p>Remote learning has widened the gap.</p>"`:
     - Khi attempt `in_progress`, `GET /api/student/assignments/:assignmentId/quiz`
       trả `attempt.essay === "Remote learning has widened the gap."`.
     - Sau khi nộp, giáo viên chấm điểm và DB có dòng `quizAttemptAnnotation`
       trên `"widened"` với raw offset `startOffset: 23, endOffset: 30` (ứng với
       plain offset `20..27`), `GET /api/student/attempts/:attemptId` trả
       `essay === "Remote learning has widened the gap."` và
       `annotations: [{ id, start: 20, end: 27, note }]`;
       `GET /api/student/attempts/:attemptId/detail` trả
       `essay === "Remote learning has widened the gap."`.
- **Success criteria:** Hai lệnh test chạy và fail đúng ở các test mới thêm.
- **Verify:** `pnpm --filter server exec vitest run src/routes/grading.test.ts src/routes/student-quiz.test.ts`
  exits non-zero with assertion failure on `<p>Remote learning`.

### Task 2.2 — Thêm `toEssayView` và `toPlainAnnotation` trong `quiz-annotation.ts`

- **Goal:** Có một điểm tập trung duy nhất ở server biến `(rawEssay, rawAnnotations)`
  thành `{ view, essay, annotations }` theo offset plain.
- **Target files and symbols:** `apps/server/src/lib/quiz-annotation.ts`
  (functions `toEssayAnnotation`, `toPlainAnnotation`, `toEssayView`,
  `loadEssayAnnotations`).
- **Steps:**
  1. Import `essayToPlain`, `rawToPlain`, `type PlainEssayView` từ
     `@teacher-os/api/lib/essay-plain`.
  2. Thêm helper:
     ```ts
     export function toPlainAnnotation(
     	view: PlainEssayView,
     	ann: EssayAnnotation,
     ): EssayAnnotation | null {
     	const span = rawToPlain(view, ann.start, ann.end);
     	if (!span) return null;
     	if (span.start === ann.start && span.end === ann.end) return ann;
     	return { ...ann, start: span.start, end: span.end };
     }

     export function toEssayView(
     	rawEssay: string,
     	rawAnnotations: ReadonlyArray<EssayAnnotation>,
     ): {
     	view: PlainEssayView;
     	essay: string;
     	annotations: EssayAnnotation[];
     } {
     	const view = essayToPlain(rawEssay);
     	const annotations: EssayAnnotation[] = [];
     	for (const ann of rawAnnotations) {
     		const mapped = toPlainAnnotation(view, ann);
     		if (mapped) annotations.push(mapped);
     	}
     	return { view, essay: view.text, annotations };
     }
     ```
  3. Giữ nguyên `loadEssayAnnotations` trả offset raw từ DB để `POST` annotation
     vẫn kiểm `overlapsAny` và đếm `QUIZ_ANNOTATIONS_MAX` trực tiếp trên raw.
- **Success criteria:** File biên dịch sạch, không phá các chỗ đang gọi.
- **Verify:** `no verification needed` (sẽ kiểm ở Task 2.3 cùng route tests).

### Task 2.3 — Nối `toEssayView` / `essayToPlain` vào `grading.ts` và `student.ts` (TDD Green)

- **Goal:** Cả 6 điểm chạm essay/annotation ở server đều trả/nhận offset plain
  nhất quán; toàn bộ test ở Task 2.1 và test cũ đều xanh.
- **Target files and symbols:**
  - `apps/server/src/routes/grading.ts` (`toSubmission`,
    `routes.post("/:attemptId/annotations")`,
    `routes.patch("/:attemptId/annotations/:annotationId")`)
  - `apps/server/src/routes/student.ts` (`router.get("/assignments/:assignmentId/quiz")`,
    `router.get("/attempts/:attemptId")`,
    `router.get("/attempts/:attemptId/detail")`)
- **Steps:**
  1. Trong `apps/server/src/routes/grading.ts`:
     - Import `essayToPlain`, `plainToRaw` từ `@teacher-os/api/lib/essay-plain`
       và `toEssayView`, `toPlainAnnotation` từ `../lib/quiz-annotation`.
     - Trong `toSubmission(row, skill, annotations)`: khi `skill === "writing"`,
       gọi `const essayView = toEssayView(row.essay, annotations)` rồi gán
       `essay: essayView.essay` và `annotations: essayView.annotations` (nhánh
       Speaking giữ `essay: null, annotations: []`).
     - Trong `routes.post("/:attemptId/annotations")`:
       - Tạo `const view = essayToPlain(loaded.row.essay);`.
       - Kiểm `isValidAnnotationSpan(view.text, start, end)` trên **plain**;
         nếu false trả 400 `INVALID_SPAN`.
       - Quy đổi `const rawSpan = plainToRaw(view, start, end);` — nếu `!rawSpan`
         trả 400 `INVALID_SPAN` (không gọi lại `isValidAnnotationSpan` trên raw
         để không chặn oan span có nhiều thẻ/entity).
       - Kiểm `overlapsAny(existing, rawSpan.start, rawSpan.end)` trên raw; nếu
         trùng trả 409 `OVERLAP`.
       - Lưu DB với `startOffset: rawSpan.start, endOffset: rawSpan.end`.
       - Khi trả 201: chuẩn hoá ngược qua `toPlainAnnotation(view, toEssayAnnotation(row))`
         (fallback `{ ...toEssayAnnotation(row), start, end }`) để response 201
         luôn khớp tuyệt đối với `GET /api/grading/:attemptId` kể cả khi có astral entity.
     - Trong `routes.patch("/:attemptId/annotations/:annotationId")`:
       - Tạo `const view = essayToPlain(loaded.row.essay);`.
       - Map `const mapped = toPlainAnnotation(view, toEssayAnnotation(row));`
         rồi trả `c.json(mapped ?? toEssayAnnotation(row))`.
  2. Trong `apps/server/src/routes/student.ts`:
     - Import `essayToPlain` từ `@teacher-os/api/lib/essay-plain` và `toPlainAnnotation`
       từ `../lib/quiz-annotation`.
     - Tại `router.get("/assignments/:assignmentId/quiz")` (chỗ trả `attempt`
       resume, khoảng dòng 1082 — lưu ý trong scope này tên biến là `prompt.skill`,
       không có biến `skill`): đổi `essay: attempt.essay` thành
       `essay: prompt.skill === "writing" ? essayToPlain(attempt.essay).text : attempt.essay`.
     - Tại `router.get("/attempts/:attemptId")` (summary, khoảng dòng 1757 & 1772):
       tính `const essayView = skill === "writing" ? essayToPlain(attempt.essay) : null;`
       trước khi tạo `summary`, gán `essay: essayView ? essayView.text : null`.
       Ở khối `if (skill === "writing")` phía dưới (sau `if (!teacherGrade) return c.json(summary);`):
       sau khi `loadEssayAnnotations`, map qua `essayView`:
       ```ts
       if (skill === "writing" && essayView) {
       	const rawAnnotations = await loadEssayAnnotations(
       		deps.getDb(),
       		attempt.id,
       		orgId,
       	);
       	const annotations = rawAnnotations
       		.map((a) => toPlainAnnotation(essayView, a))
       		.filter((a): a is EssayAnnotation => a !== null);
       	if (annotations.length > 0) summary.annotations = annotations;
       }
       ```
     - Tại `router.get("/attempts/:attemptId/detail")` (khoảng dòng 1823):
       đổi `essay: skill === "writing" ? attempt.essay : null` thành
       `essay: skill === "writing" ? essayToPlain(attempt.essay).text : null`.
- **Success criteria:** Toàn bộ test trong `apps/server` pass (kể cả test mới ở
  Task 2.1 và toàn bộ test hiện có không đổi expectation).
- **Verify:** `pnpm --filter server exec vitest run src/routes/grading.test.ts src/routes/student-quiz.test.ts && pnpm --filter server check-types`
  exits 0.

## Verification

- `pnpm --filter server test` exits 0.
- `pnpm --filter server check-types` exits 0.

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
