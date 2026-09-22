---
title: "Thêm app landing page tĩnh tách biệt deploy ở apex domain"
description: "Tạo apps/landing (static page zero-framework theo thiết kế landing.html) và wiring Cloudflare.Website.StaticSite vào Alchemy stack, đưa landing lên apex teacheros.io.vn (+www) tách biệt hoàn toàn với web app."
status: pending
priority: P2
effort: 6h
issue: 239
branch: vinh19410/feat/landing-static-app
tags: [feature, infra, frontend]
blockedBy: []
blocks: []
created: 2026-09-22
---

# Thêm app landing page tĩnh tách biệt deploy ở apex domain

## Overview

Hiện tại apex + www là `appAliases` của web Worker: requests vào `teacheros.io.vn` / `www.teacheros.io.vn` bị Worker 301 về `app.<domain>` (`packages/infra/src/topology.ts:35-41,75-80`, wiring tại `packages/infra/alchemy.run.ts:107-113`). Plan này tạo app mới `apps/landing` — static page zero-framework port nguyên vẹn từ thiết kế Open Design `landing.html` (1138 dòng self-contained: inline CSS Apple-minimal + inline JS sticky nav/mobile sheet/reveal/client-side beta form) — và thêm `Cloudflare.Website.StaticSite("landing", ...)` vào stack Alchemy, gắn apex + www vào landing Worker, đồng thời rút các hostname đó khỏi web Worker. Web app, API, cookie topology, auth đều không đổi.

Behavior change có chủ đích: apex từ "301 về app" thành "serve landing marketing"; app vẫn ở `app.<domain>`. Rollout qua staging trước (apex staging không có traffic thật), prod chấp nhận gap vài phút lúc handover custom domain. Deploy smoke mới poll landing apex; drift test khóa chặt topology mới.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | `apps/landing` render đúng thiết kế `landing.html` (single self-contained HTML, chỉ bổ sung head SEO: canonical/og/twitter/favicon), build = copy `public/` → `dist/`, dev server :8002 | P1 |
| 2 | Landing serve tại apex prod `https://teacheros.io.vn` (+ `www.`) qua assets-only StaticSite Worker; staging tương ứng ở `staging.teacheros.io.vn` | P1 |
| 3 | Web app giữ nguyên `app.<domain>` (API `api.<domain>` không đụng); `appAliases` rỗng ở mọi môi trường | P1 |
| 4 | Deploy smoke landing apex (200 + text/html + nội dung) + drift test khóa topology mới; mọi quality gate hiện có vẫn xanh | P1 |
| 5 | Docs (architecture/runbook/codebase-summary/README) + CHANGELOG phản ánh đúng topology mới | P2 |

## Phases

| Phase | Name | Status |
| ----- | ---- | ------ |
| 1 | [App `apps/landing` static + tests](./phase-01-landing-app.md) | Pending |
| 2 | [Topology + Alchemy wiring](./phase-02-topology-alchemy.md) | Pending |
| 3 | [Deploy smoke + drift tests](./phase-03-deploy-smoke-drift.md) | Pending |
| 4 | [Docs + CHANGELOG](./phase-04-docs-changelog.md) | Pending |

Dependencies: 2 ← 1, 3 ← 2, 4 ← 2 (phase 3 và 4 độc lập nhau, có thể song song).

## Design Decisions

1. **`apps/landing` static zero-framework.** Thiết kế nguồn đã self-contained (inline CSS + inline JS, không dependency ngoài) — thêm framework/bundler là độ phức tạp không mua được gì. Cấu trúc: `public/index.html` (port nguyên vẹn + chỉ bổ sung head), `build.mjs` (`fs.cp` public→dist, Node 24), `serve.mjs` (static server ~30 dòng, `PORT||8002`), `tests/index.test.mjs` (node:test). Khớp sẵn với workspace (`pnpm-workspace.yaml` phủ `apps/*`) và turbo (task `build` outputs `dist/**`, `dev` persistent). Không khai báo `check-types` trong package.json — turbo tự skip; app không có TypeScript. Root thêm `"dev:landing"` theo pattern `dev:web`/`dev:server` (`package.json:8-9`). Port 8002 nối dài convention 800x (server 8000 `alchemy.run.ts:85`, web 8001 `alchemy.run.ts:120-121`).

