---
phase: 1
title: "Trạng thái gói tối thiểu và hạn mức Chấm nhanh"
status: pending
effort: 0.75d
---

# Phase 1 — Trạng thái gói tối thiểu và hạn mức Chấm nhanh

## Files

- Sửa `packages/db/src/schema/credit-wallet.ts` + migration kế tiếp: cột `plan_kind`, `plan_status`.
- Sửa `apps/server/src/lib/credits/wallet.ts`: `readOrgPlan`, `claimQuickGradeSlot(db, { orgId, attemptId, now })`, `revertQuickGradeSlot`, `QUICK_GRADE_MONTHLY_LIMIT = 30` (contract).
- Sửa `apps/server/src/lib/ai-grading/run-grading.ts` theo D3; `grader.ts` nhận `mode`.

## Steps

1. Ranh giới tháng: tính `[start, end)` theo `Asia/Saigon` (helper ngày hiện có trong `packages/api/src/lib` nếu có, không thì thêm hàm thuần + test).
2. `claimQuickGradeSlot`: một câu `INSERT INTO credit_usage_log … SELECT … WHERE (SELECT settled − reverted trong tháng) < 30`; trả `true` nếu chèn được dòng.
3. Rẽ nhánh `runAiGrading`; E-001/E-002 ghi `error_code`.

## Tests

- `wallet.test.ts`: 29 → claim OK; 30 → false; claim trùng attempt → không đếm 2 lần; 2 claim song song khi còn 1 → 1 true; sang tháng mới → OK; revert trả lại lượt.
- `run-grading.test.ts`: các nhánh quick / E-002 / E-001 (Writing không gói tháng, Speaking).

## Verify

- `pnpm --filter server test -- wallet ai-grading`
