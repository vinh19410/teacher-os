---
phase: 3
title: "E2E AC-003"
status: pending
effort: 2h
---

# Phase 3 — E2E AC-003

## Files

- `apps/e2e/specs/ai-exam-import-ac-003.spec.ts` (fixture + `fakeExamExtractor` của TOS-24: có 1 câu `needsReview`).

## Steps

1. Upload → sửa đáp án câu gắn nhãn → "Lưu bản nháp" → reload thấy nội dung đã sửa; số dư ví không đổi so với sau bóc tách.
2. Assert "Lưu vào Ngân hàng đề" disabled; tích hộp kiểm → enabled; bấm → tới `/assignments/tests/<id>` và đề có trong danh sách đề.

## Verify

- `pnpm --filter e2e e2e -- ai-exam-import-ac-003` pass với port override 8100/8101/8103/8104.
