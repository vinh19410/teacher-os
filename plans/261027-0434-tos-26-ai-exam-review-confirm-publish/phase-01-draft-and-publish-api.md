---
phase: 1
title: "API lưu nháp + xuất bản vào Ngân hàng đề"
status: completed
effort: 6h
---

# Phase 1 — API lưu nháp + xuất bản

<!-- Updated: Red Team & Validation Session 1 - CSRF guard, server-side needsReview preservation, snapshot explanation forward, Listening draft fallback, TOCTOU idempotency -->

## Goal

Cung cấp 2 endpoint `PATCH /api/exam-imports/:id/draft` (0 Credit, bảo toàn `needsReview` gốc) và `POST /api/exam-imports/:id/publish` (cổng xác nhận 2 lớp + tạo `assignment_prompt[]`, `assignment_test`, `assignment_test_part[]` idempotent trong 1 `db.batch`), kèm migration `published_test_id` và forward `explanation` trong `snapshot.ts`.

## Files to Create or Modify

- `packages/db/src/schema/exam-import-job.ts`: thêm cột `publishedTestId: text("published_test_id")`.
- `packages/db/src/migrations/0052_*.sql` + `packages/db/src/migrations/meta/_journal.json`: migration `ALTER TABLE exam_import_job ADD COLUMN published_test_id text;`.
- `packages/api/src/contracts.ts`: mở rộng `EXAM_IMPORT_ERROR_CODES` (`REVIEW_CONFIRMATION_REQUIRED`, `TOO_MANY_PARTS`, `SKILL_MIXED_NOT_ALLOWED`, `INVALID_DRAFT`, `INVALID_STATE`), thêm `publishedTestId: z.string().min(1).nullish()` vào `examImportJobSchema`, định nghĩa `examImportDraftUpdateSchema` và `examImportPublishSchema` (`{ draft, reviewConfirmed }`), nới `passage`/`explanation` nhận rich text hợp lệ.
- `apps/server/src/lib/exam-import/publish-to-bank.ts` (+ `publish-to-bank.test.ts`): hàm `publishExamImportToBank` chuẩn hóa câu hỏi/part từ `ExtractedExamDraft`, kiểm tra cổng `needsReview` & `reviewConfirmed`, kiểm tra `skill !== "mixed"` và `parts.length <= preset.slots.length`, ghi `assignment_prompt[]` + `assignment_test` + `assignment_test_part[]` + `exam_import_job.published_test_id` trong 1 `db.batch` idempotent.
- `apps/server/src/routes/exam-imports.ts` (+ `exam-imports.test.ts`): thêm CSRF Origin + `Content-Type: application/json` guard cho `PATCH /exam-imports/:id/draft` và `POST /exam-imports/:id/publish`, kiểm tra `canImportExam(kernelCtx.role)` và `importStatus === "completed"`, bảo toàn `needsReview` từ `row.draftJson`.
- `apps/server/src/routes/snapshot.ts`: bổ sung `explanation` vào `parseQuestions` để giải thích đáp án round-trip qua snapshot.

## Tasks & Steps

### Task 1.1 — Migration `published_test_id` và mở rộng contracts
- **Goal:** Bảng `exam_import_job` có cột `published_test_id` (khớp `/readyz`), `contracts.ts` có đầy đủ schema & mã lỗi cho `PATCH /draft` và `POST /publish`.
- **Target files and symbols:** `packages/db/src/schema/exam-import-job.ts` (`examImportJob`), `packages/db/src/migrations/0052_exam_import_published_test.sql`, `packages/db/src/migrations/meta/_journal.json`, `packages/api/src/contracts.ts` (`EXAM_IMPORT_ERROR_CODES`, `examImportJobSchema`, `examImportDraftUpdateSchema`, `examImportPublishSchema`, `examImportPublishResponseSchema`).
- **Steps:**
  1. Thêm `publishedTestId: text("published_test_id")` vào `examImportJob` và tạo migration SQL `0052` + cập nhật `_journal.json`.
  2. Trong `packages/api/src/contracts.ts`, thêm các mã lỗi `REVIEW_CONFIRMATION_REQUIRED`, `TOO_MANY_PARTS`, `SKILL_MIXED_NOT_ALLOWED`, `INVALID_DRAFT`, `INVALID_STATE` vào `EXAM_IMPORT_ERROR_CODES`.
  3. Thêm `publishedTestId: z.string().min(1).nullish()` vào `examImportJobSchema` và cập nhật `toJobDto` trong `apps/server/src/routes/exam-imports.ts`.
  4. Định nghĩa `examImportDraftUpdateSchema = z.object({ draft: extractedExamDraftSchema }).strict()` và `examImportPublishSchema = z.object({ draft: extractedExamDraftSchema, reviewConfirmed: z.boolean() }).strict()`.
- **Success criteria:** `readiness.test.ts` pass (số cột `REQUIRED_COLUMN_TOTAL` khớp migration mới) và `contracts` build/typecheck không lỗi.
- **Verify:** `pnpm --filter server test -- readiness` exits 0.

