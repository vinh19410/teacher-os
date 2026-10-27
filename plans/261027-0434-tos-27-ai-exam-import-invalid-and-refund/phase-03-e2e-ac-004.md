---
phase: 3
title: "E2E AC-004"
status: completed
effort: 3h
---

# Phase 3 — E2E AC-004

## Files

- `apps/e2e/specs/ai-exam-import-ac-004.spec.ts`.
- Fixture sinh lúc chạy test (không commit file lớn): PDF 21 trang, PDF có mật khẩu (`apps/e2e/fixtures/exam-import/protected.pdf`, nhỏ), file > 15 MB tạo bằng `Buffer.alloc` trong test.
- `apps/e2e/src/boot.ts`: `fakeExamExtractor` lỗi khi tên tệp chứa `ai-fail` (để chạy scenario 2 qua stack thật).

## Steps

1. Scenario 1: lần lượt chọn 3 tệp sai → thấy E-003, số dư ví không đổi, không có request `POST /api/exam-imports`.
2. Scenario 2: upload `ai-fail.pdf` → thấy E-004 + nút "Thử bóc tách lại AI"; số dư ví không đổi sau reload.

## Verify

- `pnpm --filter e2e e2e -- ai-exam-import-ac-004` pass với port override 8100/8101/8103/8104.
