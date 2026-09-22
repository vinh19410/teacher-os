---
title: Plan landing static app tách biệt deploy apex qua Alchemy StaticSite
date: 2026-09-22
summary: "Tạo plan 4 phase (issue #239): apps/landing zero-framework + Cloudflare.Website.StaticSite, apex teacheros.io.vn rời web Worker sang landing Worker"
---

# Plan landing static app tách biệt deploy apex qua Alchemy StaticSite

## What happened
Chạy `ak-plan --github` cho yêu cầu: theo thiết kế Open Design `landing.html` (1138 dòng self-contained) tạo app static riêng trong monorepo teacher-os để deploy landing page tách biệt web app.

Scout phát hiện mấu chốt: apex `teacheros.io.vn` + www hiện đang là `appAliases` của **web Worker** (301 → `app.<domain>`) tại `packages/infra/src/topology.ts:75-80` — "tách biệt" thực chất là một **custom-domain handover** giữa 2 Worker, không chỉ thêm resource mới. Xác minh API Alchemy 2.0.0-beta.72 qua source trên GitHub (`Cloudflare.Website.StaticSite` — assets-only Worker khi bỏ `main`, hỗ trợ `dev: {command, url}`, `aliases` chỉ tồn tại trong `WorkerDomainConfig` lồng `{name, aliases}` chứ không phải prop flat).

Planner subagent viết plan 4 phase (6h) qua `ak plan create`; orchestrator validation sửa 1 bug snippet trong phase 01: `new URL("../<outdir>")` → `./<outdir>` vì `import.meta.url` là đường dẫn file nên `../` resolve ra ngoài package. `ak plan validate` OK; issue #239 tạo với label `ready to review`, backfill `issue: 239` vào frontmatter.

## Decision
- **Landing chiếm apex**: `topology.ts` thêm `landingHost` (bare APP_DOMAIN) + `landingAliases` (`www.<domain>`), `appAliases` rỗng ở mọi môi trường; www serve cùng content + `<link rel="canonical">` thay vì 301 (Redirect Rules cần Rulesets API ngoài quyền CI deploy token — tiền lệ có sẵn trong docblock topology.ts).
- **Zero-framework**: `apps/landing` = `public/index.html` (thiết kế + head SEO) + build copy + `serve.mjs` :8002 (nối dài convention 800x) + node:test guard; không framework/bundler vì thiết kế đã self-contained.
- **Wiring**: `Cloudflare.Website.StaticSite("landing")` dạng `domain: {name, aliases}` lồng, `dev.url` tường minh `http://localhost:8002`, KHÔNG thêm `withDefault("http://localhost:...")` mới (bảo vệ regex first-match trong `scripts/topology-drift.test.mjs:34-36`).
- **Rollout staging trước** (rehearsal handover, staging apex không traffic thật); deploy smoke `LANDING_ORIGIN` poll 10 phút; drift test mới runtime-import topology.ts (Node 24 type-stripping).
- Non-goals: backend waitlist thật cho beta form, e2e Playwright cho landing, 301 www→apex.

## Next steps
- `/ak:cook plans/260922-0702-260922-1359-landing-static-app/plan.md` để thực thi.
- Khi cook phase 2: chạy `pnpm --filter @teacher-os/infra check-types` sớm để xác nhận shape `WorkerDomainConfig` với bản beta đang pin trong lockfile.
- Follow-up (ngoài plan): backend waitlist cho beta form nếu muốn thu email thật.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