### Task 1.2 — Helper `publish-to-bank.ts` và forward `explanation` ở `snapshot.ts`
- **Goal:** Chuyển đổi `ExtractedExamDraft` thành `assignment_prompt[]` + `assignment_test` + `assignment_test_part[]` nguyên tử trong `db.batch`, idempotent theo `job.id`, và giữ `explanation` khi đọc snapshot.
- **Target files and symbols:** `apps/server/src/lib/exam-import/publish-to-bank.ts`, `apps/server/src/lib/exam-import/publish-to-bank.test.ts`, `apps/server/src/routes/snapshot.ts` (`parseQuestions`).
- **Steps:**
  1. Trong `apps/server/src/routes/snapshot.ts` (`parseQuestions`), bổ sung `explanation: typeof record.explanation === "string" && record.explanation.length > 0 ? record.explanation : undefined`.
  2. Tạo `apps/server/src/lib/exam-import/publish-to-bank.ts`:
     - Hợp nhất `draft` gửi lên với `existingDraft` trong DB theo `(partIndex, questionIndex)` sao cho `needsReview = Boolean(existingQ?.needsReview || incomingQ.needsReview)` và giữ `confidence` gốc.
     - Đếm số câu `needsReview === true`; nếu `> 0 && !reviewConfirmed` → trả lỗi `REVIEW_CONFIRMATION_REQUIRED` (422).
     - Kiểm tra `draft.skill !== "mixed"` (nếu `"mixed"` → 422 `SKILL_MIXED_NOT_ALLOWED`) và `draft.parts.length <= ASSIGNMENT_TEST_PRESETS[skill].slots.length` (nếu vượt → 422 `TOO_MANY_PARTS`).
     - Chuẩn hóa từng câu hỏi sang `assignmentQuestionSchema` (yêu cầu `stem.trim().length > 0` và với `reading`/`listening` yêu cầu `answer.trim().length > 0`; nếu câu có `opts` và `type === "mcq"` mà `answer` trùng text của `opts[i]` thì chuẩn hóa sang nhãn `"A".."D"`, map `type` hợp lệ với catalog `ASSIGNMENT_PART_TYPES[skill].types[slot.part]`). Nếu câu thiếu `stem`/`answer` hoặc sai giới hạn → trả 422 `INVALID_DRAFT` kèm `{ partIndex, questionIndex }`.
     - Kiểm tra nếu `job.publishedTestId` đã có và row `assignment_test` đó còn tồn tại trong `orgId` → trả `{ testId: job.publishedTestId, status }` (idempotent).
     - Ngược lại, chạy `db.batch` chèn `assignment_prompt[]` (`source = "AI import: <fileName>"`, `status = skill === "listening" ? "draft" : "ready"`), `assignment_test` (`status = skill === "listening" ? "draft" : "ready"`, `timeLimitSeconds = draft.timeLimitMinutes ? draft.timeLimitMinutes * 60 : null`), `assignment_test_part[]` theo `preset.slots[i].part`, và `UPDATE exam_import_job SET published_test_id = testId, draft_json = ...`. Bắt lỗi unique/PK race khi 2 request song song để đọc lại `publishedTestId` thắng cuộc.
  3. Viết unit test `apps/server/src/lib/exam-import/publish-to-bank.test.ts`.
- **Success criteria:** Unit test cover đủ: cổng 422 `REVIEW_CONFIRMATION_REQUIRED`, `TOO_MANY_PARTS`, `SKILL_MIXED_NOT_ALLOWED`, `INVALID_DRAFT`, tạo test + prompts đúng slot, idempotent khi gọi 2 lần (kể cả song song), và Listening ra `draft`.
- **Verify:** `pnpm --filter server test -- publish-to-bank` exits 0.

### Task 1.3 — Route `PATCH /api/exam-imports/:id/draft` và `POST /api/exam-imports/:id/publish`
- **Goal:** Mount 2 route vào `examImportRoutes` kèm CSRF Origin + JSON guard, phân quyền `canImportExam`, và không đụng ví Credit.
- **Target files and symbols:** `apps/server/src/routes/exam-imports.ts` (`examImportRoutes`, `ExamImportRouteDeps`), `apps/server/src/routes/exam-imports.test.ts`.
- **Steps:**
  1. Mở rộng `ExamImportRouteDeps` nhận `corsOrigin?: string | string[]` và `corsOrigins?: string | string[]`; thêm helper kiểm tra `Origin` (khi `allowedOrigins.length > 0`) và `Content-Type: application/json` cho `PATCH /exam-imports/:id/draft` và `POST /exam-imports/:id/publish`.
  2. Handler `PATCH /exam-imports/:id/draft`: kiểm tra `kernelCtx` (401), `canImportExam(kernelCtx.role)` (403), đọc job theo `(id, orgId)` (404 nếu không thấy, 409 `INVALID_STATE` nếu `importStatus !== "completed"`), validate body qua `examImportDraftUpdateSchema`, bảo toàn `needsReview`/`confidence` gốc từ `row.draftJson`, `UPDATE exam_import_job SET draft_json = ...`, trả `200 toJobDto(updatedRow)`. Tuyệt đối không gọi bất kỳ hàm ví nào.
  3. Handler `POST /exam-imports/:id/publish`: kiểm tra `kernelCtx` (401), `canImportExam(kernelCtx.role)` (403), đọc job theo `(id, orgId)` (404/409), validate body qua `examImportPublishSchema`, gọi `publishExamImportToBank`, trả `200 { testId, status }` hoặc `422` theo mã lỗi.
  4. Bổ sung test trong `apps/server/src/routes/exam-imports.test.ts` cho `PATCH /:id/draft` và `POST /:id/publish`.
- **Success criteria:** Mọi test trong `exam-imports.test.ts` pass: lưu nháp 0 Credit (log ví không tăng, số dư giữ nguyên), bảo toàn `needsReview: true` khi sửa câu, publish thiếu xác nhận → 422 `REVIEW_CONFIRMATION_REQUIRED`, publish đủ xác nhận → 200 `{ testId }`, publish lần 2 → cùng `testId`, vượt slot → 422 `TOO_MANY_PARTS`, org khác → 404, role `ta` → 403.
- **Verify:** `pnpm --filter server test -- exam-imports` exits 0.

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
