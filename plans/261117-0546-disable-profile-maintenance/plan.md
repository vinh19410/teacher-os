---
title: "Tạm thời disable page profile sang chế độ đang phát triển"
description: "Bật cờ maintenance mặc định cho toàn bộ apps/profile để msmy.io.vn và profile.staging.teacheros.io.vn hiển thị trang thông báo thuần túy 'Trang web đang trong quá trình phát triển', giữ nguyên source gốc để dễ mở lại."
status: completed
priority: P1
effort: 2h
issue: 749
branch: feat/disable-profile-maintenance
tags: [feature, frontend, infra, ci]
blockedBy: []
blocks: []
created: 2026-11-17
---

# Tạm thời disable page profile sang chế độ đang phát triển

## Overview

Tạm thời tắt toàn bộ website `apps/profile` (`msmy.io.vn`, `www.msmy.io.vn`, `profile.staging.teacheros.io.vn`) bằng cờ cấu hình `apps/profile/maintenance.json` (`{ "disabled": true }`), giữ nguyên toàn bộ source trong `apps/profile/public/**` và các app khác (`app.msmy.io.vn`, `student.msmy.io.vn`, `admin.msmy.io.vn`, `api.msmy.io.vn`). Khi truy cập bất kỳ đường dẫn nào thuộc `msmy.io.vn`, hệ thống hiển thị trang HTML thuần túy `"Trang web đang trong quá trình phát triển"` không kèm nút/link ngoài, gắn `noindex,nofollow` và `Cache-Control: no-cache, no-store, must-revalidate`.

## Goals

| # | Goal | Priority |
|---|---|---|
| 1 | Toàn bộ `apps/profile` (trang chủ `/`, `/kiem-tra-dau-vao/`, `/kiem-tra-dau-vao/ket-qua/`, `/noi-bo/`, và mọi path điều hướng) trả trang thông báo thuần túy `"Trang web đang trong quá trình phát triển"` khi `maintenance.json` bật `disabled: true` | P1 |
| 2 | Giữ nguyên `apps/profile/public/**` và cho phép khôi phục toàn site chỉ bằng 1 dòng (`"disabled": false` trong `apps/profile/maintenance.json`), đồng bộ tự động tới `build.mjs`, `serve.mjs`, `packages/infra/alchemy.run.ts`, `turbo.json`, và deploy smoke check | P1 |
| 3 | Giữ nguyên toàn bộ test suite (`pnpm check`, `pnpm check-types`, `pnpm test`, `e2e.yml`) xanh ở cả chế độ maintenance mặc định lẫn các test bảo toàn source gốc | P1 |

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | [Profile Maintenance Mode & Infra Routing](./phase-01-start.md) | Pending |
| 2 | [Deploy Smoke Checks, Drift Guards & E2E](./phase-02-deploy-smoke-and-e2e.md) | Pending |

## Acceptance Criteria

- [x] `apps/profile/maintenance.json` tồn tại với `{ "disabled": true }`, và đổi sang `false` là điểm cấu hình duy nhất để mở lại toàn bộ site (hỗ trợ override qua env `PROFILE_MAINTENANCE`, có khai báo trong `turbo.json`).
- [x] `apps/profile/build.mjs` (khi disabled) dùng `mkdir(..., { recursive: true })` và chỉ xuất trang maintenance HTML vào `dist/index.html`, `dist/kiem-tra-dau-vao/index.html`, `dist/kiem-tra-dau-vao/ket-qua/index.html`, `dist/noi-bo/index.html` (để cả browser lẫn non-browser `curl` nhận HTTP 200) kèm `dist/_headers` (`Cache-Control: no-cache, no-store, must-revalidate`, `X-Robots-Tag: noindex, nofollow`), không copy `assets/` hay `.mp4` hay nội dung gốc ra `dist/`.
- [x] `apps/profile/serve.mjs` (khi disabled) short-circuit mọi method trước khi đụng `public/`: `GET`/`HEAD` trả HTTP 200 HTML thuần túy `"Trang web đang trong quá trình phát triển"` (`meta[name="robots"][content="noindex, nofollow"]`, headers `Cache-Control: no-cache, no-store, must-revalidate` và `X-Robots-Tag: noindex, nofollow`, không có `<a>`, `<button>`, `<form>`), các method khác trả `405 Method Not Allowed`.
- [x] `packages/infra/alchemy.run.ts` đọc `maintenance.json` qua `import.meta.url` (và tôn trọng `PROFILE_MAINTENANCE`) để đặt `notFoundHandling: profileDisabled ? "single-page-application" : "none"` trên `StaticSite("profile")`.
- [x] 5 test bảo toàn source gốc trong `apps/profile/tests/` truyền `{ maintenance: false }` và toàn bộ 74 test cũ + bộ test `maintenance.test.mjs` mới đều PASS.
- [x] `.github/workflows/deploy.yml` và `.github/workflows/deploy-staging.yml` cập nhật `Smoke check profile` kiểm tra theo trạng thái của `apps/profile/maintenance.json`.
- [x] `apps/e2e/playwright.config.ts` truyền `PROFILE_MAINTENANCE: "false"` cho server `:8105` để bảo toàn 6 spec E2E hiện có, đồng thời `apps/e2e/specs/profile-maintenance.spec.ts` kiểm tra trang maintenance mặc định trên 3 viewport (`1440x900`, `768x1024`, `375x812`).
- [x] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, và spec E2E `profile-maintenance.spec.ts` đều pass.

