---
phase: 3
title: "E2E AC-002"
status: pending
effort: 2h
---

# Phase 3 — E2E AC-002

## Files

- `apps/e2e/specs/ai-exam-import-ac-002.spec.ts` (tái dùng fixture `apps/e2e/fixtures/exam-import/cambridge-sample.pdf` của TOS-24).

## Steps

1. Upload fixture lần 1 → chờ đối chiếu 2 cột; ghi nhận số dư ví (25 Cr).
2. Quay lại màn `[6]` trống, upload lại cùng tệp → assert banner "Phát hiện tệp trùng…" + nút "Mở lại bản nháp cũ (0 Cr)"; số dư vẫn 25 Cr.
3. Bấm nút → cột phải hiển thị đúng bản nháp cũ.

## Verify

- `pnpm --filter e2e e2e -- ai-exam-import-ac-002` pass với port override 8100/8101/8103/8104.
