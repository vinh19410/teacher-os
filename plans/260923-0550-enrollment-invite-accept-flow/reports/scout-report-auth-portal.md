# Scout Report — Auth & Student Portal Readiness

Ngày scout: 2026-09-23.

## Auth core (Better Auth)

- `packages/auth/src/index.ts` — `createAuth()` (43-99): Better Auth + `drizzleAdapter` (`provider: "sqlite"`), Google social provider (54-59), `emailAndPassword.enabled: true` (60-62), cookie `sameSite: none, secure, httpOnly` (77-82), cross-subdomain cookies + cookiePrefix (86-96).
- `packages/auth/src/topology.ts` — `authBaseURL()`, `authCookiePrefix()`, `crossSubDomainCookieDomain()`.
- `packages/db/src/schema/auth.ts` — bảng chuẩn Better Auth: `user` (4-19), `session` (21-40), `account` (42-70), `verification` (72-88). **Không có cột role trên user.**

## Roles

- `packages/db/src/schema/membership.ts` (22) — `role: text("role").notNull().default("teacher")`. Chỉ có role "teacher", không có enum, không có role "student".
- `apps/server/src/app.ts` — `bootstrapMiddleware` (43-85): mỗi user mới tự động được tạo org + membership role "teacher" (dòng 72); mount `/api/auth/*` → Better Auth handler (133), `/api/*` → kernel routes (138).
- `apps/server/src/session.ts` (16-25) — `getSessionUser(auth, headers)`; `apps/server/src/index.ts` — memoize auth + db, bind D1 (17-39).
- Kernel routes: không có `requireRole`; middleware Origin/CSRF cho POST (`kernel.ts:137-148`, Origin phải === corsOrigin), `unauthorized()` 401 (150-152), mọi route lấy `c.get("kernelCtx") = {orgId, userId}`.

## Student portal hiện trạng

- **Chưa tồn tại**: không có apps/student, không có route group `/student` trong apps/web. `open-design/student-portal-prompt.md` là design prompt (màn hình home portal: lớp của tôi + bài tập, mobile-first, Vietnamese, Apple-style) — chưa có code.
- `student` chưa link `user`; mọi user đăng ký qua `/api/auth/*` đều bị bootstrap thành teacher + org riêng → student login cần thiết kế riêng (thuộc project portal).

## Web app

- `apps/web/src/routes/_auth/route.tsx` (5-22) — guard `beforeLoad` gọi `authClient.getSession()`, không session → redirect `/login?returnUrl=...`. Không check role.
- `apps/web/src/lib/auth-client.ts` — `createAuthClient` từ `better-auth/react`, baseURL `/api/auth`; `apps/web/src/components/sign-in-form.tsx` (42-43) `authClient.signIn.email()`.
- Data fetching: TanStack Query + pattern "1 snapshot GET /api/kernel + POST commands": `apps/web/src/lib/repos/kernel.ts` (GET snapshot 430-450, `postKernelCommand()` 360-380, `credentials: "include"`, query key `["kernel"]`).

## Infra / DB

- DB là **Cloudflare D1 (SQLite)**: `packages/db/src/index.ts` `drizzle(env.DB)` từ `drizzle-orm/d1`; migrations trong `packages/db/src/migrations/`.
- `packages/infra/alchemy.run.ts` — D1 (60), server Worker (64), web Vite site (100), landing static (125); topology `app.<domain>` / `api.<domain>` (`packages/infra/src/topology.ts`).
- UI: `packages/ui` (shadcn + Tailwind v4) + app components `apps/web/src/components/ui/` (badge, modal, tabs…).

## Risks cho seam portal sau này

1. CORS/Origin: POST kernel yêu cầu Origin === corsOrigin; portal trên subdomain khác phải được thêm vào trusted origins khi triển khai.
2. Cookie cross-subdomain đã có sẵn (`crossSubDomainCookieDomain`) — portal cùng apex domain sẽ dùng được session.
3. Authorization accept endpoint: hiện chỉ org-scoped; khi student auth có mặt, cần kiểm chứng user gọi accept là chủ của enrollment (student↔user link) — thuộc project portal.
4. Mọi user đăng ký mới bị bootstrap thành teacher/org — student login không thể đi qua `/api/auth/*` mặc định mà không tách đường.
