# Scout Report — Student Portal App (260923-0641)

Bằng chứng thu thập trực tiếp từ codebase (tất cả path tương đối repo root). Dùng làm context chung cho mọi phase.

## 1. Monorepo & tooling

- pnpm workspaces (`apps/*`, `packages/*`) + Turborepo (`pnpm-workspace.yaml`, `turbo.json`). Thêm app mới vào `apps/` là đủ để turbo build/test/check-types tự bao phủ.
- Catalog deps: react 19, tailwindcss 4, better-auth 1.6.27, tanstack router/query, vite 8 (`pnpm-workspace.yaml` catalog).
- Biome toàn repo (`biome.json`) — không cần đổi (không có ignore theo app).
- Root scripts (`package.json`): `dev:web` = `turbo run dev -F web --`, `dev:landing` = `turbo run dev -F landing --` → thêm `dev:student` tương tự.
- CI `.github/workflows/ci.yml`: `pnpm exec biome check .` + `pnpm test` + `pnpm check-types` + `pnpm build` — chạy qua turbo, tự bao phủ app mới. CI env có `VITE_SERVER_URL=http://localhost:8000`.
- `scripts/ci-workflow.test.mjs` chỉ assert `apps/web/package.json`; `scripts/topology-drift.test.mjs` đọc port trong `apps/web/vite.config.ts` (dòng 30–32) — không phá vỡ khi thêm app; có thể mở rộng assert port 8003.

## 2. Precedent thêm app

- `apps/landing` là static HTML (build/serve bằng node script, `apps/landing/package.json` 3 scripts) — **không** phải precedent React cho student portal.
- Blueprint đúng cho student portal = **apps/web** (Vite + React 19 + TanStack Router + Query + Tailwind v4 + packages/ui).

## 3. apps/web (blueprint)

- `apps/web/package.json`: deps gồm `@teacher-os/{api,auth,env,ui}` workspace, `@tanstack/react-{query,router}`, `@tailwindcss/vite`, `better-auth`, `lucide-react`, `sonner`, `zod`; dev: `@tanstack/router-plugin`, `@vitejs/plugin-react`, `vite`, `vitest`.
- `apps/web/vite.config.ts`: `server.port: 8001, strictPort: true`; plugins `tailwindcss()` + `tanstackRouter({target:"react", autoCodeSplitting:true})` + `react()` + spa404Plugin (custom, dùng `./src/routes-matcher`).
- `apps/web/tsconfig.json`: `paths: {"@/*": ["./src/*"], "@teacher-os/ui/*": ["../../packages/ui/src/*"]}`, strict, jsx react-jsx, moduleResolution Bundler.
- `apps/web/index.html`: `<div id="app">`, `lang="vi"`, `/src/main.tsx`.
- `apps/web/src/main.tsx`: QueryClientProvider (`createKernelQueryClient` từ `lib/query-client`) + RouterProvider + devtools.
- `apps/web/src/index.css` dòng 1: `@import "@teacher-os/ui/globals.css";`
- `apps/web/vitest.config.ts`: node env + tsconfigPaths.
- Router: file-based `apps/web/src/routes/`; `_auth/route.tsx` guard `beforeLoad` → `authClient.getSession()`, không có session thì `redirect({to:"/login", search:{returnUrl: location.href}})`; layout render `<AppShell/>`.
- Login: `routes/login.tsx` (validateSearch `returnUrl`, tabs signin/signup, `BrandPanel`, `GoogleOAuthButton`, `SignInForm`, `SignUpForm`,Loader khi `useSession` pending).
- Auth client: `apps/web/src/lib/auth-client.ts` — `createAuthClient({ baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)) })`, env từ `@teacher-os/env/web` (`VITE_SERVER_URL`, z.url()).
- `apps/web/src/worker.ts`: worker entry cho deploy `Cloudflare.Website.Vite` — chặn dotfile, robots.txt, serve assets, SPA fallback 404 branded, security headers (dùng `./routes-matcher` + `./security-headers`).

## 4. packages/auth & session

