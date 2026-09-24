# Scout Report: auth & role hiện trạng (2026-09-24)

## Cấu trúc monorepo (pnpm workspace + turbo)

- `apps/web` — Teacher app: React + Vite + TanStack Router/Query (SPA), dev port **8001**.
- `apps/student` — Student portal: cùng stack, dev port **8003**, có Cloudflare Worker riêng (`apps/student/src/worker.ts`).
- `apps/server` — API: Hono trên Cloudflare Workers + Drizzle ORM trên D1, dev port 8000.
- `apps/e2e` — Playwright (chỉ serve web app; portal chưa có trong e2e webServer).
- Packages: `api` (zod contracts), `auth` (better-auth wrapper), `db` (schema + migrations), `infra` (topology), `env`, `ui`, `config`.

## Auth

- `packages/auth/src/index.ts:43-101` — better-auth **1.6.27** (catalog), email/password + Google OAuth, session cookie `SameSite=None; Secure; HttpOnly`, `crossSubDomainCookies` + `cookiePrefix` staging (issue #125).
- `apps/server/src/app.ts:138` — mount `POST|GET /api/auth/*`.
- Cả 2 app dùng chung auth server: `apps/web/src/lib/auth-client.ts:42-44`, `apps/student/src/lib/auth-client.ts:42-44` → cùng bảng `user`, cùng cookie zone (`Domain=.<domain>`, `packages/infra/src/topology.ts:96`).
- Google button 2 app (`apps/web/src/components/google-oauth-button.tsx`, `apps/student/src/components/auth/google-oauth-button.tsx`) — `signIn.social({ provider, callbackURL: <own origin> })`, chưa có `additionalData`/`errorCallbackURL`.
- Login error surfacing: toast qua `authErrorMessage` (`apps/student/src/lib/auth-error.ts`) — message server survive nguyên văn.

## Data model

- `packages/db/src/schema/auth.ts:4-19` — `user`: **KHÔNG có cột role**.
- `packages/db/src/schema/membership.ts:12-31` — `membership.role` default `"teacher"`; chỉ `"teacher"` từng được ghi (`app.ts:77`).
- `packages/db/src/schema/student.ts:15-41` — `student` là domain row; unique expression index `student_email_uq` trên `lower(trim(email))` (migration 0023).
- Provisioning: `apps/server/src/student-provisioning.ts:13-64` — `provisionStudentForUser` (org sớm nhất toàn cục, fail-open per D7 #257). KHÔNG tạo membership, KHÔNG gán role.

## Guards hiện tại

- `apps/server/src/app.ts:44-90` — `bootstrapMiddleware`: mọi `/api/*` (trừ `/api/auth/*`, `/api/student*`) với user đã login chưa có membership → tự tạo org + membership `teacher`. **Không có role check nào.** Học viên portal đăng ký xong mở teacher app là có workspace.
- Bridge portal: `apps/server/src/routes/student.ts:43-141` — `requireStudent`: match student row theo `lower(trim(email))`, tự provision nếu verified; teacher trùng email student row vẫn vào được portal.
- Client guard chỉ check session tồn tại: `apps/web/src/routes/_auth/route.tsx:5-22`, `apps/student/src/routes/_auth/route.tsx:4-16`.
- Web global 401: `apps/web/src/lib/query-client.ts` QueryCache.onError → `reauth()`; blocking error UI ở `apps/web/src/lib/data-provider.tsx:148-155`.
- Portal error view theo `code`: `apps/student/src/components/overview/student-error-view.tsx` (NOT_LINKED / EMAIL_UNVERIFIED / AMBIGUOUS).

## Env / topology

- Prod: `CORS_ORIGIN` default = `app.<domain>,student.<domain>` (`packages/infra/alchemy.run.ts:54-57`); dev default `http://localhost:8001,http://localhost:8003`.
- `packages/env/env.d.ts` khai báo worker env typing; `apps/server/.env` (dev) chưa có CORS_ORIGIN/STUDENT_*.

## Tests

- Server: vitest, `buildApp(deps)` DI + libsql in-memory + migrations thật (`auth-roundtrip.test.ts`, `student.test.ts`, `student-provisioning.test.ts`); migration test pattern `student-email-unique-migration.test.ts`.
- E2E: boot shim `apps/e2e/src/boot.ts` (real better-auth + libsql + `apps/e2e/local.db`), helpers `signUpViaUi`/`seedStudent`; portal UI chưa có trong e2e (giới hạn chấp nhận từ #257 với Google dummy creds).

## Docs

- `docs/project-overview-pdr.md` (dòng 14 bootstrap rule, 22-23 auth boundary + student origin), `docs/system-architecture.md`, `docs/code-standards.md` (ownership + persist-vs-derive).

## Risks chốt

1. `bootstrapMiddleware` tự cấp teacher workspace cho mọi user mới → hole chính plan này vá.
2. Cookie zone dùng chung → login portal tạo session hợp lệ ngay trên `app.<domain>` → bắt buộc gate API, không chỉ chặn form login.
3. Server hiện không biết signup đến từ app nào → cần Origin classifier (+ additionalData cho OAuth callback).
4. Bridge match theo email không theo role → teacher trùng email học viên vào được portal.
