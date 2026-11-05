---
phase: 1
title: "Nâng lên beta.85, vẫn dùng store hiện tại"
status: in-progress
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Nâng lên beta.85, vẫn dùng store hiện tại

## Goal

`Deploy Staging` chạy được với store v8 mà không thay đổi resource đang chạy.

## Files to Create / Modify

- Modify: `packages/infra/package.json`, `packages/infra/alchemy.run.ts`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`
- Modify: `.github/workflows/deploy-staging.yml`, `docs/production-release-runbook.md`, `CHANGELOG.md`

## Tasks & Steps

1. Nâng `alchemy`, thêm `@alchemy.run/cloudflare`, nâng `effect` và `@effect/platform-*`.
2. Đổi `Config.string`/`redacted` thành `Config.String`/`Redacted`, `migrationsDir` thành `migrations`.
3. Ghim `@cloudflare/workers-types` để `drizzle-orm` không tách peer variant.
4. Thêm input `dry_run` vào `deploy-staging.yml` kèm test pin biểu thức.
4a. Trỏ `migrations` vào thư mục phẳng chỉ chứa `.sql`, vì Alchemy từ chối `meta/_journal.json` mà dry-run không phát hiện.
4b. Ghim compatibility date của 6 Worker ở `2026-03-17`.
5. Merge vào `develop`, chạy dry-run và đọc kế hoạch.
6. Promote lên `staging` nếu kế hoạch an toàn.

## Verification

- `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`.
- Dry-run không có replace hoặc delete cho D1, R2, custom domain.
- `Deploy Staging` xanh; số migration đã áp dụng không đổi.
