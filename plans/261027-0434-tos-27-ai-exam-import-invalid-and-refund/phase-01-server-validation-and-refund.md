---
phase: 1
title: "Server: kiểm tệp, phân loại lỗi + hoàn Credit, dọn job treo, thử lại"
status: completed
effort: 6h
---

# Phase 1 — Server: kiểm tệp, hoàn Credit, thử lại

## Files

- `apps/server/package.json`: thêm `unpdf`.
- Tạo `apps/server/src/lib/exam-import/validate-file.ts` (+ test): `inspectExamFile(bytes, mime)` → `{ pageCount } | { error: reason }`.
- Tạo `apps/server/src/lib/exam-import/run-import.ts` (+ test): tách luồng reserve → extract → settle/release khỏi route để `POST` và `retry` dùng chung; `classifyImportError`; `hasValidQuestionGroup`.
- Tạo `apps/server/src/lib/exam-import/release-stale.ts` (+ test).
- `apps/server/src/routes/exam-imports.ts`, `apps/server/src/routes/credits.ts`: gọi validate, stale sweep, thêm `POST /:id/retry`.
- `packages/db/src/schema/exam-import-job.ts`: cột `error_reason` (nullable) + migration.
- `packages/api/src/contracts.ts`: `EXAM_IMPORT_ERROR_MESSAGES`, `examImportErrorSchema`.

## Steps

1. Validate trước lưu R2/job/reserve (D1 của plan); PDF mật khẩu nhận diện qua lỗi `PasswordException` của pdf.js.
2. `runImport`: timeout 120s (`AbortSignal.timeout` + `Promise.race` dự phòng); settle/release đều là UPDATE có điều kiện `import_status = 'processing'` để kết quả về muộn không settle sau khi đã release.
3. `releaseStaleImports(db, orgId)` theo D3; idempotency key `exam_import:<jobId>:release` đảm bảo hoàn 1 lần.
4. `POST /:id/retry` theo D4: chỉ cho job `failed_refunded`, file còn trên R2 (mất → 410).

## Verify

- Test: 18 MB / 25 trang / mật khẩu / sai mime → 400 đúng `reason`, không job, không log; 3 loại lỗi AI → reserved + released, ví nguyên, `E-004`; job treo 151s → release 1 lần dù gọi 2 lần; kết quả AI về sau khi đã release → không settle; retry tạo job mới, settle bình thường.
