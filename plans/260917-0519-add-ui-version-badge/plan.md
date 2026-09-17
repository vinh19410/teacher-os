---
title: "Add UI Version Badge"
description: "Hiển thị badge nhỏ v{version} trên sidebar web app, version inject từ root package.json lúc build để biết deploy đang chạy release nào."
status: completed
priority: P3
effort: 1h30m
issue: 161
branch: vinh19410/feat/ui-version-badge
tags: [feature, frontend]
blockedBy: []
blocks: []
created: 2026-09-17
---

# Add UI Version Badge

## Overview

Thêm một badge nhỏ hiển thị version đang chạy (ví dụ `v0.0.3`) vào sidebar của web app. Version được đọc từ **root `package.json`** (nguồn truth của release — được bump qua commit `chore(release)`) và inject vào client bundle lúc build bằng Vite `define`, không fetch runtime, không thêm API.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Inject version từ root `package.json` vào bundle web app lúc build | P2 |
| 2 | Badge `v{version}` nhỏ gọn trên sidebar, đúng design system hiện tại | P2 |
| 3 | Có unit test và verification commands chạy được trong CI | P3 |

## Key Decisions

- **Nguồn version: root `package.json`** (hiện `0.0.3`), không phải `apps/web/package.json` (`0.0.0`). Root là nơi quy trình release bump version (xem commit `55b78fe chore(release): bump version to 0.0.3`).
- **Cơ chế inject: Vite `define` với global `__APP_VERSION__`** trong `apps/web/vite.config.ts` (file này đã import `node:fs/promises` và `node:path`). Không import `package.json` trực tiếp vào code client vì sẽ inline toàn bộ file (leak danh sách dependencies vào bundle) và hành vi dev/build không đồng nhất.
- **Vị trí badge: sidebar, cạnh logo "Teacher OS"** — dùng chip mono nhỏ theo pattern "PRO" badge sẵn có (`rounded-full px-[7px] py-px font-mono text-[10px]`). Khi sidebar collapsed, badge ẩn cùng nhóm text logo (`app:hidden`, invariant D10).
- **Tách component `VersionBadge`** riêng để unit test đơn giản, không cần wrap Router context như khi test `Sidebar` trực tiếp.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Build-time Version Injection](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Version Badge UI](./phase-02-version-badge-ui.md) | Completed |

<!-- IMPORTANT: Link text MUST be human-readable names (not filenames). -->

## Success Criteria

- [x] `__APP_VERSION__` tồn tại ở client, giá trị trùng `version` trong root `package.json` tại thời điểm build
- [x] Badge `v{version}` hiển thị trên sidebar (desktop expanded), tự ẩn khi sidebar collapsed, có `data-testid="app-version"`
- [x] `pnpm -F web test` pass (bao gồm test mới cho `VersionBadge`)
- [x] `pnpm -F web check-types` pass (gồm `vite build` nên xác nhận define hoạt động trong build thật)
- [x] `pnpm check` (biome) pass

## Dependencies

- Không có cross-plan dependency. Task độc lập, chỉ chạm `apps/web`.

## Red Team Review

### Reviewers: Security Adversary, Assumption Destroyer
- **Security Adversary**: Verified Vite `define` string injection. Only `rootPkg.version` string is bundled; no manifest dependencies or env secrets leaked. Disposition: Accept.
- **Assumption Destroyer**: Verified `import.meta.dirname` compatibility (Node v26.9.0 is well above Node v20.19 minimum). Verified test runner uses `react-dom/server` (`renderToStaticMarkup`) in `apps/web/src/components/not-found.test.tsx`, so `version-badge.test.tsx` should follow this pattern.

### Whole-Plan Consistency Sweep
- Contradictions: None.
- Unresolved findings: 0.

## Validation Log

### Verification Results
- Claims checked: 5
- Verified: 5 | Failed: 0 | Unverified: 0
- Tier: Light
- Codebase evidence:
  - Root `package.json:3`: `"version": "0.0.3"`
  - `apps/web/vite.config.ts:1-2`: `import fs from "node:fs/promises"`, `import path from "node:path"`
  - `apps/web/src/components/layout/sidebar.tsx:238-246`: Logo text with `collapsed && "app:hidden"`
  - `apps/web/src/components/ui/badge.tsx:4,11`: `variant="muted"` with `bg-line-soft text-muted-fg`
  - `apps/web/src/components/not-found.test.tsx:1`: `renderToStaticMarkup` test convention

### Whole-Plan Consistency Sweep
- Phase links and file references valid.
- Status: Validated, ready for cook.