2. **Landing chiếm apex; web rút về `app.<domain>`.** `topology.ts` thêm `landingHost` (= bare APP_DOMAIN) + `landingAliases` (= `[www.<bare domain>]`); `appAliases` chuyển thành mảng rỗng ở cả 3 nhánh (hiện tại prod `[apex, www]`, staging `[domain]`, zone lạ `[domain, www]` — `topology.ts:75-80`). www serve cùng content landing thay vì 301 về apex: Redirect Rules cần Rulesets API ngoài quyền CI deploy token (tiền lệ ghi trong docblock `topology.ts:38-41`); duplicate content xử lý bằng `<link rel="canonical" href="https://teacheros.io.vn">` trong trang (phase 1). Giữ field `appAliases` (thay vì xóa hẳn) để diff nhỏ và thể hiện chủ đích "web không còn alias nào".

3. **StaticSite wiring dùng dạng `domain` lồng `{ name, aliases }`.** `aliases` là field của `WorkerDomainConfig` (Alchemy `Worker.d.ts:166-181`), KHÔNG phải prop top-level của WorkerProps; `domain` string chỉ là shorthand của `{ name }` (`Worker.d.ts:647`) nên không kèm được aliases. Web đang dùng đúng dạng lồng (`alchemy.run.ts:107-113`) — landing dùng cùng shape. Bỏ `main`/`script` → assets-only Worker: Alchemy không upload script, Cloudflare asset layer tự serve mọi request (`StaticSite.d.ts`). `dev.url` set tường minh `http://localhost:8002` vì serve.mjs tự viết không đảm bảo in URL theo format Alchemy auto-detect. Stack trả thêm `landing: landingWorker.url`.

4. **Cấm thêm `withDefault("http://localhost:...")` trong `alchemy.run.ts`.** Drift test lấy **first match** regex `withDefault\("(http://localhost:\d+)"\)` (`scripts/topology-drift.test.mjs:34-36`) so với web dev port — anchor là CORS default `http://localhost:8001` tại `alchemy.run.ts:56`. Một `withDefault` mới đứng trước dòng đó làm test vỡ. Wiring landing chỉ dùng plain object property (`dev.url`), không phải `withDefault`.

5. **Custom-domain handover là rủi ro lớn nhất — rollout staging trước.** Apex/www detach khỏi web Worker và attach vào landing Worker trong cùng `alchemy deploy`. Cert apex + www đã tồn tại trong zone (web giữ các hostname này từ trước) nên re-attach nhanh; staging chạy trước (không traffic thật), prod chấp nhận gap vài phút, smoke poll 10 phút làm lưới an toàn (phase 3).

6. **Deploy smoke theo style hiện có.** 2 workflow deploy thêm env `LANDING_ORIGIN` (prod `https://teacheros.io.vn`, staging `https://staging.teacheros.io.vn`) + step GET `/` poll 30×20s: HTTP 200 + `content-type: text/html` + body chứa `"Teacher OS"` (title `landing.html:6`). Không đụng `APP_DOMAIN`/step hiện có; không đụng `ci.yml` (contract `scripts/ci-workflow.test.mjs` khóa cứng).

7. **Drift test khóa topology mới bằng cả runtime lẫn text.** Runtime: import trực tiếp `packages/infra/src/topology.ts` qua Node 24 type-stripping (file chỉ chứa erasable syntax — interface/type annotations) assert `landingHost`, `appAliases` rỗng, `landingAliases` chứa `www.`. Text: assert `LANDING_ORIGIN` khớp apex từng stage, cùng style test APP_DOMAIN sẵn có (`topology-drift.test.mjs:76-87`).

