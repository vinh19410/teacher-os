---
phase: 1
title: "Schema, grader và pipeline chấm nháp"
status: pending
effort: 1d
---

# Phase 1 — Schema, grader và pipeline chấm nháp

## Files

- Tạo `packages/db/src/schema/ai-grading-draft.ts` (+ export trong `index.ts`), migration kế tiếp sau `0053_*` trong `packages/db/src/migrations/`.
- Tạo `apps/server/src/lib/ai-grading/grader.ts` (interface `AiGrader`, schema zod kết quả, chuẩn hoá bước 0.5), `fake-grader.ts`, `run-grading.ts` (`runAiGrading`, `scheduleAiGrading`), `release-stale.ts` (`releaseStaleGradings`, ngưỡng 60s).
- Sửa `apps/server/src/index.ts` (adapter `createWorkersAiGrader` dùng binding `AI`), `apps/server/src/app.ts` (inject `grader` vào deps), `apps/server/src/routes/student.ts` (gọi `scheduleAiGrading` sau khi set `submitted` cho attempt Writing/Speaking).
- Contract: `packages/api/src/contracts.ts` thêm `AI_GRADING_STATUSES`, `AI_GRADING_COST = { writing: 1, speaking: 2 }`.

## Steps

1. Schema D1 theo plan D1; index `(org_id, status)` cho hàng chờ; `version` default 1.
2. `runAiGrading(deps, attemptId)`: insert draft `ai_processing` (ON CONFLICT DO NOTHING → đã có draft thì thoát, chống gọi trùng) → `reserveCredits` key `ai_grading:<attemptId>:reserve` → `InsufficientCreditsError` ⇒ draft `manual_pending`, `error_code = null` (TOS-32 thay nhánh này) → `grader.grade` với `AbortSignal.timeout(30_000)` → thành công `settleCredits` + `ai_drafted` + `drafted_at`; lỗi `releaseCredits` + `manual_pending`.
3. Speaking: lấy transcript qua `Transcriber` stub (trả `""`) → transcript rỗng ⇒ `manual_pending` không reserve (TOS-31 thay).
4. `releaseStaleGradings(db, orgId)`: draft `ai_processing` quá 60s → release + `manual_pending`; gọi ở đầu `GET /api/grading` và `GET /api/grading/:attemptId`.

## Tests

- `run-grading.test.ts`: happy path settle; lỗi grader → release; timeout (fake treo) → release; thiếu Credit → manual_pending không có log; gọi 2 lần cùng attempt → 1 cặp log; điểm 6.3 → 6.5.
- `student.test.ts`: nộp Writing gọi `scheduleAiGrading`; nộp bài trắc nghiệm không gọi.

## Verify

- `pnpm --filter server test -- ai-grading student`
