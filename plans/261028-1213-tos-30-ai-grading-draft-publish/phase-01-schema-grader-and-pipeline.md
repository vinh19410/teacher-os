---
phase: 1
title: "Schema, grader và pipeline chấm nháp"
status: pending
effort: 1d
---

# Phase 1 — Schema, grader và pipeline chấm nháp

## Files

- Tạo `packages/db/src/schema/ai-grading-draft.ts` (+ export trong `index.ts`), migration kế tiếp sau `0053_*` trong `packages/db/src/migrations/` (drizzle-kit generate).
- Sửa `apps/server/src/lib/credits/wallet.ts`: `CreditMutationInput` thêm `actionType?: "exam_import" | "ai_grading"` (default `exam_import`) — quyết prefix idempotency key lẫn cột `action_type`.
- Tạo `apps/server/src/lib/ai-grading/grader.ts` (interface `AiGrader`, validate qua `writingGradeScoresSchema`/`speakingGradeScoresSchema`, chuẩn hoá bước 0.5), `fake-grader.ts`, `run-grading.ts` (`runAiGrading`, `scheduleAiGrading` có fallback fire-and-forget), `release-stale.ts` (`releaseStaleGradings`, ngưỡng 60s, CAS + lọc EXISTS/NOT EXISTS sổ cái), `workers-ai-grader.ts` (adapter + prompt riêng file).
- Sửa `apps/server/src/index.ts` (adapter `createWorkersAiGrader` dùng binding `AI`), `apps/server/src/app.ts` (inject `getAiGrader` vào `AppDeps`), `apps/server/src/routes/student.ts` (gọi `scheduleAiGrading` sau CAS flip thắng), `apps/server/src/routes/credits.ts` (gọi `releaseStaleGradings` cạnh `releaseStaleImports`).
- Contract: `packages/api/src/contracts.ts` thêm `AI_GRADING_STATUSES`, `AI_GRADING_COST = { writing: 1, speaking: 2 }`, `AI_GRADING_ERROR_CODES`.

## Steps

1. Schema D1 theo plan D1; index `(org_id, status)` cho hàng chờ; `version` default 1.
2. `runAiGrading(deps, attemptId)`: insert draft `ai_processing` (ON CONFLICT DO NOTHING) → Speaking transcript rỗng ⇒ CAS `manual_pending`, thoát không reserve → `ensureWallet` + `reserveCredits` key `ai_grading:<attemptId>:reserve`, `actionType: "ai_grading"` → `InsufficientCreditsError` ⇒ CAS `manual_pending`, `error_code = null` → `grader.grade` — pipeline TỰ race deadline `AI_GRADING_TIMEOUT_MS` = 20s (grader bỏ qua signal vẫn cắt; transcript giữ lại truyền vào grader cho TOS-31) → thành công: **CAS UPDATE `ai_processing → ai_drafted`** — thắng mới `settleCredits`; thua CAS → `releaseCredits` idempotent. Lỗi/timeout: CAS `ai_processing → manual_pending` + `releaseCredits`.
3. `releaseStaleGradings(db, orgId)`: nhóm 1 — `ai_processing` quá 60s → CAS `manual_pending` (thua CAS → bỏ qua) → release nếu có log reserve; nhóm 2 — `ai_drafted`/`manual_pending` quá hạn có reserve chưa settle/release (EXISTS/NOT EXISTS trong SQL) → trả held, giữ trạng thái. Gọi ở `GET /api/grading`, `GET /api/grading/:attemptId`, `GET /api/credits/wallet`.
4. `scheduleAiGrading(deps, attemptId)`: trả promise; có `runInBackground` → wrap; không → fire-and-forget đã catch log.

## Tests

- `run-grading.test.ts` (11): happy settle (6.3 → 6.5); grader lỗi; treo quá hạn; thiếu Credit không log; org chưa có ví → ensureWallet; gọi 2 lần → 1 cặp log; teacher publish trước → CAS thua + release; attempt chưa nộp không tạo draft; binding thiếu → DISABLED; hằng timeout < 30s; practice vẫn chấm; sweep 5 nhánh (cũ/mới/org lạ/crash-sau-CAS/đã settle).
- `workers-ai-grader.test.ts` (4): signal hết hạn giữ `TimeoutError`; markdown fence parse; điểm lệch bước + thiếu key FAILED; Speaking key sai bộ FAILED.
- `wallet.test.ts`: actionType ai_grading key/action_type; exam_import cùng refId không chạm key.
- `student-quiz.test.ts`: submit Writing tạo draft (DISABLED path), Reading không tạo.

## Verify

- `pnpm --filter server test -- ai-grading student`