8. **Beta form client-side only** — đúng thiết kế: submit chỉ có UI feedback, không gọi API. Backend waitlist là follow-up (xem Non-Goals).

## Non-Goals

- Backend waitlist thật cho beta form (persist email vào D1/API).
- Redirect 301 `www` → apex (cần Rulesets API ngoài quyền CI token; canonical là cách xử lý).
- E2E Playwright cho landing (đụng infra `apps/e2e` ngoài scope; deploy smoke + node test đủ).
- Đổi web app, server, API topology, auth/cookie (nguyên vẹn `app.<domain>`/`api.<domain>`).
- SEO mở rộng cho landing (sitemap, robots.txt, structured data) — canonical là đủ scope này.
- Đa ngôn ngữ / i18n landing.
- Đưa framework (Astro/Next/vite) vào `apps/landing`.

## Success Criteria

- [ ] `pnpm --filter landing build` tạo `dist/index.html` ; `pnpm --filter landing test` 5 test xanh (đúng 1 `<h1>`, có `#beta-form`, không `<script src=`, có viewport); `pnpm check` xanh.
- [ ] `resolveDomainTopology("teacheros.io.vn")` → `landingHost === "teacheros.io.vn"`, `appAliases` rỗng, `landingAliases` chứa `www.teacheros.io.vn` (drift test runtime).
- [ ] Deploy Staging xanh: GET `https://staging.teacheros.io.vn/` → 200 `text/html` chứa "Teacher OS"; `https://app.staging.teacheros.io.vn` vẫn là web app; auth smoke không vỡ.
- [ ] Deploy prod: apex + www serve landing; `https://app.teacheros.io.vn` vẫn là web app; `/readyz` + smoke stubs không vỡ.
- [ ] `pnpm test` full (gồm `test:ci-workflow` + `test:topology-drift`) xanh.
- [ ] 4 file docs + CHANGELOG cập nhật; drift test chạm runbook vẫn xanh.

## Rollback

- Trước deploy prod đầu tiên: revert merge là đủ (branch feature tách biệt, chưa có resource Cloudflare mới ở prod ngoài StaticSite chưa deploy).
- Sau khi đã deploy prod: deploy lại commit trước đó (Alchemy adopt theo state — web Worker nhận lại apex/www làm aliases, StaticSite "landing" rút domain về `workers.dev` hoặc destroy qua `pnpm destroy -F @teacher-os/infra` nếu bỏ hẳn). Data không đụng (landing không có storage), nên rollback không có rủi ro dữ liệu — chỉ lại đảo chiều handover domain với gap vài phút.

## Dependencies

- Không có cross-plan dependency đang mở (blockedBy trống).
- Phụ thuộc ngoài: thiết kế `landing.html` (Open Design project `f2f4d498-...`, đã final), Alchemy `2.0.0-beta.72` API `Cloudflare.Website.StaticSite` (đã xác minh từ type definitions trong `node_modules`), quyền CI token hiện có (không cần quyền mới — không đụng Rulesets).

## Validation Log

