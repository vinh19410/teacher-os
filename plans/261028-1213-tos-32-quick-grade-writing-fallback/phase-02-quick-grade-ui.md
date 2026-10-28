---
phase: 2
title: "UI Chấm nhanh và cảnh báo hết Credit"
status: pending
effort: 0.25d
---

# Phase 2 — UI Chấm nhanh và cảnh báo hết Credit

## Files

- Sửa `apps/web/src/components/grading/ai-draft-panel.tsx`: badge "Bản nháp chấm nhanh"; banner E-001 / E-002 (thông điệp lấy từ map lỗi trong `packages/api/src/contracts.ts`) + nút "Nạp thêm Credit".
- Hàng chờ `/grading`: badge chế độ chấm nhanh.

## Tests

- Test component: badge theo `gradingMode`; banner + nút theo `errorCode`.

## Verify

- `pnpm --filter web test -- grading`; screenshot 3 viewport.