- `packages/auth/src/index.ts`: `createAuth(input)` → betterAuth drizzle adapter sqlite; `trustedOrigins: [input.corsOrigin]` (array); social google + email/password enabled; `advanced.defaultCookieAttributes` SameSite=None Secure (cross-subdomain).
- `packages/auth/src/topology.ts`: `authBaseURL`, `authCookiePrefix`, `crossSubDomainCookieDomain` (issue #125: staging dùng prefix `teacheros-staging`).
- Session: `apps/server/src/session.ts` → `getSessionUser(auth, headers)` trả `{userId, userName, ...}` (SessionUser).

## 5. DB schema (packages/db/src/schema/)

- `auth.ts`: `user` (id, name, email unique, image, ...) — **không có cột role**.
- `membership.ts` + `apps/server/src/app.ts` bootstrapMiddleware: mọi user mới login được tự tạo org + membership `role:"teacher"` (dòng 47–80). → Học viên login (nếu chỉ dựa membership) sẽ bị coi là teacher org riêng — student route phải tự resolve, KHÔNG dùng kernelCtx.
- `student.ts`: `student` (id, orgId, name, phone, **email** — docblock dòng 18–21: "Email học viên — danh tính đăng nhập tương lai (username)... Chưa unique + chưa có user row — dành cho plan student-login sau này"), zalo, parentName/Phone, createdAt. **Bridging qua email là chủ đích thiết kế sẵn của repo.**
- `enrollment.ts`: unique (classId, studentId), index studentId.
- `class.ts`: name, level, type, skills, mode, syllabusId, schedule (text), sessionsTotal, sessionsDone, status, startDate, tuitionFee.
- `lesson.ts`: classId, enrollmentId, day, time, dur, `date` (yyyy-mm-dd occurrence identity, NULL = legacy), status, topic — buổi học thực diễn.
- `assignment.ts`: per-student grading rows (studentId, title, type, due, status default "not-submitted", `scores` JSON {task, coherence, lexical, grammar} — chỉ ghi qua grade endpoint).
- `class-assignment.ts`: `classAssignment` (lượt giao đề ngân hàng cho lớp: classId, promptId, title snapshot, due ISO yyyy-mm-dd, note) + `classAssignmentTarget` (assignmentId, studentId, `submittedAt` null | ISO). Trạng thái nộp sống ở target.submittedAt.
- Invoice/report/session-package có studentId FK — không cần cho scope này.

## 6. Server API hiện tại

- `apps/server/src/app.ts`: `buildApp(deps)` với `AppDeps {getDb, corsOrigin, getSessionUser, authHandler}`; middleware: logger → secureHeaders → https redirect → **cors** (`origin: deps.corsOrigin` — string đơn) → `/api/*` bootstrapMiddleware → auth handler `/api/auth/*` → `/readyz` → `kernelRoutes`.
- `apps/server/src/routes/kernel.ts:2080-2083`: mount assignments/reports/notifs/comment-bank; endpoints chính: GET /kernel, /students, /classes, /invoices, /syllabi + POST mutations — **tất cả org-teacher-scoped qua kernelCtx**. Không có endpoint nào student-scoped.
- `apps/server/src/index.ts`: `createAuth({corsOrigin: env.CORS_ORIGIN, ...})` + `buildApp({corsOrigin: env.CORS_ORIGIN, ...})` — env từ `cloudflare:workers` (alchemy Config), **CORS_ORIGIN là 1 origin duy nhất**.
- Tests: `apps/server/src/*.test.ts` (vitest node env) dùng `buildApp` + libsql fake deps (`kernel.test.ts`, `auth-roundtrip.test.ts`, `security.test.ts`, `student-identity-migration.test.ts` kiểm migration 0021 student email).

## 7. packages/ui & env

- `packages/ui/package.json` exports: `./globals.css`, `./lib/*`, `./components/*`, `./hooks/*`, `./postcss.config`. Components: attachment, button, card, checkbox, dropdown-menu, empty, input, input-group, label, skeleton, sonner, textarea, tooltip... → student app import y hệt web (`@teacher-os/ui/components/button`).
- `packages/env/src/web.ts`: `VITE_SERVER_URL` (clientPrefix VITE_) — student app reuse trực tiếp.

## 8. Infra & topology

- `packages/infra/src/topology.ts`: `resolveDomainTopology(appDomain)` → appHost `app.<domain>`, apiHost, landingHost (apex), cookieDomain `.domain`, authCookiePrefix (staging). **Chưa có student host/origin.**
- `packages/infra/alchemy.run.ts`: `serverWorker` (api) → `Cloudflare.Website.Vite("web", rootDir ../../apps/web, main src/worker.ts, env VITE_SERVER_URL, dev port 8001)` → `StaticSite("landing", dev url 8002)`. Guard dòng 44–48: CORS_ORIGIN explicit phải khớp `topology.appOrigin` — sẽ cần nới cho student origin.
- Ports: 8000 api, 8001 web, 8002 landing → **8003 free** cho student.
- Google OAuth redirect URI: `api.<domain>/api/auth/callback/google` — không đổi; student origin chỉ cần vào `trustedOrigins` để callback redirect về được.

## 9. Design contract

- `open-design/student-portal-prompt.md`: home screen học viên (greeting tên + ngày VN + summary line; "Lớp học của tôi" card: name/level chip/mode chip/lịch tuần/progress "Buổi 12/24"/buổi tới; "Bài tập" tabs Tất cả/Sắp đến hạn/Quá hạn/Đã nộp, status chip + due tương đối + điểm band; empty states; mobile-first 360–1920; touch ≥44px; a11y; VN copy; màu accent #0071e3, bg #f5f5f7...; icons Lucide). Read-only, chỉ data của chính học viên.

## 10. Khoảng trống quyết định thiết kế

1. **Bridge user↔student**: theo docblock `student.email` → resolve bằng email khớp (Google login cho email verified; email/password user tự đăng ký trùng email). Không migration DB trong plan này (email chưa unique — resolver chọn deterministic earliest id; ghi risk).
2. **Bootstrap middleware** vẫn tự tạo teacher membership cho user học viên — vô hại (read-only portal), chỉ ghi risk, không sửa trong plan này.
3. **CORS/trustedOrigins** phải thành multi-origin (comma-separated) —backward compat 1 origin.
4. SPA 404 worker của web: student v1 dùng worker mỏng (dotfile + assets + SPA fallback + security headers), không copy robots/host-redirect của web.