### Verification Results
- Orchestrator validation (2026-09-22): `ak plan validate` → `[OK] plans/260922-0702-260922-1359-landing-static-app is a valid plan directory`. Fact-check 1 lượt trên branch `develop`: wiring `domain: {name, aliases}` khớp web (`alchemy.run.ts:107-113`); drift test regex `withDefault` first-match (`topology-drift.test.mjs:34-36`) và test APP_DOMAIN (`:76-87`) đọc đúng; deploy.yml/deploy-staging.yml env block + smoke style khớp mô tả; `ak plan create` tự thêm prefix store-id `260922-0702` vào tên thư mục (slug bên trong giữ `260922-1359-landing-static-app`).
- 1 failed đã sửa (orchestrator): snippet `build.mjs`/`serve.mjs` ở phase 01 dùng `new URL("../dist")`/`new URL("../public")` — `import.meta.url` là đường dẫn file nên `../` resolve ra `apps/dist`/`apps/public` ngoài package; đã sửa thành `./dist`/`./public` kèm ghi chú trong phase 01. (Snippet `tests/index.test.mjs` giữ `../public` vì nằm trong subdir `tests/` — chính xác.)
- Self-verification trong phiên planning (grep/đọc trực tiếp trên branch `develop`): toàn bộ citation đã re-grep — `alchemy.run.ts:56,85,100-128`; `topology.ts:35-41,47,75-80`; `topology-drift.test.mjs:24,34-36,76-87`; `deploy.yml:31-34,84-99`; `deploy-staging.yml:38-46`; `turbo.json` (build outputs `dist/**`, dev persistent); `pnpm-workspace.yaml` (`apps/*`); root `package.json:8-9` (dev:web/dev:server); `packages/infra/package.json` (name `@teacher-os/infra`, scripts check-types/test); Alchemy `StaticSite.d.ts` (assets-only khi bỏ `main`, `dev.url`, props cwd/command/outdir/assets) + `Worker.d.ts:166-181,647` (domain/aliases shape); `landing.html:5,6,679` (viewport/title/h1); docs headings; `CHANGELOG.md` section `## 2026-09-22`.
- 1 correction so với evidence ban đầu: wiring `domain: ..., aliases: ...` dạng flat sẽ không typecheck — `aliases` chỉ tồn tại trong `WorkerDomainConfig` lồng (xem Design Decisions #3).

### Whole-Plan Consistency Sweep
- Đã re-read cả 5 file (plan.md + 4 phase) sau khi viết. Nhất quán đã kiểm: apex handover (Goals #2/#3 = Design Decisions #2/#5 = phase-02 Risk = phase-03 smoke = Success Criteria); canonical thay 301 cho www (DD #2 = Non-Goals = phase-01 step 2); cấm `withDefault` mới (DD #4 = phase-02 step 3); drift test runtime + text (DD #7 = phase-03 step 3 = Success Criteria #2); giữ nguyên google redirect URI trong runbook (phase-04 step 2 = drift test `:24`); port 8002 (DD #1 = phase-01 serve.mjs = phase-02 dev.url = phase-04 README).
- Phase `status: todo` trong frontmatter được `ak plan validate` chấp nhận (schema CLI).

## Red Team Review

### Session — 2026-09-22
**Findings:** 4 (3 accepted, 1 rejected)
**Severity breakdown:** 0 Critical, 0 High, 2 Medium, 2 Low

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Custom-domain handover apex web→landing có thể gap ngắn khi deploy prod (detach/attach cùng apply) | Medium | Accept | Phase 2 (risk section) + Phase 3 (smoke poll); mitigation: staging trước, cert đã tồn tại, poll 10 phút |
| 2 | `www` serve duplicate content thay vì 301 về apex | Medium | Accept | Phase 1 (canonical tag) + Design Decisions #2; tránh Rulesets API theo tiền lệ `topology.ts:38-41` |
| 3 | Regex first-match `withDefault` trong drift test dễ vỡ nếu wiring mới thêm `withDefault("http://localhost:...")` đứng trước anchor cũ | Low | Accept | Design Decisions #4 (quy ước cấm) + Phase 2 step 3 (ràng buộc tường minh) |
| 4 | Cân nhắc thêm e2e Playwright cho landing | Low | Reject | Non-Goals — deploy smoke + node test đủ; e2e chạm infra `apps/e2e` ngoài scope |

### Whole-Plan Consistency Sweep
- Đã chạy (orchestrator): 4/4 findings đã reflect đúng vị trí ghi trong cột "Applied To"; không còn gap mới sau sweep (chi tiết ở Validation Log).

<!-- slug: 260922-1359-landing-static-app -->
