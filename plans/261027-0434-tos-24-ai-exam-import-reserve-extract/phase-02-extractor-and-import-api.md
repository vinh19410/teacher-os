---
phase: 2
title: "Extractor Workers AI + API nhập đề"
status: pending
effort: 8h
---

# Phase 2 — Extractor Workers AI + API nhập đề

## Mục tiêu

Binding `AI`, extractor có kiểu, route `POST /api/exam-imports` chạy reserve → extract → settle (catch-all release), các route đọc job/file/ví.

## Files

- `packages/infra/alchemy.run.ts`: thêm binding `AI` cho Worker `server`.
- `apps/server/src/index.ts`, `apps/server/src/app.ts`: `AppDeps.getExamExtractor?(): ExamExtractor | undefined`, `AppDeps.getExamImportStore?(): MediaStore | undefined` (dùng bucket `MEDIA`, prefix `exam-imports/`).
- Tạo `apps/server/src/lib/exam-import/extractor.ts` (`ExamExtractor`, `createWorkersAiExtractor(ai)`, `EXAM_EXTRACT_MODEL`), `fake-extractor.ts` (dùng cho test + e2e), `fingerprint.ts` (SHA-256 qua `crypto.subtle.digest`).
- Tạo `apps/server/src/routes/exam-imports.ts` + `exam-imports.test.ts`; mount trong `app.ts`.
- Tạo `apps/server/src/routes/credits.ts` (`GET /api/credits/wallet`).
- `packages/api/src/contracts.ts`: `extractedExamSchema`, `examImportJobSchema`, `EXAM_IMPORT_LIMITS = { maxBytes: 15 * 1024 * 1024, maxPages: 20, timeoutMs: 120_000, reviewConfidence: 0.8 }`, `EXAM_IMPORT_MIME = ["application/pdf", "image/png", "image/jpeg"]`.
- `apps/e2e/src/boot.ts`: inject `fakeExamExtractor` + store đĩa.

## Steps

1. `extractedExamSchema`: `title`, `skill` (`reading|listening|writing|speaking|mixed`), `timeLimitMinutes?`, `parts[]` { `passage`, `questions[]` { `stem`, `opts?`, `answer`, `type?`, `explanation?`, `confidence` } }. Hậu xử lý gán `needsReview = confidence < 0.8 || !answer`.
2. Extractor: `toMarkdown` → `run(EXAM_EXTRACT_MODEL, { messages: [system prompt mô tả schema + ví dụ IELTS], response_format: { type: "json_schema", json_schema } , signal })` → `extractedExamSchema.safeParse`. Parse lỗi → ném `ExtractionFailedError`.
3. `POST /api/exam-imports`: role owner/teacher; đọc multipart `file`; kiểm mime + size (≤ 15 MB, sai → 400 `E-selfomy-alignment-003`); tính fingerprint; `ensureWallet` + `assertStaffCap`; lưu R2; INSERT job `processing`; `reserveCredits(5)` (thiếu → 402 `E-selfomy-alignment-001`, xóa file + job); extract với `AbortSignal.timeout(120_000)`; OK → UPDATE `draft_json`, `completed`, `settleCredits`; lỗi → `releaseCredits`, `failed_refunded`, trả 502 `{ code: "EXAM_IMPORT_FAILED", jobId }`.
4. `GET /api/exam-imports/:id` (org-scoped) trả job + draft; `GET /api/exam-imports/:id/file` stream file gốc với `Content-Type` đúng (`media-response.ts`).
5. `GET /api/credits/wallet` trả `{ balance, held, available }`.

## Success criteria / Verify

- `exam-imports.test.ts` pass: happy path (log reserved + settled, ví −5), thiếu Credit (402, không có job), extractor ném lỗi (released, ví nguyên), org khác không đọc được job/file, mime sai → 400.
- `pnpm --filter server test`, `pnpm check-types`, `pnpm check` pass.
