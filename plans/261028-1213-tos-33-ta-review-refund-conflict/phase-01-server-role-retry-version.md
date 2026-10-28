---
phase: 1
title: "Server: phân quyền, retry + hoàn Credit, khóa phiên bản"
status: pending
effort: 1d
---

# Phase 1 — Server: phân quyền, retry + hoàn Credit, khóa phiên bản

## Files

- Sửa `packages/auth/src/role.ts` (+ `role.test.ts`): `canPublishGrade`, `canReviewGrade`.
- Sửa `apps/server/src/routes/grading.ts`: gate publish/draft theo D1; nhận + kiểm `version` (D4); `POST /:attemptId/ai-retry` (D3, D5).
- Sửa `apps/server/src/lib/ai-grading/run-grading.ts`: vòng retry D2 trong ngân sách 30s; release + E-004.
- Migration nhỏ: cột `retry_count` trên `ai_grading_draft`.
- `packages/api/src/contracts.ts`: thông điệp E-004 (bản chấm bài), E-011.

## Tests

- `role.test.ts`: bảng vai trò × quyền.
- `run-grading.test.ts`: lỗi 3 lượt → 1 reserve + 1 release đủ số; lỗi 1 rồi OK → settle; vượt ngân sách → release.
- `grading.test.ts`: TA publish → 403; TA PATCH → OK; version cũ → 409 E-011 và dữ liệu không đổi; ai-retry khi `ai_processing` → 409; ai-retry song song → 1 reserve.

## Verify

- `pnpm --filter auth test`, `pnpm --filter server test -- grading ai-grading`
