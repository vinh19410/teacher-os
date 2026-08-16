# Code Review — remap local-dev ports 3000/3001 → 8000/8001

**Date:** 2026-08-16  
**Reviewer:** staff engineer (production-readiness)  
**Mode:** pending/recent + spec-compliance + checklist two-pass  
**Branch:** `develop` @ `f8c2e34`  
**Plan:** `plans/260816-2017-remap-local-dev-ports-to-800x/`  
**Score:** **9/10**

## Code Review Summary

### Scope
- Files (tracked product):
  - `packages/infra/alchemy.run.ts`
  - `apps/web/vite.config.ts`
  - `apps/web/src/lib/auth-client.ts`
  - `README.md`
  - `.github/workflows/ci.yml`
- Files (gitignored URL-only, AC bắt buộc): `apps/web/.env`, `apps/server/.env`
- Files (plan mới, được phép): `plans/260816-2017-remap-local-dev-ports-to-800x/**`
- LOC product: ~11 dòng (port + `strictPort` + 3 README URL + 1 CI dummy + 1 fallback)
- Focus: recent local-dev remap, không full-codebase
- Scout findings: xem mục Edge Cases. Blast radius = Alchemy bind + Vite bind + dotenv CORS + auth fallback + README + CI dummy. Consumer auth/Hono/OAuth button **không** sửa.

### Overall Assessment

Spec compliance **PASS**. 9/9 AC nguồn khớp. Không regression business logic. Không breaking public contract ngoài local-dev origin đã gọi tên. `strictPort` đúng Alchemy `WorkerProps`. Website.Vite inherit `dev` (`Vite.ts:15-16`). Child Vite vẫn `port: 0` + `strictPort: false` (`ViteChildRunner.ts:133`) — không dual-bind 8001.

**HARD-GATE-NO-SIDE-EFFECTS: KHÔNG TRIGGER.**  
Không có side effect ngoài remap đã spec. Google Console / restart `pnpm run dev` / PWA SW = vận hành đã ghi phase-01, không phải mutation ẩn.

### Mandatory checks

| Check | Verdict | Evidence |
|---|---|---|
| (a) mọi AC | **PASS** | bảng AC dưới |
| (b) không regression blast-radius | **PASS** | auth/Hono/oauth-button/env schema/contract test không đổi logic |
| (c) không breaking public contract | **PASS** | tên env, path OAuth, prod URL, schema, signature giữ. Port local đổi **có chủ đích** |
| (d) theo pattern scout | **PASS** | dual-source Alchemy+Vite; CORS dotenv-only; CI dummy không bind |
| (e) lint/type/build | **PASS (tester)** | tester 21/21, biome 0 err, check-types 0. Reviewer không re-run độc lập (không có shell) |

### Spec compliance

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Worker `dev.port=8000` + `strictPort`; web `8001` + `strictPort` | PASS | `alchemy.run.ts:28-31`, `:53-56` |
| 2 | Vite `server.port=8001` + `strictPort` | PASS | `vite.config.ts:8-10` |
| 3 | `apps/web/.env` `VITE_SERVER_URL=http://localhost:8000` | PASS | grep URL key only, line 1. Không đọc secret |
| 4 | server `.env` `BETTER_AUTH_URL=:8000` + `CORS_ORIGIN=:8001` | PASS | grep URL keys only, lines 2–3 |
| 5 | README local web/API + callback host/port; path giữ | PASS | `:48-49`, `:58-59` path `/api/auth/oauth2/callback/google`. Prod `:60`/`:111` nguyên |
| 6 | auth-client fallback `:8000` | PASS | `auth-client.ts:37`. Nhánh `SERVER_URL`/`VERCEL_*` nguyên |
| 7 | CI dummy `VITE_SERVER_URL: http://localhost:8000` | PASS | `ci.yml:20`. `scripts/ci-workflow.test.mjs:36` vẫn key-only |
| 8 | Historical plans/journals nguyên | PASS | journal CI vẫn `:3000`; plan open-design vẫn “vite port 3001”. Live `apps/`/`packages/`/`README`/`.github`/`scripts` **0** hit `localhost:300[01]` |
| 9 | `pnpm test` / biome / check-types | PASS (tester) | tester report: 21/21, biome exit 0 (7w+2i pre-existing), check-types 4/4 với dummy `:8000` |

Extra vs spec: **không**. Không `.env.example`. Không rewrite `plans/260815-*`, `260816-1559-*`, `260816-1640-*`. Không đụng `mock-data.ts` `price: 300000`.

Alchemy wiring **không** bị đụng: `CORS_ORIGIN: Config.string` (`:22`), `BETTER_AUTH_URL: Cloudflare.Worker.URL` (`:24`), `VITE_SERVER_URL: serverWorker.url` (`:51`).

### Critical Issues

Không.

### High Priority

Không (code).

Ops bắt buộc, **không phải defect code** (đã lock phase-01):

1. Google Cloud Console — thêm redirect `http://localhost:8000` + path **đang đăng ký**. Giữ URI `:3000` lúc chuyển. Nếu JS origin từng list `:3001`, thêm `http://localhost:8001`.
2. Restart `pnpm run dev`. Hard-refresh / unregister PWA SW origin cũ `:3001` (`vite-plugin-pwa` `devOptions.enabled: true`).

### Medium Priority

