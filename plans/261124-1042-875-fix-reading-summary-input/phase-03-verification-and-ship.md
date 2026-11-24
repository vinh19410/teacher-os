---
title: "Phase 3: Kiểm thử toàn diện, Code Review & Ship"
status: todo
---

# Phase 3: Kiểm thử toàn diện, Code Review & Ship

## Mục tiêu

Xác minh toàn bộ các thay đổi trên mọi bề mặt (`@teacher-os/ui`, `@teacher-os/api`, `apps/student`, `apps/server`), chạy code review độc lập (`code-reviewer`), chuẩn bị bằng chứng POT, mở PR, merge vào `develop` và kiểm tra CI.

## Nhiệm vụ cụ thể

1. **Kiểm thử tự động cục bộ:**
   - `pnpm --filter @teacher-os/api test`
   - `pnpm --filter @teacher-os/ui test`
   - `pnpm --filter student test`
   - `pnpm --filter server test`
   - Chạy spec E2E lẻ liên quan nếu cần: `pnpm --filter e2e e2e specs/student-quiz-inline-answers.spec.ts` (không chạy full suite E2E ở local theo quy định `AGENTS.md`).
   - `pnpm check-types`
   - `pnpm exec biome check .`

2. **Code Review độc lập:**
   - Chạy subagent `code-reviewer` kiểm tra edge cases, bảo mật, và khả năng tương thích ngược.
   - Xử lý triệt để mọi phát hiện Important / Critical (nếu có).

3. **Ship PR beta & Merge:**
   - Cập nhật issue #875 trạng thái và labels (`ready to cook` -> `in progress` -> `ready to ship beta`).
   - Mở PR tới branch `develop` với tiêu đề và mô tả chuẩn conventional commit.
   - Merge PR vào `develop`.
   - Giám sát CI trên branch `develop` đến khi hoàn tất xanh.

4. **Đăng POT (Proof of Test):**
   - Đăng comment POT lên issue #875 với đầy đủ bằng chứng kiểm thử (kết quả test lệnh, diff, commit SHA, PR link).

## Tiêu chí hoàn thành

- PR được merge vào `develop` thành công.
- CI develop xanh hoàn toàn.
- Issue #875 có comment POT chi tiết theo đúng quy ước `AGENTS.md`.
