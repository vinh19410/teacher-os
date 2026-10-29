---
phase: 3
title: "E2E AC-001"
status: pending
effort: 0.75d
---

# Phase 3 — E2E AC-001

## Files

- Tạo `apps/e2e/specs/ai-grading-ac-001.spec.ts`.
- Sửa `apps/e2e/src/boot.ts`: inject `fakeAiGrader` (trả điểm cố định 6.5/7.0/6.0/6.5 + nhận xét), seed ví đủ Credit.

## Steps

1. Học viên (cổng student) nộp bài Writing → chi tiết attempt `awaiting-grade` "Đã nộp — Đang chờ giáo viên chấm", không có điểm; API học viên không chứa field draft (BR-001).
2. Giáo viên mở `/grading/:attemptId` → thấy panel "Gợi ý từ AI" với 4 điểm + nhận xét, badge "AI đã chấm nháp"; số dư ví giảm 1.
3. Giáo viên sửa 1 tiêu chí, "Lưu bản nháp" → badge "Đang rà soát"; học viên vẫn không thấy điểm.
4. "Chốt trả bài" → học viên reload thấy điểm cuối cùng.

## Verify

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- ai-grading-ac-001`
