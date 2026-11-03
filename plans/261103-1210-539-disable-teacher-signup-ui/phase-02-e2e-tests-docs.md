---
phase: 2
title: "Giữ e2e xanh, test cờ và ghi chú vận hành"
status: pending
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: E2E, test và tài liệu

## Goal

E2E vẫn đăng ký giáo viên qua giao diện được; có test khoá hành vi cờ tắt; vận hành biết cách bật lại.

## Files to Modify / Create

- Modify: `apps/e2e/playwright.config.ts` (env của web server, cạnh `VITE_AI_ENABLED`) — thêm `VITE_TEACHER_SIGNUP_ENABLED: "true"`.
- Modify: `apps/e2e/devserver-watchdog.mjs` (env tương ứng, cạnh dòng 146) — thêm cùng biến, để bản restart của watchdog không mất cờ.
- Create: `apps/web/src/routes/login-signup-gate.test.tsx` — test vitest cho route `/login` với `@/lib/features` được mock (mẫu như `import-with-ai-button.test.tsx`).
- Modify: `AGENTS.md` (mục "Lưu ý vận hành", một dòng) — mô tả cờ, mặc định tắt, e2e tự bật.

## Steps

1. Thêm biến vào hai nơi khởi dựng web dev server của e2e; xác nhận không còn nơi thứ ba (`grep -rn VITE_AI_ENABLED apps/e2e .github`) — nếu có thì thêm tương ứng.
2. Viết test: (a) cờ tắt → không có tab/form đăng ký/link, có form đăng nhập, `localStorage` = `signup` vẫn ra đăng nhập; (b) cờ bật → có tab và form đăng ký, mặc định signup.
3. Thêm dòng vào `AGENTS.md`.

## Validation

- `pnpm --filter web test -- login-signup-gate` (hẹp trước), rồi `pnpm --filter web test`, `pnpm check`, `pnpm check-types`.
- `pnpm --filter e2e e2e` đầy đủ với cổng 8100/8101/8103 (theo quy ước repo); ít nhất chạy `signin-validation`, `auth-fail-loudly`, `profile` trước.

## Risk / Rollback

- Nếu bỏ sót một nơi khởi dựng web cho e2e, spec dùng `signUpViaUi` sẽ timeout ở `#su-name`; thông báo lỗi rõ ràng nên dễ phát hiện. Rollback: revert commit.
