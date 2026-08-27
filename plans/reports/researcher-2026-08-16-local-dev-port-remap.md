# Research: local-dev port remap 3000/3001 → 8000/8001

Date: 2026-08-16  
Repo: teacher-os (Better-T-Stack, Alchemy 2.0.0-beta.72, Better Auth 1.6.27)  
Scope: local `alchemy dev` only. Không implement.

**Khuyến nghị (ranked #1):** API `8000`, web `8001`, **bật `strictPort: true`**. Giữ offset. CI dummy + historical plans **không đổi**.

Scout nền: `plans/reports/scout-2026-08-16-development-port-configuration.md`.

## 1. Phải đổi gì ngoài vite/alchemy `port`?

`pnpm run dev` = turbo `dev` = **chỉ** `packages/infra` (`alchemy dev`). Web/server **không** có script `dev`. Bind thật: Alchemy proxy.

| Phải đổi | Vì sao | Prod? |
|---|---|---|
| `packages/infra/alchemy.run.ts` `dev.port` 3000→8000, 3001→8001 + `strictPort: true` | Public URL = WorkerProxy trên `dev.port` | Không. Deploy dùng workers.dev/domain |
| `apps/web/vite.config.ts` `server.port` 3001→8001 | Dual source: `dev:bare` / `vite` / `start` | Không. Preview default 4173 |
| `apps/server/.env` `CORS_ORIGIN=http://localhost:8001` | Hono CORS + `trustedOrigins`. Alchemy **không** inject origin web | Prod vẫn origin deploy |
| `apps/web/.env` `VITE_SERVER_URL=http://localhost:8000` | Fallback khi không qua Alchemy; `z.url()` | Alchemy inject `serverWorker.url` |
| `apps/server/.env` `BETTER_AUTH_URL=http://localhost:8000` | Human/docs. Runtime worker = `Cloudflare.Worker.URL` (ghi đè `.env`) | Worker URL |
| `README.md` :48–59 | Live onboarding + Google URI local | Prod URI không đổi |
| **Google Cloud Console** redirect URI + (nếu có) JS origin | Google **exact match** host+port+path. `redirect_uri_mismatch` nếu sót | Thêm URI, không xóa prod |

Nên đổi: `apps/web/src/lib/auth-client.ts:37` fallback ``http://localhost:3000`` → `:8000` (chỉ khi `VITE_SERVER_URL` relative + không `window` + không Vercel — hiện unused).

Không đổi:

- Historical `plans/**`, journals, plan-scoped reports (stateful, không phải contract).
- CI `.github/workflows/ci.yml` `VITE_SERVER_URL=http://localhost:3000` — dummy `z.url()`, **không bind**. `scripts/ci-workflow.test.mjs` chỉ assert key tồn tại.
- `mock-data` `price: 300000`, caniuse `1.0.3000…`.
- Cookie `sameSite: none` / `secure` — không liên quan port.

OAuth path (sửa khi đụng Google Console):

- Built-in `socialProviders.google` (repo này) gửi `redirectURI = ${baseURL}/callback/google` → `http://localhost:8000/api/auth/callback/google` (verified `better-auth@1.6.27` `sign-in.mjs` + `callback.mjs`; `withPath` thêm `/api/auth`).
- README/`.env` comment ghi `/api/auth/oauth2/callback/google` — path **generic-oauth plugin**, không phải social Google. Đăng ký path sai + port đúng vẫn fail.

`callbackURL` post-login = `${window.location.origin}/dashboard` — đổi theo web origin tự động nếu `CORS_ORIGIN` khớp.

## 2. Alchemy Worker port caveats

Nguồn: Alchemy Worker.ts + WorkerProxy.ts + LocalWorkerProvider.ts; docs [Workers](https://alchemy.run/cloudflare/compute/workers), [Vite](https://alchemy.run/cloudflare/frontend/vite).

1. **Hai lớp port.** User-facing = WorkerProxy trên `dev.port`. Vite child bind **ephemeral `port: 0`** rồi proxy. `vite.config.ts` **không** là URL Alchemy.
2. **Default không set = 1337**, không phải Wrangler 8787. Không có `wrangler.toml`.
3. **`strictPort` default `false`.** Port bận → hop next (tối đa 8 lần) + warning. Restart race: `waitFor` rồi hunt — có thể **dịch cả stack** (8000 bận → API 8001, web 8002) → `.env` + Google vỡ im lặng. **Bắt buộc `strictPort: true`.**
4. **IPv6 dual-bind.** Proxy giữ `127.0.0.1` **và** `[::1]` vì browser ưu tiên IPv6. Process khác chiếm `::1:8000` = collision dù IPv4 trống.
5. **`Worker.URL` local** = proxy URL, **cắt trailing slash** (`LocalWorkerProvider.ts` `replace(/\/$/, "")`). `BETTER_AUTH_URL` + `VITE_SERVER_URL` Alchemy **tự theo port mới**. `CORS_ORIGIN` **không** tự theo — phải sửa `.env`.
6. `worker.urls` còn LAN (`http://192.168.x.x:8000`). Đừng đưa LAN vào `CORS_ORIGIN` trừ khi cố ý.
7. `alchemy dev` bind cloud resources thật (D1/auth secrets) — đổi port không đổi binding cloud.
8. Không tương thích `@cloudflare/vite-plugin` trong `vite.config.ts` (repo không có — OK).

## 3. Historical plan reports?

**Để nguyên.** `documentation-management`: plans/reports là record, không phải authority. Rewrite 3000→8000 làm lịch sử CI/test giả. Live contract = README + alchemy + `.env` + Google Console.

## 4. Mapping ranked + rủi ro 8000

| Rank | Map | Fit | Risk |
|---|---|---|---|
| **1** | **8000 / 8001 + `strictPort`** | Đúng đề xuất, offset +1, 800x, đổi tối thiểu | 8000 = default FastAPI/Uvicorn ([docs](https://fastapi.tiangolo.com/tutorial/first-steps/)), Django `runserver`, `python -m http.server`. **Không** reserved macOS (5000/7000 mới là AirPlay). 8001 ít đụng hơn |
| 2 | 8100 / 8101 + `strictPort` | Cùng họ 800x, ít Python collision | Lệch “số tròn”; vẫn phải đổi Google/README |
| 3 | 8787 / 8788 | CF/Wrangler quen | Đụng `wrangler dev` nếu chạy song song |
| 4 | Giữ 3000 / 3001 | Zero churn | Không đạt mục tiêu 800x; 3000 vẫn đụng Next/CRA |

**Chọn #1** nếu `lsof -nP -iTCP:8000 -sTCP:LISTEN` và `:8001` trống. Occupied → #2, đừng tắt `strictPort`.

Google docs dùng ví dụ `http://localhost:8080` — 8080 đông hơn 8000 (Tomcat/proxy). Tránh 8080.

### Trade-off

| Dim | 8000/8001+strict | 8100/8101+strict | Giữ 3000/3001 |
|---|---|---|---|
| Performance | = | = | = |
| Complexity | Thấp (config + Console) | Thấp | Không |
| Maintenance | 1 dual-source (alchemy + vite) | Giống | Dual 3001 sẵn có |
| Collision | Trung bình (Python) | Thấp | Trung bình (Node 3000) |
| OAuth | Phải thêm URI | Phải thêm URI | Không |
| Cost | 0 | 0 | 0 |

Adoption: Alchemy vẫn beta nhưng **đã** là stack. Remap = config. Breaking-change history không liên quan. Abandonment: thấp cho thao tác này.

## Implement checklist (khi làm)

1. `lsof` 8000/8001.
2. Alchemy ports + `strictPort: true` cả Worker và Website.Vite.
3. `vite.config.ts` 8001.
4. `.env` CORS + VITE + BETTER_AUTH_URL.
5. README origins + sửa path callback nếu còn `oauth2/`.
6. Google: thêm `http://localhost:8000/api/auth/callback/google` (và `oauth2/` nếu Console cũ dùng). Giữ URI 3000 lúc chuyển. JS origin `http://localhost:8001` nếu đã list 3001.
7. Restart `pnpm run dev`. Confirm log đúng 8000/8001, không warning hop.
8. Unregister PWA SW / hard refresh (`devOptions.enabled: true`).
9. Smoke: `/` API OK, web load, Google sign-in, CORS credentialed.

## Sources (credibility)

| Source | Weight |
|---|---|
| Installed Alchemy 2.0.0-beta.72 Worker.ts / WorkerProxy.ts / LocalWorkerProvider.ts | Highest (runtime) |
| [alchemy.run Workers](https://alchemy.run/cloudflare/compute/workers), [Vite](https://alchemy.run/cloudflare/frontend/vite) | Official |
| better-auth 1.6.27 `callback.mjs` / `sign-in.mjs` / `url.mjs` | Highest (this pin) |
| [Google OAuth web-server](https://developers.google.com/identity/protocols/oauth2/web-server) exact `redirect_uri` | Official |
| [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/) :8000 | Official |
| Scout 2026-08-16 port map | Repo inventory |
| ak-better-auth skill | Secondary (docs template vẫn :3000) |

## Limitations

- Không chạy `lsof` / không start `alchemy dev` (không có shell; research-only).
- Không đọc Google Cloud project thật.
- better-auth.com HTML fetch mỏng; path callback lấy từ package đã pin.
- Không audit cookie Secure trên `http://localhost` (ngoài scope).

## Unresolved

1. Máy này 8000/8001 đang listen chưa?
2. Google client đang đăng ký `/callback/google` hay `/oauth2/callback/google`?
3. Có Authorized JavaScript origin `localhost:3001` không?

## Next

Implementer: `lsof` → Alchemy+strictPort → `.env` → README → Google URI. Không đụng `plans/**` cũ. CI để 3000.
