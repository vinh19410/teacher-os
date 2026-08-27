---
title: "Resolve operator inputs (blocker #41)"
status: todo
priority: P1
effort: "2-4h agent + chờ operator"
dependencies: []
---

# Phase 1: Resolve operator inputs (blocker #41)

## Overview

Cung cấp đủ 5 operator inputs mà phase-06 topology gate yêu cầu: domain production + env topology sạch (kèm hardening code giữ `pnpm dev` hoạt động mà không mở path silent-sai nào), Google redirect URI đã register, UAT account, Safari runner + runner kit, và bộ giá trị sign-off row. Kết thúc phase là một lần dry-run no-apply + zone check (Cloudflare API) xanh mà chưa deploy.

## Requirements

- Functional: cả 5 items trong body issue #41 có verdict/bằng chứng; topology gate của phase-06 pass ở dạng dry-run (`alchemy plan` với `APP_DOMAIN` inline, chưa deploy).
- Non-functional: không hostname thật, không secret, không OAuth value, không database ID trong bất kỳ bản ghi nào (hostname policy + sanitize allowlist của phase-06). `pnpm dev` phải vẫn chạy sau cleanup.

## Architecture

Env topology là deploy-time wiring: `APP_DOMAIN` đọc từ `process.env` sau dotenv trong `packages/infra/alchemy.run.ts:23-25`; khi có topology, Worker/web nhận custom domain, `CORS_ORIGIN` default thành `appOrigin`, `BETTER_AUTH_URL` bị ép thành `apiOrigin` (giá trị dev trong `apps/server/.env` vô hại với prod).

Nhánh topology-unset KHÔNG chỉ là dev: staging deploy và `--stage prod` thiếu inline `APP_DOMAIN` cũng đi vào nhánh này (phase-06:38 cảnh báo workers.dev-shaped "prod" vẫn pass `/readyz`). Vì vậy default `http://localhost:8001` chỉ được áp khi chạy dưới `alchemy dev` — phát hiện qua `process.env.ALCHEMY_DEV === "true"` (signal alchemy tự set cho process con của `alchemy dev`; `alchemy dev` beta.72 evaluate run file trong process con có argv rỗng nên argv check không dùng được — code-review 2026-08-21; nếu signal biến mất thì `pnpm dev` fail đòi explicit CORS_ORIGIN, fail-closed chứ không bao giờ silently sai); deploy/plan thiếu explicit CORS_ORIGIN giữ nguyên fail-loud như hiện tại (`alchemy.run.ts:57`). Đồng thời harden lỗi gốc NO-GO 2026-08-20: khi topology set mà explicit `CORS_ORIGIN` ≠ `appOrigin`, throw thay vì `console.warn` (`alchemy.run.ts:31-39`) — không tồn tại case hợp lệ cho tổ hợp đó (staging luôn chạy topology-unset).

## Related Code Files

- Modify: `packages/infra/alchemy.run.ts` — harden CORS_ORIGIN (red-team 2026-08-21): (a) nhánh topology-unset nhận default `http://localhost:8001` CHỈ khi `ALCHEMY_DEV=true` (signal alchemy set cho process con của `alchemy dev`; argv không dùng được — code-review 2026-08-21); deploy/plan thiếu explicit vẫn fail-loud; (b) topology set + explicit `CORS_ORIGIN` ≠ `appOrigin` → throw thay `console.warn`
- Modify: `docs/production-release-runbook.md` — deploy block dùng inline `APP_DOMAIN` theo pattern không rơi vào shell history (`read -rs` + `env`); rollback block thêm cùng pattern; staging bootstrap bỏ two-step persist `CORS_ORIGIN` vào `.env`, chuyển sang inline; câu "an explicit CORS_ORIGIN is required" thành "required for staging (inline); dev defaults to http://localhost:8001 via alchemy dev"
- Modify: `packages/infra/.env.example` — comment `CORS_ORIGIN` nêu default chỉ áp cho `alchemy dev`, staging truyền inline khi deploy
- Modify: `README.md` — dòng chỉ dẫn persist `APP_DOMAIN` vào `packages/infra/.env` (README hiện ghi "Set APP_DOMAIN in packages/infra/.env") đổi sang inline deploy command, khớp runbook mới
- Modify: `scripts/topology-drift.test.mjs` — thêm assertion đồng bộ dev CORS default (`http://localhost:8001`) với web dev port 8001 (`alchemy.run.ts` Website.Vite `dev.port` + `apps/web/vite.config.ts`)
- Modify (local, gitignored — không vào PR): `apps/server/.env` — xóa dòng `CORS_ORIGIN`
- Create: `plans/260821-0935-unblock-production-uat-operator-inputs/reports/uat-runner-kit.md` — checklist chạy UAT từng browser cho runner
- Create: `plans/260821-0935-unblock-production-uat-operator-inputs/reports/operator-inputs-status.md` — verdict từng item #41 (verdict-only)