## Red Team Review

### Session — 2026-11-17
**Findings:** 13 raw (7 Security Adversary, 6 Assumption Destroyer) → 9 unique after dedup (8 accepted, 1 rejected)
**Severity breakdown:** 2 Critical, 4 High, 3 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | 5 test cũ trong `apps/profile/tests/` (tổng 74 test) sẽ FAIL nếu thiếu `{ maintenance: false }` | Critical | Accept | Phase 1 |
| 2 | `notFoundHandling: "single-page-application"` trả 404 cho `curl` thiếu `Sec-Fetch-Mode: navigate`, làm sập `Smoke check profile` | Critical | Accept | Phase 1, Phase 2 |
| 3 | Chỉ chặn `GET`/`HEAD` trong `serve.mjs` khiến `POST /noi-bo/` lọt xuống `public/` | High | Accept | Phase 1 |
| 4 | Split-brain `PROFILE_MAINTENANCE` giữa `alchemy.run.ts`, `build.mjs` và `turbo.json` strict env mode | High | Accept | Phase 1 |
| 5 | `buildProfile()` xóa `dist/` bằng `rm()` sẽ lỗi `ENOENT` nếu thiếu `mkdir()` | High | Accept | Phase 1 |
| 6 | `serve.mjs` coi `PORT=0` là `8005` (`Number("0") \|\| 8005`) và có thể rò env `PROFILE_MAINTENANCE` trong `profile-maintenance.spec.ts` | High | Accept | Phase 2 |
| 7 | API `/public/placement-test` & `/public/leads` trên `api.msmy.io.vn` vẫn mở | High | Reject (ngoài phạm vi: người dùng chỉ tắt page profile `msmy.io.vn`, giữ nguyên `app.msmy.io.vn` và E2E `/leads` + `/placement-test`; có thể tắt riêng qua `LEAD_ORG_ID=""` nếu muốn) | — |
| 8 | `topology-drift.test.mjs` cắt `split('StaticSite("profile"')[1]` bỏ sót phần đọc config phía trên | Medium | Accept | Phase 2 |
| 9 | Thiếu `Cache-Control: no-cache, no-store, must-revalidate` và `X-Robots-Tag: noindex, nofollow` HTTP headers ở chế độ maintenance | Medium | Accept | Phase 1 |

## Validation Log

### Verification Results
- **Tier:** Light (Fact Checker)
- **Claims checked:** 12
- **Verified:** 12 | **Failed:** 0 | **Unverified:** 0

### Whole-Plan Consistency Sweep
- Files reread: `plan.md`, `phase-01-start.md`, `phase-02-deploy-smoke-and-e2e.md`
- Decision deltas checked: 8 accepted red-team fixes
- Reconciled stale references: 2 (test count 48 → 74; added `mkdir`, multi-path `dist/`, `405` guard, `Cache-Control`/`X-Robots-Tag`, `turbo.json`, `import.meta.url`, non-zero port allocation)
- Unresolved contradictions: 0

<!-- slug: disable-profile-maintenance -->
