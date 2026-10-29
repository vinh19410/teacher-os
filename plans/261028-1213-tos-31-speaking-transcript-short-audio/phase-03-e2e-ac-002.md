---
phase: 3
title: "E2E AC-002"
status: pending
effort: 0.5d
---

# Phase 3 — E2E AC-002

## Files

- Tạo `apps/e2e/specs/ai-grading-ac-002.spec.ts`; fixture audio nhỏ `apps/e2e/fixtures/ai-grading/speaking-ok.webm`, `speaking-short.webm` (vài KB).
- `apps/e2e/src/boot.ts`: inject `fakeTranscriber`.

## Steps

1. Scenario 1: học viên nộp `speaking-ok` → giáo viên mở [7]: thấy trình phát + 3 nút tốc độ, văn bản gỡ băng, nhãn giới hạn phát âm nguyên văn; ví giảm 2.
2. Scenario 2: nộp `speaking-short` → [7] hiện cảnh báo E-009, không có điểm AI; số dư ví không đổi.

## Verify

- `pnpm --filter e2e e2e -- ai-grading-ac-002` với port 8100/8101/8103/8104.