## Implementation Steps

1. **PR cleanup (agent, repo):** harden `alchemy.run.ts` (dev-only default + throw-on-mismatch) + runbook + `.env.example` + README + drift assertion như trên; chạy 4 gates (`pnpm test`, `pnpm check-types`, `pnpm exec biome check .`, `pnpm build`) với CI parity `VITE_SERVER_URL=http://localhost:8000` khi chạy trong worktree không có `apps/web/.env` (`.github/workflows/ci.yml`); PR vào `develop`, merge.
2. **Local env cleanup (agent, máy operator):** verify main checkout `git rev-parse HEAD` == merge commit của PR cleanup (pull nếu cần) TRƯỚC KHI xóa dòng `CORS_ORIGIN` khỏi `apps/server/.env`; xác nhận không persist `APP_DOMAIN` vào bất kỳ env file nào; chạy lại `pnpm dev` một lần để chứng minh dev default hoạt động (nếu argv dev-detection miss, `pnpm dev` sẽ fail đòi explicit — fix code, không quay lại env line).
3. **USER-ACTION gate 1 — domain:** operator chọn domain (zone active trong tài khoản). Agent verify zone in-account bằng Cloudflare API `GET /zones?name=<domain>` với `CLOUDFLARE_API_TOKEN` sẵn có trong `packages/infra/.env` (chạy từ main checkout; ghi verdict-only, không ghi tên zone/zone ID) — dry-run `alchemy plan` KHÔNG validate zone (zone inference chỉ xảy ra lúc provision). Nếu zone ở nhà cung cấp khác: dừng, operator chuyển/delegate zone về Cloudflare rồi mới tiếp tục.
4. **USER-ACTION gate 2 — Google redirect:** operator register `https://api.<APP_DOMAIN>/api/auth/callback/google` (URI sinh từ `resolveDomainTopology(...).googleRedirectURI`) trên đúng OAuth client của `GOOGLE_CLIENT_ID` hiện có, kèm audit các redirect URI cũ trên client đó (loại URI dev/localhost còn sót — attestation "audited, no dev URIs left", không ghi client ID/console URL). Agent chạy pre-deploy precheck: request Google authorize endpoint với `redirect_uri` production — `redirect_uri_mismatch` sẽ surface ngay từ Google mà không cần deploy (verdict-only).
5. **USER-ACTION gate 3 — UAT account:** operator cung cấp Google account chuyên dụng out of band; bản ghi chỉ có "supplied: yes + timestamp + kênh", không identity.
6. **USER-ACTION gate 4 — runners:** operator xác nhận người chạy incognito Safari (và Chrome). Agent viết `uat-runner-kit.md`: từng bước sign-in → cookie attributes check (DevTools) → bootstrap → `fixture-*` flows → reload → sign-out/in, kèm template ghi evidence theo sanitize allowlist của phase-06.
7. **Thu thập sign-off values:** operator identity (deploy), restore authority/approver; stage để phase 2 điền row thật vào runbook trước deploy.
8. **Dry-run topology gate (agent):** chạy tại **main checkout** sau khi pull merge commit của bước 1 (worktree không có env files/secrets — không bao giờ copy env file hay `.alchemy` sang worktree); từ `packages/infra/`: `APP_DOMAIN=<domain> pnpm alchemy plan --stage prod` (no-apply dry-run — vẫn chạm state-store bootstrap, không dùng `--yes` để tránh triển khai state-store ngoài procedure) + kiểm tra 3 env file sạch + zone (bước 3) + attestation redirect (bước 4). Tất cả xanh → tick 5 items trong #41 (mỗi item kèm verdict), sang phase 2. Thiếu item nào → dừng ở item đó, ghi status vào `operator-inputs-status.md` và issue #41, yêu cầu operator.

