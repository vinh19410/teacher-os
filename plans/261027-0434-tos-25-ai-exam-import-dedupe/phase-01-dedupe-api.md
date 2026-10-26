---
phase: 1
title: "API chống trùng mã băm"
status: pending
effort: 3h
---

# Phase 1 — API chống trùng mã băm

## Files

- `apps/server/src/lib/exam-import/dedupe.ts` (+ test): `findCompletedImportByFingerprint(db, orgId, fingerprint)`.
- `apps/server/src/routes/exam-imports.ts`: `GET /api/exam-imports/lookup`, nhánh trùng trong `POST`.
- `packages/api/src/contracts.ts`: `examImportLookupSchema`, `fingerprintSchema` (`/^[a-f0-9]{64}$/`), thêm `duplicateOf` vào response POST.

## Steps

1. Query `exam_import_job` theo `(org_id, content_fingerprint)` với `import_status = 'completed'` order `completed_at desc limit 1`.
2. `GET /lookup?fingerprint=` validate hex 64 ký tự (sai → 400), trả `{ duplicate }`.
3. `POST`: sau khi tính fingerprint server-side, gọi `findCompletedImportByFingerprint` **trước** lưu R2 / INSERT job / `reserveCredits`; có → trả 200 `{ duplicateOf: { jobId, title, completedAt } }`.

## Verify

- Test: trùng → extractor spy 0 lần, `credit_usage_log` không thêm dòng, ví không đổi; org khác → không trùng; job `failed_refunded` → không trùng; fingerprint sai format → 400.
