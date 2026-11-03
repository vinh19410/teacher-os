---
title: "Google OAuth luôn cho chọn lại tài khoản (cổng học viên bị kẹt Gmail giáo viên)"
description: "Thêm prompt=select_account cho đăng nhập Google để người dùng chọn Gmail khác sau khi bị chặn role mismatch."
status: completed
priority: P2
effort: 1.5h
issue: 545
branch: fix/google-account-chooser
tags: [auth, bug, student]
blockedBy: []
blocks: []
created: 2026-11-03
---

# Plan: Google OAuth luôn cho chọn lại tài khoản

## Outcome

Bấm "Tiếp tục với Google" ở bất kỳ cổng nào (student, web, admin) luôn hiện màn chọn tài khoản của Google. Người dùng vừa bị chặn "Tài khoản giáo viên không thể đăng nhập vào cổng học viên." có thể chọn Gmail khác ngay, không phải tự đăng xuất Google.

## Nguyên nhân (đã scout)

- Khi Google đã có đúng một phiên đăng nhập, Google tự chọn tài khoản đó và bỏ qua màn chọn. `th.vinh102@gmail.com` là role `teacher`, nên `session.create.before` (`packages/auth/src/index.ts`) ném `ROLE_MISMATCH`, người dùng quay về `/login` với toast lỗi.
- Bấm lại nút sẽ lặp đúng vòng đó, vì không có `prompt` ở `socialProviders.google` lẫn ở 3 lời gọi `authClient.signIn.social` (`apps/{student,web,admin}/src/components/**/google-oauth-button.tsx`).
- Role guard đúng, không đổi. Lỗi chỉ ở chỗ không có lối thoát.

## Hướng sửa

Đặt `prompt: "select_account"` một lần ở `socialProviders.google` trong `createAuth`, thay vì ở 3 client. Một chỗ duy nhất, không thể sót app nào, và client cũ cũng được hưởng.

## Non-goals

- Không đổi role guard, thông điệp lỗi, hay allowlist `TEACHER_EMAILS`.
- Không thêm nút "Dùng tài khoản khác" riêng trên toast.
- Không đổi luồng email/password.

## Acceptance criteria

1. URL authorize Google do server sinh ra chứa `prompt=select_account` cho cả 3 origin.
2. Test auth hiện có (role round-trip) vẫn pass.
3. Thủ công: đang đăng nhập Google bằng tài khoản giáo viên, vào cổng học viên, bấm nút, thấy màn chọn tài khoản và đăng nhập được bằng Gmail học viên.
4. `pnpm exec biome check .`, `pnpm check-types`, `pnpm test` pass.

Chi tiết: [phase-01-select-account-prompt.md](phase-01-select-account-prompt.md)