## Todo

- [ ] PR cleanup (alchemy.run.ts hardening + runbook + .env.example + README + drift assertion) merge vào develop, 4 gates xanh (VITE_SERVER_URL parity khi chạy trong worktree)
- [ ] Xóa `CORS_ORIGIN` khỏi `apps/server/.env` sau khi verify main checkout HEAD == merge SHA; `pnpm dev` chứng minh còn hoạt động
- [ ] Domain chọn + zone in-account verified qua Cloudflare API (verdict-only)
- [ ] Google redirect URI register + audit URI cũ + authorize precheck verdict-only
- [ ] UAT account supplied out of band (bản ghi verdict-only)
- [ ] Safari runner (+ Chrome runner) xác nhận; runner kit viết xong
- [ ] Sign-off values thu thập (operator, restore authority)
- [ ] Dry-run topology gate xanh tại main checkout post-pull (`APP_DOMAIN=... pnpm alchemy plan --stage prod` + 3 env files sạch, không `--yes`)

## Success Criteria

- [ ] 5 items trong #41 tick kèm verdict, issue cập nhật đúng sự thật (chưa đóng — chờ phase 2 có evidence).
- [ ] Topology gate dry-run pass: `APP_DOMAIN` resolvable, `CORS_ORIGIN` absent-or-prod ở cả 3 env file, zone in-account (Cloudflare API verdict), redirect attested + precheck pass.
- [ ] Deploy/plan thiếu explicit `CORS_ORIGIN` khi topology unset vẫn fail-loud; topology set + explicit mismatch throw — không còn path silent-sai nào.
- [ ] `pnpm test` / `check-types` / `biome check` / `build` xanh trên commit gồm code change.
- [ ] Không hostname/secret/PII nào xuất hiện trong repo, issues, hay reports của plan này.

## Risk Assessment

- **`ALCHEMY_DEV` signal biến mất ở alchemy version tương lai** (kongming risk watch sau code-review): signal — `pnpm dev` fail đòi explicit `CORS_ORIGIN` sau khi xóa env line; response — fail-closed by design, cập nhật detection theo docs alchemy mới; không bao giờ quay lại persist `CORS_ORIGIN` trong env file để "fix" dev.
- **Safari runner không có khi phase 2 cần** (kongming risk watch): signal — bước 6 phase-06 không hoàn tất Safari leg; response — dừng, yêu cầu runner, NO-GO một phần nếu cần, không bao giờ Chrome-only.
- **Domain chọn có zone nằm ngoài Cloudflare:** signal — Cloudflare API `GET /zones?name=` trả empty (dry-run plan không phát hiện được — zone inference chỉ xảy ra lúc provision); response — dừng gate 1, operator chuyển/delegate zone; không tự tay tạo DNS records ngoài Alchemy.
- **Redirect register nhầm OAuth client** (không khớp `GOOGLE_CLIENT_ID`): signal — authorize precheck trả `redirect_uri_mismatch` ngay tại gate 2 (hoặc sign-in phase 2 fail tại callback nếu bị miss precheck); response — đối chiếu client, register lại đúng client, chạy lại browser leg.
- **Ai đó persist `APP_DOMAIN` vào env file vì tiện:** signal — `pnpm dev` cố gắn custom domain lên dev worker; response — unset khỏi file, chỉ dùng inline shell env cho deploy (đã ghi trong runbook + README).
- **Xóa `CORS_ORIGIN` trước khi code default merge:** lỗi Config bắt buộc làm `pnpm dev` vỡ — thứ tự steps 1→2 là bắt buộc; nếu xảy ra, revert dòng env và merge PR trước.
