---
title: "fix-zoom-host-user-404"
description: "Sửa lỗi Zoom API 404 User does not exist (ZOOM_HOST_USER=Ms My), thêm kiểm tra fail-loud lúc deploy, validate runtime ZOOM_INVALID_CONFIG và dừng sớm vòng lặp."
status: completed
priority: P1
effort: "2h"
tags: [zoom, infra, bugfix, server]
created: 2026-11-27
---

# fix-zoom-host-user-404

## Overview

Khắc phục sự cố `Zoom API lỗi 404: User does not exist: Ms My.` khi tạo link Zoom do biến môi trường GitHub `ZOOM_HOST_USER` trên cả `staging` và `production` đang đặt tên hiển thị (`"Ms My"`) thay vì email tài khoản Zoom hoặc Zoom User ID. Bổ sung lớp phòng ngừa 2 tầng: chặn fail-loud ngay từ bước deploy Alchemy (`resolveZoomHostUser`) và kiểm tra runtime (`ZOOM_INVALID_CONFIG`, ánh xạ 404/`1001`, dừng sớm vòng lặp `autoProvisionMeetingsForNewClass` / `bulkCreateMeetingsForClass`) kèm test và tài liệu vận hành.

## Root Cause

- `ZOOM_HOST_USER` trong GitHub Environment `staging` và `production` đang đặt `"Ms My"`.
- `apps/server/src/lib/zoom/zoom-client.ts` gọi `POST /v2/users/${encodeURIComponent(hostUser)}/meetings` mà không validate định dạng `hostUser`; với Zoom Server-to-Server OAuth, `{userId}` chỉ nhận email tài khoản Zoom hoặc Zoom User ID (không nhận tên hiển thị và `"me"` cũng không ổn định do không có user session).
- `packages/infra/alchemy.run.ts` truyền thẳng `ZOOM_HOST_USER` mà không validate, và `session-zoom-service.ts` không dừng sớm vòng lặp bulk/auto-provision khi gặp lỗi cấu hình host.

## Advisor Scope Lock

- **Locked Scope:**
  - Cập nhật biến `ZOOM_HOST_USER` sang email tài khoản Zoom Pro trên GitHub Environment `staging` và `production` trước khi merge beta PR.
  - Thêm `resolveZoomHostUser` vào `packages/infra/src/topology.ts` và nối vào `packages/infra/alchemy.run.ts`.
  - Thêm mã lỗi additive `INVALID_CONFIG: "ZOOM_INVALID_CONFIG"` vào `packages/api/src/contracts.ts`.
  - Validate `hostUser` trong `createMeeting()` (không chặn `getRecording`/`updateMeeting`/`deleteMeeting`), trim `isZoomConfigured` và `env.ZOOM_HOST_USER`, ánh xạ Zoom `404`/`1001` sang `ZOOM_INVALID_CONFIG`, và dừng sớm `autoProvisionMeetingsForNewClass` + `bulkCreateMeetingsForClass`.
  - Thêm unit tests, drift tests và cập nhật `README.md`, `docs/production-release-runbook.md`, `packages/infra/.env.example`, `CHANGELOG.md`.
- **Explicit Non-Goals:**
  - Không sửa `.github/workflows/deploy.yml` hoặc `.github/workflows/deploy-staging.yml`.
  - Không thêm bước gọi Zoom API thật trong CI smoke checks.
  - Không chạy full E2E ở local (tuân thủ `AGENTS.md`).
  - Không sửa UI (`session-zoom-panel.tsx`, `class-sessions-section.tsx` đã tự hiển thị `err.message`).
  - Không tự promote `develop` lên `main` trong lượt `--beta` này.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Cập nhật `ZOOM_HOST_USER` sang email tài khoản Zoom Pro trên `staging` và `production` trước khi merge beta | P1 |
| 2 | Chặn fail-loud `ZOOM_HOST_USER` không hợp lệ lúc deploy qua `resolveZoomHostUser` | P1 |
| 3 | Validate runtime ở `createMeeting()`, trả `ZOOM_INVALID_CONFIG` rõ ràng và dừng sớm vòng lặp bulk/auto-provision | P1 |
| 4 | Cập nhật docs vận hành, changelog và pass toàn bộ local quality gates + CI staging | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Phase 1: Infra Fail-Loud Guard](./phase-01-start.md) | Done |
| 2 | [Phase 2: Server Runtime Validation & Stop-Early](./phase-02-server-zoom-validation.md) | Done |
| 3 | [Phase 3: Docs, Changelog & Full Verification](./phase-03-docs-and-verification.md) | Done |

## Success Criteria

- [x] `ZOOM_HOST_USER` trên GitHub Environment `staging` và `production` đã được cập nhật sang email tài khoản Zoom Pro.
- [x] `resolveZoomHostUser` chặn `""`, `"me"`, `"Ms My"`, `"MsMy"`, `"Name <a@b.com>"` khi `zoomConfigured=true` và luôn chặn tên hiển thị sai định dạng.
- [x] `createMeeting()` chặn `hostUser` sai định dạng trước khi gọi mạng (`503 ZOOM_INVALID_CONFIG`) và ánh xạ Zoom `404`/`1001` thành `502 ZOOM_INVALID_CONFIG`, không ảnh hưởng `getRecording`/`updateMeeting`/`deleteMeeting`.
- [x] `autoProvisionMeetingsForNewClass` và `bulkCreateMeetingsForClass` dừng sau 1 lần lỗi khi gặp `ZOOM_INVALID_CONFIG`.
- [ ] `pnpm check`, `pnpm check-types`, `pnpm test` xanh 100%, và `deploy-staging.yml` xanh sau khi merge beta PR.

<!-- slug: fix-zoom-host-user-404 -->
