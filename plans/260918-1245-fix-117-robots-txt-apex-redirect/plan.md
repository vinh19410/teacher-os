---
title: "Fix #117: robots.txt serving plain text and apex/www DNS resolution & redirects"
description: "Sửa lỗi /robots.txt trả về SPA HTML hoặc 404 bằng static asset chuẩn và worker fallback text/plain; bổ sung cấu hình DNS và 301 redirects cho apex và www domain trong topology infra và worker edge."
status: completed
priority: P2
effort: 1h
issue: 117
branch: vinh19410/issue-117-robots-apex
tags: [bugfix, infra, web, worker, dns, robots, redirects]
blockedBy: []
blocks: []
created: 2026-09-18
---

# Fix #117: robots.txt dính SPA HTML; apex/www không resolve

## Overview

Theo báo cáo QC (Issue #117):
1. **`/robots.txt` dính HTML SPA**:
   - `https://app.teacheros.io.vn/robots.txt` trả về preamble Cloudflare + append full SPA HTML (trước #113) hoặc HTTP 404 (sau #113).
   - Nguyên nhân: `apps/web/public/` chưa có file `robots.txt`, dù `apps/web/src/routes-matcher.ts` đã khai báo `"/robots.txt": true` trong `KNOWN_PUBLIC_ASSETS`. Khi asset không tồn tại trên Cloudflare Assets, worker fallback hoặc Cloudflare Vite site fallback gây lỗi.
2. **Apex/www không resolve**:
   - `teacheros.io.vn` và `www.teacheros.io.vn` không có bản ghi A/AAAA/CNAME trong DNS (dù SSL cert SAN của zone đã có apex).
   - Nguyên nhân: Trong `packages/infra/alchemy.run.ts`, worker `web` chỉ cấu hình `domain: topology.appHost` (`app.teacheros.io.vn`), hoàn toàn không khai báo apex (`teacheros.io.vn`) hay `www.teacheros.io.vn`. Alchemy Cloudflare Worker domain hỗ trợ `redirects` (`WorkerDomainConfig`), tự động gắn Custom Domain vào Cloudflare Worker (tạo DNS A/AAAA/CNAME + edge TLS cert) và tạo rule Dynamic Redirect 301 về canonical `https://app.teacheros.io.vn`.

## Root Cause Analysis

1. **`apps/web/public/robots.txt` thiếu**:
   - Vite copy thư mục `public/` vào `dist/` khi build. Do thiếu file này, `apps/web/dist/robots.txt` không tồn tại.
   - Khi request tới `/robots.txt`, `worker.ts` kiểm tra `isStaticAssetPath("/robots.txt")` trả về true và gọi `env.ASSETS.fetch(request)`. Trên môi trường thực tế, asset thiếu dẫn đến 404 hoặc bị SPA shell fallback nuốt chửng.
2. **`packages/infra/alchemy.run.ts` & `topology.ts`**:
   - `resolveDomainTopology(appDomain)` chỉ sinh `appHost` (`app.<domain>`) và `apiHost` (`api.<domain>`), không định nghĩa `appRedirects` cho apex và www.
   - `Cloudflare.Website.Vite("web", { domain: topology.appHost, ... })` chỉ truyền hostname duy nhất `app.<domain>`.
   - Cần cấu hình `domain: { name: topology.appHost, redirects: topology.appRedirects }` để Alchemy provision DNS records và Cloudflare Dynamic Redirect 301 cho `teacheros.io.vn` và `www.teacheros.io.vn`.
3. **Defense-in-depth trong `apps/web/src/worker.ts`**:
   - Worker cần có logic chuyển hướng host: nếu request với Host `teacheros.io.vn` hoặc `www.teacheros.io.vn` (hoặc `staging.teacheros.io.vn`) chạm tới Worker, Worker chuyển hướng 301 về `https://app.<domain>` kèm HSTS header.
   - Nếu asset fetch `/robots.txt` vì bất kỳ lý do gì không tìm thấy, Worker trả về fallback 200 `text/plain; charset=utf-8` với nội dung `User-agent: *\nDisallow: /\n`.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Tạo file `apps/web/public/robots.txt` với `User-agent: *\nDisallow: /\n` | P2 |
| 2 | Cập nhật `apps/web/src/worker.ts` đảm bảo `/robots.txt` luôn trả về 200 `text/plain; charset=utf-8` với security headers | P2 |
| 3 | Mở rộng `packages/infra/src/topology.ts` cung cấp `appRedirects` cho apex và `www` hostnames | P2 |
| 4 | Cập nhật `packages/infra/alchemy.run.ts` sử dụng `WorkerDomainConfig` với `redirects: topology.appRedirects` | P2 |
| 5 | Bổ sung cơ chế host redirection trong `apps/web/src/worker.ts` & `security-headers.ts` làm defense-in-depth | P2 |
| 6 | Viết comprehensive unit tests trong `apps/web/src/worker.test.ts` và `packages/infra/src/topology.test.ts` | P2 |
| 7 | Đảm bảo tất cả quality gates pass sạch (`pnpm test`, `pnpm check`, `pnpm check-types`) | P1 |

## Non-Goals

- Không thay đổi DNS hay routing của API server (`api.teacheros.io.vn`).
- Không cho phép web crawler lập chỉ mục các màn hình quản lý riêng tư (giữ `Disallow: /`).

## Phases

| 1 | [robots.txt static asset and worker fallback handler](./phase-01-robots-txt.md) | Completed |
| 2 | [Domain topology redirects and worker host redirect](./phase-02-domain-topology-redirects.md) | Completed |

## Success Criteria

- [x] `/robots.txt` trả về HTTP 200, `Content-Type: text/plain; charset=utf-8`, body `User-agent: *\nDisallow: /\n`, không dính HTML hay 404.
- [x] `packages/infra/src/topology.ts` tính toán `appRedirects` chính xác: với `teacheros.io.vn` trả về `["teacheros.io.vn", "www.teacheros.io.vn"]`.
- [x] `packages/infra/alchemy.run.ts` truyền `domain: { name: topology.appHost, redirects: topology.appRedirects }` cho `web` Worker.
- [x] Worker `apps/web/src/worker.ts` tự động chuyển hướng 301 các request từ apex và www sang `https://app.teacheros.io.vn` kèm HSTS.
- [x] Toàn bộ unit tests, typecheck, và lint tests pass 100%.
