---
phase: 1
title: "Gỡ trang /settings phía web"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: Gỡ trang /settings phía web

## Goal
Xoá route `/_auth/settings` và mọi điểm vào UI của nó, giữ `getApiBaseUrl()` ở module dùng chung.

## Files to Create / Modify
- Create: `apps/web/src/lib/repos/api-base-url.ts` — chỉ chứa `getApiBaseUrl()` (chuyển nguyên văn từ `repos/settings.ts:12-14`, kèm import `env` + `getServerUrl`).
- Delete: `apps/web/src/routes/_auth/settings.tsx`, `apps/web/src/routes/_auth/settings.test.tsx`, `apps/web/src/lib/repos/settings.ts`.
- Modify: `apps/web/src/lib/repos/invitations.ts:8`, `apps/web/src/lib/repos/invitations.test.ts:7` — import từ `./api-base-url`.
- Modify: `apps/web/src/components/layout/sidebar.tsx:173-193` — xoá cả nhóm `{ label: "Hệ thống", items: [...] }` (nhóm chỉ có mục Cài đặt).
- Modify: `apps/web/src/components/layout/app-shell.tsx:27` — xoá `"/_auth/settings": "Cài đặt"`.
- Modify: `apps/web/src/routes-matcher.ts:14` — xoá `"/settings": true`.
- Modify: `apps/web/src/routes-matcher.test.ts` — bỏ `"/settings"` khỏi `validStaticRoutes` (:25); thêm `expect(isValidAppRoute("/settings")).toBe(false)` vào test "rejects random unknown paths" (giữ dòng `/settings/extra/nested`).
- Modify: `apps/web/src/lib/profile.contract.test.ts` — xoá test "settings replaces the fake teacher card…" (:109-120) và cả block `describe("billing button (interim — issue #138)")` (từ :128; issue #138 đã CLOSED, nút nằm trong trang bị xoá).

## Tasks & Steps
- [ ] 1. Tạo `api-base-url.ts`, đổi 2 import của invitations. Chạy `pnpm --filter web test -- invitations` xanh trước khi xoá `repos/settings.ts`.
- [ ] 2. Xoá 3 file settings (route, test, repo).
- [ ] 3. Sửa sidebar, app-shell, routes-matcher (+ test), profile.contract.test như trên.
- [ ] 4. Regenerate `routeTree.gen.ts` (gitignored): `pnpm --filter web build` (TanStack router plugin sinh lại cây route).
- [ ] 5. `grep -rn "settings" apps/web/src --include='*.ts' --include='*.tsx' | grep -v routeTree.gen` chỉ còn khớp không liên quan (vd comment trong `lesson-edit-form.tsx:37`).

## Verification
- `pnpm --filter web test` xanh (gồm drift guard routeTree ↔ routes-matcher).
- `pnpm check-types` xanh.
- Thủ công: đăng nhập dev stack, sidebar không còn "Cài đặt"; mở `http://localhost:8001/settings` → hành vi giống `/admin`. Chụp sidebar ở 1440×900, 768×1024, 375×812 (theo `REVIEW.md`) cho PR.
