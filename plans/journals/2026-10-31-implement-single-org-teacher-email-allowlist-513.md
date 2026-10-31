---
title: "Implement single-org teacher email allowlist (#513)"
date: 2026-10-31
summary: "Khoá đăng ký và truy cập app giáo viên bằng allowlist TEACHER_EMAILS (fail-closed trên production), giữ nguyên schema multi-org và cập nhật runbook/roadmap."
---

# Implement single-org teacher email allowlist (#513)

## What happened
Triển khai plan #513 (`plans/261031-1759-513-single-org-owner-mode/plan.md`) chuyển app giáo viên sang chế độ single-org theo chính sách bằng binding `TEACHER_EMAILS`:
- Thêm `resolveTeacherEmails(raw, appDomain)` trong `packages/infra/src/topology.ts` (fail-closed trên `PROD_APP_DOMAIN` khi rỗng hoặc chỉ có dấu phẩy) và gắn vào Worker `server` (`packages/infra/alchemy.run.ts`) cùng `.github/workflows/deploy.yml` và `deploy-staging.yml`.
- Thêm 2 mã lỗi `TEACHER_SIGNUP_FORBIDDEN` và `TEACHER_NOT_ALLOWED` trong `packages/api/src/contracts.ts`.
- Chặn sign-up role `teacher` ngoài allowlist ở `databaseHooks.user.create.before` (`packages/auth/src/index.ts`) và chặn mỗi request kernel ở `bootstrapMiddleware` (`apps/server/src/app.ts`) trước khi tạo `organization`/`membership`.
- Mở rộng `isStudentRoleRejected` (`apps/web/src/lib/repos/kernel.ts`) và `AccountBlockedView` để xử lý `ACCOUNT_TEACHER_NOT_ALLOWED`.
- Cập nhật `packages/infra/.env.example`, `docs/production-release-runbook.md`, `docs/project-roadmap.md`, `docs/system-architecture.md` và `CHANGELOG.md`.

## Decision
Giữ nguyên schema multi-org (`organization`, `membership`, `orgId`) để khi qua cổng thương mại hoá không phải retrofit phân tách tenant. Rỗng trên dev/e2e/staging giữ nguyên hành vi không giới hạn; trên production bắt buộc set `TEACHER_EMAILS`.

## Next steps
Người vận hành cần đặt biến `TEACHER_EMAILS` trên GitHub Environment `production` (`gh variable set TEACHER_EMAILS --env production --body "<email-chủ-app>"`) trước lần merge `develop` → `main` kế tiếp.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
