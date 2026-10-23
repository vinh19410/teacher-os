---
phase: 2
title: "Secret infra/CI + docs + verify"
status: pending
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Secret infra/CI + docs + verify

## Goal

Khai báo và truyền `GITHUB_WEBHOOK_SECRET` tới Worker ở mọi stage deploy, ghi tài liệu vận hành, chạy gate đầy đủ.

## Files to Create / Modify

- Modify: `packages/infra/alchemy.run.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-staging.yml`
- Modify: `docs/production-release-runbook.md`
- Modify: `docs/system-architecture.md`

## Tasks & Steps

1. **Infra** — trong khối `env` của Worker server (cạnh `SEPAY_BANKHUB_*`):
   `GITHUB_WEBHOOK_SECRET: Config.string("GITHUB_WEBHOOK_SECRET").pipe(Config.withDefault(""))` kèm comment:
   rỗng ⇒ `/webhooks/github` trả 503; dùng `Config.string` vì `redacted` không kết hợp được `withDefault`.
2. **CI deploy** — thêm `GITHUB_WEBHOOK_SECRET: ${{ secrets.GH_WEBHOOK_SECRET }}` vào khối `env:` của bước
   `pnpm alchemy deploy` ở cả `deploy.yml` và `deploy-staging.yml` (cạnh `RESEND_API_KEY`), để giá trị không bị
   ghi đè về rỗng ở mỗi lần deploy. Tên secret Actions là `GH_WEBHOOK_SECRET` vì GitHub Actions cấm tên secret
   bắt đầu bằng `GITHUB_`; tên biến env/binding Worker vẫn là `GITHUB_WEBHOOK_SECRET`. Ghi rõ cặp tên này trong runbook.
3. **Runbook** `docs/production-release-runbook.md`:
   - Thêm dòng vào bảng Secret inventory: nguồn (operator tự sinh, vd `openssl rand -hex 32`), đường đi (GitHub
     environment secret → bước deploy → Worker binding), cách xoay vòng (sinh mới → cập nhật secret trên trang
     webhook GitHub và GitHub environment → redeploy; trong lúc lệch, delivery trả 401 và có thể "Redeliver" từ UI).
   - Thêm mục ngắn "GitHub webhook": Payload URL `https://api.<domain>/webhooks/github`, Content type
     `application/json` (bắt buộc — form-encoded bị 415), Secret = giá trị trên, chọn event cần nhận; kiểm bằng
     delivery `ping` trả 200 trong tab "Recent Deliveries". Secret chưa set ⇒ 503 `GITHUB_WEBHOOK_DISABLED`.
4. **Architecture** `docs/system-architecture.md`: thêm 1 dòng bảng cạnh dòng SePay — GitHub webhook HMAC
   `X-Hub-Signature-256` tại `/webhooks/github`, ack + log, mount ngoài `/api/*`, link tới
   `apps/server/src/routes/github-webhooks.ts`.
5. **Gate đầy đủ**: `pnpm check`, `pnpm check-types`, `pnpm --filter server test`. Theo quy ước repo, chạy full
   e2e suite trước khi squash-merge vào `develop` (route không có UI nhưng `app.ts` đổi).

## Verification

- `pnpm check && pnpm check-types && pnpm --filter server test`
- `git grep -n "GITHUB_WEBHOOK_SECRET\|GH_WEBHOOK_SECRET"` cho thấy đủ: `alchemy.run.ts`, `index.ts`, 2 workflow, runbook.
- Smoke local (tuỳ chọn): chạy dev server port 8000 với secret trong `.env`, gửi request ký bằng
  `openssl dgst -sha256 -hmac` → 202; không ký → 401.

## Risk & Rollback

- Quên set secret trên GitHub environment ⇒ endpoint trả 503, không ảnh hưởng tính năng khác.
- Rollback = revert commit; secret thừa trong GitHub environment vô hại.
