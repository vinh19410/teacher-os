# Phase 5 — Scaffold `apps/admin` và wiring hạ tầng

## Context

`apps/student` là mẫu gọn nhất của một SPA Vite + TanStack Router + worker tĩnh: `vite.config.ts` (port cố định `strictPort`), `src/worker.ts` (assets, route matcher, security headers), `routes/__root.tsx`, `routes/login.tsx`, `routes/_auth/route.tsx` (guard session), `lib/auth-client.ts`, `lib/query-client.ts`. Cổng hiện dùng: 8000 api, 8001 web, 8002 landing, 8003 student; e2e dùng 8100/8101/8103. Admin lấy **8004** (dev) và **8104** (e2e); đã grep mã nguồn ngày 2026-10-22, hai cổng này chưa được dùng ở đâu.

## Requirements

- `apps/admin`: package `admin`, scripts giống student (`build`, `serve`, `check-types`, `dev:bare`, `test`).
- Đăng nhập: form email/mật khẩu + nút Google (tái dùng `@teacher-os/ui` `auth-split-layout`). Không có link đăng ký công khai trong UI; form đăng ký nằm ở route `/register` (không link từ đâu), server vẫn chặn mọi email ngoài `ADMIN_EMAILS` nên route này chỉ phục vụ bootstrap admin đầu tiên. Quên mật khẩu dùng lại luồng reset hiện có.
- `_auth` guard: `authClient.getSession()` rồi gọi `GET /api/admin/me` (trả `{email, name}` nếu qua `requireAdmin`); 401/403 → về `/login` kèm thông báo đúng mã lỗi (`ROLE_MISMATCH`, `NOT_ADMIN`).
- Shell: sidebar một mục "Thư viện đề" (`/library/tests`), header có tên admin và nút đăng xuất. Theo `DESIGN.md` (token từ `packages/ui/src/styles/globals.css`, Geist, light mặc định).
- Worker: security headers đầy đủ như student; CSP cho phép `connect-src` tới API origin và `media-src` tới API origin (audio phát qua `<audio src=API>`).
- Infra: `Cloudflare.Website.Vite("admin", …)` với domain `topology.adminHost`, dev port 8004, `VITE_SERVER_URL` như student.
- Dev tooling: root script `dev:admin`; `devserver-services.mjs` + `playwright.config.ts` + `devserver-watchdog.mjs` thêm service `admin` (port `E2E_ADMIN_PORT`, mặc định 8104); `scripts/devserver-watchdog.test.mjs` cập nhật; `turbo` tự nhận workspace; `design-compare` chưa cần.
- CI/Deploy: `deploy.yml`, `deploy-staging.yml`, `e2e.yml` đã suy ra từ `APP_DOMAIN`; kiểm từng file xem có liệt kê host/app cứng (student) cần thêm admin; `scripts/ci-workflow.test.mjs` phải xanh.

## Files

Tạo toàn bộ `apps/admin/` (copy cấu trúc student, bỏ code đặc thù student): `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `components.json`, `src/{main.tsx,index.css,worker.ts,routeTree.gen.ts(auto)}`, `src/lib/{auth-client,query-client,api,auth-error}.ts`, `src/routes/{__root,login,register,forgot-password,reset-password}.tsx`, `src/routes/_auth/route.tsx`, `src/routes/_auth/index.tsx` (redirect `/library/tests`), `src/components/layout/admin-shell.tsx`.
Sửa: `package.json` gốc (`dev:admin`), `packages/infra/alchemy.run.ts` (worker admin, output), `apps/e2e/{devserver-services.mjs,playwright.config.ts,devserver-watchdog.mjs}`, `scripts/devserver-watchdog.test.mjs`, workflows nếu cần, `AGENTS.md` (mục "Lưu ý vận hành": cổng admin 8004/8104).

## Steps

1. `grep -rn "8004\|8104"` toàn repo (loại `node_modules`, `plans`, `dist`) để xác nhận cổng trống.
2. Dựng skeleton từ student, chạy `pnpm install` để workspace nhận `apps/admin`.
3. Làm login + guard trước (test đơn vị cho auth-error mapping), rồi shell.
4. Nối infra và dev/e2e services; chạy `pnpm dev:admin`, đăng nhập thử bằng tài khoản admin seed local (cấp qua `ADMIN_EMAILS` trong `apps/server/.env`).
5. Cập nhật watchdog test và chạy toàn bộ `pnpm test`.

## Validation

```bash
pnpm --filter admin test && pnpm --filter admin check-types && pnpm --filter admin build
node --test scripts/devserver-watchdog.test.mjs scripts/ci-workflow.test.mjs scripts/topology-drift.test.mjs
pnpm check && pnpm build
```

Pass khi: app khởi động đúng cổng 8004, đăng nhập admin vào được shell, teacher bị chặn đúng thông báo, mọi test script gốc xanh, watchdog nhận 4 service.

## Risks / Rollback

- Thêm service thứ tư vào e2e làm tăng áp lực bộ nhớ (xem ghi chú vite 8 rolldown abort trong `AGENTS.md`): chỉ khởi động service admin khi spec cần, nếu `buildServices` cho phép; nếu không thì chấp nhận 4 vite. Theo dõi `[dev-watchdog]`.
- Rollback: xóa `apps/admin` và các dòng wiring; infra không dùng sẽ bị `alchemy` destroy ở deploy kế tiếp, nên **không** deploy phase này riêng lẻ lên prod trước khi phase 6 xong.
