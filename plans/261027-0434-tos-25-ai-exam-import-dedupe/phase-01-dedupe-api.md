---
phase: 1
title: "API chống trùng mã băm"
status: completed
effort: 3h
---

# Phase 1 — API chống trùng mã băm

## Files

- `apps/server/src/lib/exam-import/dedupe.ts` (+ test): `findCompletedImportByFingerprint(db, orgId, fingerprint)` — query `exam_import_job` theo `(org_id, content_fingerprint)` với `import_status = 'completed'` **và `draft_json IS NOT NULL`** (job completed-mất-draft từ nhánh settled-retry sau crash không được tính trùng — red-team #2), order `completed_at desc, started_at desc, id` (tiebreaker deterministic — red-team #8) `limit 1`; trả row + `title` parse từ `draft_json` (`extractedExamDraftSchema.safeParse`, hỏng → fallback `fileName`, không ném — red-team #3).
- `apps/server/src/routes/exam-imports.ts`: `GET /api/exam-imports/lookup` **đăng ký TRƯỚC `router.get("/exam-imports/:id")`** (red-team #4 — khoá hành vi bằng test), nhánh trùng trong `POST`.
- `packages/api/src/contracts.ts`: `fingerprintSchema` (`/^[a-f0-9]{64}$/`), `examImportDuplicateSchema` (`{ jobId, title: string|null, completedAt }`), `examImportLookupResponseSchema` (`{ duplicate: examImportDuplicateSchema | null }`), `examImportCreateResponseSchema` = union `examImportJobSchema | { duplicateOf: examImportDuplicateSchema }` (red-team #1).

## Steps

1. `findCompletedImportByFingerprint` như trên — không có row khớp → `null`.
2. `GET /lookup?fingerprint=`: gate `kernelCtx` + `canImportExam` (teacher/owner như POST — red-team #5, chống oracle dò fingerprint), validate hex 64 ký tự (sai → 400 `INVALID_FILE`), trả `{ duplicate }` (`null` nếu không trùng). Org-scoped luôn (D6).
3. `POST`: ngay sau khi tính `sha256Hex(data)` server-side, **trước** `ensureWallet` / INSERT job / `reserveCredits` / lưu R2 — gọi `findCompletedImportByFingerprint`; có → trả 200 `{ duplicateOf: { jobId, title, completedAt } }` (shape thống nhất với lookup — red-team #1), không đụng ví/R2/log.

## Verify

- Test: trùng → extractor spy 0 lần, `credit_usage_log` không thêm dòng, ví không đổi; org khác → không trùng; job `failed_refunded` → không trùng; job `completed` `draft_json` NULL → **không** trùng (cho import lại); fingerprint sai format → 400; role `ta` gọi lookup → 403; `GET /lookup` trả 200 đúng handler (không bị `/:id` nuốt — test khoá thứ tự đăng ký); response `{ duplicateOf }` parse được bằng `examImportCreateResponseSchema`.
