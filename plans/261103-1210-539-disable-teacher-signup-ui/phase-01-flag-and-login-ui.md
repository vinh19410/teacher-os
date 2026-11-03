---
phase: 1
title: "Cờ VITE_TEACHER_SIGNUP_ENABLED và giao diện /login"
status: done
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Cờ và giao diện `/login`

## Goal

Khi cờ tắt (mặc định), `/login` chỉ có đăng nhập; khi bật, giao diện giữ nguyên như hiện nay.

## Files to Modify

- `packages/env/src/web.ts` — thêm `VITE_TEACHER_SIGNUP_ENABLED: z.string().optional()`.
- `apps/web/src/lib/features.ts` — thêm `export const TEACHER_SIGNUP_ENABLED = env.VITE_TEACHER_SIGNUP_ENABLED === "true";`.
- `apps/web/src/routes/login.tsx` — theo cờ.

## Steps

1. Thêm biến env và hằng số cờ như trên (comment ngắn: giai đoạn single-org, bật lại bằng biến build).
2. `login.tsx`: khởi tạo `mode` bằng `"signin"` khi cờ tắt (bỏ qua `localStorage`); khi cờ bật giữ logic cũ.
3. Khi cờ tắt: không render `AuthTabs`, không render `SignUpForm`, không render đoạn `<p>` chuyển tab; tiêu đề/mô tả cố định theo nhánh signin; `changeMode` không còn đường tới `signup`.
4. Khi cờ bật: không đổi hành vi (kể cả tab mặc định signup).

## Validation

- `pnpm --filter web test` (test mới ở phase 2) và `pnpm check-types`.
- Chạy `pnpm --filter web exec vite` không đặt biến, mở `http://localhost:8001/login`: chỉ có đăng nhập + Google. Đặt biến `true`: thấy lại tab.

## Risk / Rollback

- Rủi ro thấp, thuần giao diện. Rollback: đặt `VITE_TEACHER_SIGNUP_ENABLED=true` hoặc revert commit.
- `emptyStringAsUndefined` đã bật nên biến rỗng cũng là tắt.
