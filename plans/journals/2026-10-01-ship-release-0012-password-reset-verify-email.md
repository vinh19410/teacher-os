---
title: "Ship release v0.0.12 — reset mật khẩu và trang verify email lên main"
date: 2026-10-01
type: ship
---

# Ship release v0.0.12 — reset mật khẩu và trang verify email lên main

## Bối cảnh

- Promotion `develop` → `main` gộp hai mảng work đã ship beta lên develop:
  - **#292 quên/đặt lại mật khẩu qua email** cho cả teacher + student portal (11 commit): auth flow với background send qua `waitUntil`, role gate theo cổng đích, token hết hạn 1 giờ, thu hồi session khi đổi mật khẩu, redact token trong log HTTP, trang forgot/reset tiếng Việt, e2e cả 2 portal.
  - **#297 trang xác nhận email sau verify** cho cả 2 cổng (4 commit): route `/verify-email` + card trạng thái + gửi lại link, fix TanStack Router `parseSearch` dùng `JSON.parse` làm marker `?verified=1` bị prune (đổi thành `?verified=ok`), e2e khoá DB assert `email_verified=1`.
- Cả hai đã full-gate ở giai đoạn beta: #292 có bộ check/check-types/unit/e2e local + 2 báo cáo code review (correctness + security) trong `plans/261001-0336-forgot-password-email-reset/reports/`; #297 đi qua `ak:review-pr --fix --reply` trước khi merge PR #298.

## Quyết định

- Skip merge `origin/main` vào develop: 5 commit main-only đều là promotion merge commit thuần (PR #226/#244/#277/#289/#294), zero content delta — cùng lập luận precedent #277/#289/#294.
- Bump patch 0.0.11 → 0.0.12, không minor, theo convention release của repo.
- `pnpm check` fail cục bộ chỉ trên máy dev: 3 git worktrees sạch trong `.claude/worktrees/` chứa `biome.json` (`root: true`) lồng nhau khiến Biome 2.x báo "nested root configuration" và thoát trước khi lint. Scoped biome trên 597 file tracked = 0 lỗi. CI không có thư mục untracked này nên gate CI green. Không xóa worktrees — ngoài phạm vi ship, quyết định để user.
- Không thêm mục runbook: v0.0.12 không có env mới, không migration mới, không đổi workflow deploy; mail reset/verify dùng chung infra Resend đã tài liệu ở mục "Email verification (Resend) — issue #259".
- Tests gate: `pnpm check-types` PASS 7/7 (turbo --force, không cache), `pnpm test` PASS 1859 tests (web 1175, server 448, student 136, auth 67, infra 17, landing 5, ci-workflow 3/3, topology-drift 8/8), e2e do CI trên PR đảm nhiệm (chỉ trigger target `main`).

## Kết quả review

Code-reviewer 2 pass trên diff promotion: **0 critical, 8 informational**. Không secrets, không auth bypass, không route conflict, không scope creep (63/63 file thuộc #292/#297 + docs).

Finding đáng chú ý nhất (follow-up): token verify-email vẫn lộ trong access log server — `apps/server/src/log-redaction.ts` hiện chỉ redact token reset-password; Hono logger in cả query string. Nên mở rộng regex che cả `/api/auth/verify-email?token=…` ngay sau promotion.

## Việc còn lại

- Sau deploy prod: smoke thử quên/đặt lại mật khẩu và landing verify-email bằng mail thật trên cả 2 cổng.
- Mở rộng redaction cho token verify-email trong `apps/server/src/log-redaction.ts`.
- Dọn 3 worktrees sạch trong `.claude/worktrees/` trên máy local để `pnpm check` chạy green.
