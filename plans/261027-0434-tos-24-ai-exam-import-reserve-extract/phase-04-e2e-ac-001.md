---
phase: 4
title: "E2E AC-001"
status: pending
effort: 3h
---

# Phase 4 — E2E AC-001

## Files

- Tạo `apps/e2e/specs/ai-exam-import-ac-001.spec.ts` (theo cấu trúc spec hiện có trong `apps/e2e/specs`).
- Fixture `apps/e2e/fixtures/exam-import/cambridge-sample.pdf` (2 trang, nhỏ, tự tạo — không dùng tài liệu có bản quyền).

## Steps

1. Seed org có ví 30 Credit; đăng nhập teacher.
2. Mở `/assignments/tests/new` → bấm "Nhập đề bằng AI (5 Credit)" → upload fixture.
3. Assert: cột trái có "Trang 1 / 2", zoom hoạt động; cột phải có passage + câu hỏi từ `fakeExamExtractor`; đúng 1 nhãn "(!) Cần rà soát lại"; badge ví hiển thị 25 Cr sau khi reload.
4. Viewport 375×812: hiển thị 2 tab.

## Verify

- `E2E_API_PORT=8100 E2E_WEB_PORT=8101 E2E_STUDENT_PORT=8103 E2E_ADMIN_PORT=8104 pnpm --filter e2e e2e -- ai-exam-import-ac-001` pass; sau đó chạy full suite trước khi merge.
