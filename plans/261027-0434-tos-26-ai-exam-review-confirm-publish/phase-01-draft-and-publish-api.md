---
phase: 1
title: "API lưu nháp + xuất bản vào Ngân hàng đề"
status: pending
effort: 6h
---

# Phase 1 — API lưu nháp + xuất bản

## Files

- `packages/db/src/schema/exam-import-job.ts`: cột `published_test_id` (nullable) + migration mới.
- `apps/server/src/routes/exam-imports.ts` (+ test): `PATCH /:id/draft`, `POST /:id/publish`.
- `apps/server/src/lib/exam-import/publish-to-bank.ts` (+ test): map `ExtractedExam` → `assignment_prompt[]` + `assignment_test` + `assignment_test_part[]` trong 1 `db.batch`.
- `packages/api/src/contracts.ts`: `examImportPublishSchema` (`draft`, `reviewConfirmed`), mã `REVIEW_CONFIRMATION_REQUIRED`, `TOO_MANY_PARTS`.

## Steps

1. `PATCH /draft`: role owner/teacher, org-scoped, job `completed`; validate; UPDATE `draft_json`. Không import/gọi service ví.
2. `POST /publish`: validate; `published_test_id` có → trả test cũ; đếm `needsReview` → nếu > 0 và `!reviewConfirmed` → 422; kiểm skill ≠ `mixed`, số part ≤ số slot; map câu qua `assignmentQuestionSchema.parse`; batch INSERT prompts + test + parts, UPDATE job `published_test_id` + lưu draft cuối.
3. Trả `{ testId }`.

## Verify

- Test: lưu nháp không ghi log ví; publish thiếu xác nhận → 422; publish đủ → test `ready` đúng số slot; publish 2 lần → cùng `testId`; part vượt slot → 422; org khác → 404.