1. Bind smoke `8000`/`8001` chưa chạy session này. `strictPort` fail-loud nếu occupied — đúng design, chưa chứng minh runtime.
2. `getServerUrl` fallback không có unit test. Path chỉ chạy khi `VITE_SERVER_URL` relative + no `window` + no `VERCEL_*`. CI/dotenv hiện absolute → unused. Đúng plan: không thêm test framework.

### Low Priority

1. `plan.md` AC vẫn `[ ]`, phase table vẫn Pending dù phase files todo `[x]`. Lead cập nhật — reviewer không sửa plan.
2. Magic `8000`/`8001` lặp alchemy/vite/README/CI/fallback. Không extract constant — dual-source + Alchemy inject là design đã lock.

### Edge Cases Found by Scout

| Finding | Action |
|---|---|
| Dependents: `packages/auth` `trustedOrigins`, Hono CORS, `google-oauth-button` `callbackURL=window.location.origin`, `env.VITE_SERVER_URL` `z.url()`, contract test key-only | Verified không sửa logic. CORS phụ thuộc `.env` — URL keys đã 8001 |
| Alchemy **không** inject `CORS_ORIGIN` | `.env` `CORS_ORIGIN=http://localhost:8001` verified |
| Dual bind 8001 (Website.Vite proxy vs `vite.config`) | Child ephemeral `port: 0` + `strictPort: false` (`ViteChildRunner.ts:119-133`). Public URL = WorkerProxy `dev.port`, slash cắt (`LocalWorkerProvider.ts:980`) |
| `strictPort` default false → hop 8 lần, lệch Google/CORS | Đã set `true` Worker + Website.Vite + Vite `server` |
| IPv6 `[::1]:8000` chiếm khi IPv4 trống | Residual collision; `strictPort` crash. Không hop 8100 |
| Historical `localhost:3000` trong plans/journals | Giữ. Không phải contract |
| False positive `price: 300000`, caniuse | Không đụng |
| Scout `.env` “missing” vs listed lines | File tồn tại, gitignored. URL keys 800x |
| Pre-existing OAuth path README `oauth2/` vs better-auth social `${baseURL}/callback/google` (`sign-in.mjs:201`, pin 1.6.27) | **Ngoài scope.** User/plan cấm sửa path. Console follow-up: đăng ký path **đang dùng**, không mù quáng copy README nếu client thật là `/api/auth/callback/google` |
| `dev:bare`/`start` dùng `vite.config` 8001 strict | Đúng. Alchemy path không dùng port này |
| Cookie `sameSite: none` / `secure` | Không liên quan port. Không đụng |
| LAN `worker.urls` `192.168.x.x:8000` | Không đưa vào `CORS_ORIGIN` |

Verified: leftover live source sạch; env names nguyên; preview Vite 4173 nguyên; `scripts/ci-workflow.test.mjs` không assert `:8000`.

### Pre-Landing Review (checklist)

Pre-Landing Review: 0 issues (0 critical, 0 informational blocking)

**CRITICAL:** none — không injection, không race mới (strictPort *giảm* race hop), không endpoint mới, không secret, không IDOR.

**Issues:** none trong suppressions. Test-gap fallback / magic port = accepted design.

Overlays: `base` + `web-app` + `api`. CSRF/XSS/N+1 không apply (không đụng handler/UI authz).

### Positive Observations

Diff hẹp đúng ownership phase 2+3. `strictPort` đúng threat (hop im lặng phá Google/CORS). Website.Vite `strictPort` type-accepted (tester infra `tsc`). Không scope-creep OAuth path.

### Recommended Actions

1. Lead: đánh dấu AC `plan.md` sau review này.
2. Operator: Google Console URI `:8000` (+ JS origin `:8001` nếu cần). Giữ `:3000` đến khi client local chuyển.
3. Operator: restart `pnpm run dev`; confirm log bind 8000/8001, không hop warning; unregister SW nếu cache 3001.
4. Không thêm assert `:8000` vào `ci-workflow.test.mjs`.
5. Không commit `.env`.

### Metrics
- Type Coverage: n/a (không đo)
- Test Coverage: n/a (không có c8/istanbul)
- Tests: 21/21 (tester: 20 vitest + 1 contract)
- Linting Issues: 0 error; 7 warn + 2 info **pre-existing**
- check-types: 0 (tester, dummy `http://localhost:8000`)

### Plan follow-up

- Phase 1–3 execution: **complete về code**. `plan.md` checkbox/status: lead cập nhật.
- Docs impact: **minor** — README local URLs đã sửa. Không có `docs/`. Không cần docs thêm.
- Next: ops Google Console + optional bind smoke. Không còn implement task.

### HARD-GATE-NO-SIDE-EFFECTS

**Verdict: PASS — không trigger.**

Side effect *cố ý* (spec):
- Bind local 3000/3001 → 8000/8001
- CI dummy URL string
- README local URLs
- `.env` URL hosts
- auth-client fallback string

Side effect *không cố ý*: **không có**
- Không sửa `packages/auth`, `apps/server/src`, `google-oauth-button`
- Không đổi tên env / schema / API / cookie
- Không rewrite historical plans
- Không đổi production origin
- Không stage secret

### Unresolved Questions

- Bind smoke 8000/8001 trên máy này chưa chạy.
- Reviewer không re-run `pnpm test` / biome / check-types (runtime không có shell). Dựa tester `plans/reports/tester-2026-08-16-remap-local-dev-ports-to-800x.md`.
- Google Console hiện đăng ký path nào (`/callback/google` vs `/oauth2/callback/google`)?
- `git status` độc lập không lấy được; leftover scan + nội dung file thay cho `git diff`.
