---
phase: 1
title: "Transcriber và cổng 15 từ"
status: pending
effort: 0.5d
---

# Phase 1 — Transcriber và cổng 15 từ

## Files

- Tạo `apps/server/src/lib/ai-grading/transcriber.ts`, `fake-transcriber.ts`, `word-count.ts` (+ test).
- Sửa `apps/server/src/lib/ai-grading/run-grading.ts` (thay stub TOS-30 theo D3), `apps/server/src/index.ts` (adapter Workers AI), `apps/server/src/app.ts` (inject).
- `packages/api/src/contracts.ts`: `SPEAKING_MIN_WORDS`, `SPEAKING_AI_LIMIT_LABEL`, thông điệp E-009 vào map thông điệp lỗi chung (tái dùng map của TOS-27 nếu có).

## Steps

1. `countMeaningfulWords` + test bảng (rỗng, 14 từ, 15 từ, chỉ từ đệm, có dấu câu).
2. Nhánh Speaking trong `runAiGrading`: STT với `AbortSignal.timeout(30_000)`; lưu transcript; `< 15` ⇒ `manual_pending` + E-009, return trước `reserveCredits`.

## Tests

- `run-grading.test.ts`: transcript 5 từ → grader spy không gọi, không có log Credit, draft E-009; transcript 20 từ → reserve/settle 2; STT ném lỗi → manual_pending không log.

## Verify

- `pnpm --filter server test -- ai-grading`
