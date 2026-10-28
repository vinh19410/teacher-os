---
phase: 3
title: "E2E AC-003"
status: pending
effort: 0.5d
---

# Phase 3 — E2E AC-003

## Files

- Tạo `apps/e2e/specs/ai-grading-ac-003.spec.ts`; seed org gói tháng `active`, ví 0, sổ cái sẵn 29 dòng `quick_grade_writing` trong tháng hiện tại.

## Steps

1. Scenario 1: học viên nộp Writing → [7] có nhãn "Bản nháp chấm nhanh" + điểm gợi ý; ví vẫn 0.
2. Scenario 2: nộp thêm 1 bài (lượt 31) → [7] hiện E-002 + nút "Nạp thêm Credit", không có điểm AI.

## Verify

- `pnpm --filter e2e e2e -- ai-grading-ac-003` với port 8100/8101/8103/8104.
